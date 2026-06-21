/**
 * Literal A2A redelegation, redeemed on-chain via 1Shot (the "Best A2A" proof).
 *
 * Builds a real TWO-HOP delegation chain and redeems it through the 1Shot
 * relayer — authority only ever narrows:
 *
 *   User (root, full budget)
 *     └─ROOT_AUTHORITY delegation→ Researcher agent
 *          └─redelegation (parentDelegation = root, NARROWED budget)→ 1Shot relayer target
 *
 * The relayer redeems the chain [researcherRedelegation, userRootDelegation] and
 * executes USDC transfers out of the User's account — gasless, gas paid in USDC.
 * This is the redelegation the SDK exposes via createDelegation({ parentDelegation }),
 * not a UI mock.
 *
 * Defaults to BASE mainnet (chainId 8453): one run then proves BOTH "Best A2A"
 * (on-chain redelegation) AND "Best 1Shot" (mainnet 7710 relay + EIP-7702) for
 * ~$0.10 of USDC. Override CHAIN_ID=11155111 to run free-ish on Sepolia testnet.
 *
 * Run:
 *   USER_PRIVATE_KEY=0x... RESEARCHER_PRIVATE_KEY=0x... node scripts/test-redelegation-1shot.mjs
 *   # USER must hold a little USDC on the chosen chain. RESEARCHER needs no funds (it only signs).
 *   # optional: CHAIN_ID=10 (Optimism) | 42161 (Arbitrum) | 11155111 (Sepolia testnet)
 */
import { randomBytes } from "node:crypto";
import {
  Implementation,
  ScopeType,
  createDelegation,
  toMetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import { createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism, arbitrum, sepolia } from "viem/chains";
import { bytesToHex } from "viem/utils";

const CHAINS = { 8453: base, 10: optimism, 42161: arbitrum, 11155111: sepolia };
const DEFAULT_RPC = {
  8453: "https://base-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
};
const chainId = Number(process.env.CHAIN_ID ?? 8453);
const chain = CHAINS[chainId];
if (!chain) throw new Error(`unsupported CHAIN_ID ${chainId}`);
const isTestnet = chainId === 11155111;
const RELAYER =
  process.env.ONESHOT_RELAYER_URL ??
  (isTestnet ? "https://relayer.1shotapi.dev/relayers" : "https://relayer.1shotapi.com/relayers");
const RPC = process.env.RPC_URL ?? DEFAULT_RPC[chainId];
let _id = 0;
async function rpc(method, params) {
  const res = await fetch(RELAYER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.code} ${json.error.message}`);
  return json.result;
}
function toRelayerJson(v) {
  if (typeof v === "bigint") return `0x${v.toString(16)}`;
  if (v instanceof Uint8Array) return `0x${Buffer.from(v).toString("hex")}`;
  if (Array.isArray(v)) return v.map(toRelayerJson);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = toRelayerJson(val);
    return o;
  }
  return v;
}
const freshSalt = () => bytesToHex(Uint8Array.from(randomBytes(32)));

const userPk = process.env.USER_PRIVATE_KEY;
const researcherPk = process.env.RESEARCHER_PRIVATE_KEY;
if (!userPk || !researcherPk) throw new Error("set USER_PRIVATE_KEY and RESEARCHER_PRIVATE_KEY");

const userEoa = privateKeyToAccount(userPk);
const researcherEoa = privateKeyToAccount(researcherPk);
const publicClient = createPublicClient({ chain, transport: http(RPC) });

console.log("\n── A2A redelegation via 1Shot ──");
console.log("chain:", chain.name, `(${chainId})`, "| relayer:", RELAYER);
console.log("User (root):", userEoa.address);
console.log("Researcher  :", researcherEoa.address);

const caps = (await rpc("relayer_getCapabilities", [String(chain.id)]))[String(chain.id)];
console.log("relayer target:", caps.targetAddress, "| feeCollector:", caps.feeCollector);
const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
const decimals = Number(usdc.decimals);

const fee = await rpc("relayer_getFeeData", { chainId: String(chain.id), token: usdc.address });
const nativeCost = 250_000n * BigInt(fee.gasPrice);
const convertedAtoms = BigInt(Math.ceil((Number(nativeCost) / 1e18) * fee.rate * 10 ** decimals));
const minFeeAtoms = parseUnits(fee.minFee, decimals);
const feeAmount = convertedAtoms > minFeeAtoms ? convertedAtoms : minFeeAtoms;
const workAmount = parseUnits(process.env.WORK_USDC ?? "0.01", decimals);
const rootBudget = feeAmount + workAmount; // full budget the user grants
const narrowed = (feeAmount + workAmount); // researcher's redelegated slice (≤ root) — equal here, must cover the executions
console.log("rootBudget:", rootBudget.toString(), "| narrowed:", narrowed.toString());

const userSA = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: userEoa.address,
  signer: { account: userEoa },
});
const researcherSA = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: researcherEoa.address,
  signer: { account: researcherEoa },
});
const env = userSA.environment;

// ── Hop 1: User → Researcher (ROOT_AUTHORITY, full budget) ──
const rootDelegation = createDelegation({
  environment: env,
  from: userSA.address,
  to: researcherSA.address,
  salt: freshSalt(),
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc.address, maxAmount: rootBudget },
});
const rootSig = await userSA.signDelegation({ delegation: rootDelegation });
const signedRoot = { ...rootDelegation, signature: rootSig };
console.log("✓ hop 1 signed: User → Researcher (root)");

// ── Hop 2: Researcher → relayer target (parent = root, NARROWED) ──
const redelegation = createDelegation({
  environment: env,
  from: researcherSA.address,
  to: caps.targetAddress,
  parentDelegation: signedRoot,
  salt: freshSalt(),
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc.address, maxAmount: narrowed },
});
const reSig = await researcherSA.signDelegation({ delegation: redelegation });
const signedRedelegation = { ...redelegation, signature: reSig };
console.log("✓ hop 2 signed: Researcher → relayer (redelegation, parent=root)");

// Chain is leaf-first: [researcherRedelegation, userRootDelegation]
const permissionContext = [signedRedelegation, signedRoot].map(toRelayerJson);

// ── EIP-7702 authorizations for BOTH signers (first use) ──
async function auth(eoa) {
  const impl = env.implementations.EIP7702StatelessDeleGatorImpl;
  const nonce = await publicClient.getTransactionCount({ address: eoa.address, blockTag: "pending" });
  const a = await eoa.signAuthorization({ chainId: chain.id, contractAddress: getAddress(impl), nonce });
  return { address: a.address, chainId: a.chainId, nonce: a.nonce, r: a.r, s: a.s, yParity: a.yParity ?? 0 };
}
const authorizationList = [await auth(userEoa), await auth(researcherEoa)];
console.log("✓ EIP-7702 authorizations for User + Researcher");

// USDC balance guard (executions move the USER's funds).
const bal = await publicClient.readContract({ address: usdc.address, abi: erc20Abi, functionName: "balanceOf", args: [userEoa.address] });
console.log("User USDC balance:", (Number(bal) / 10 ** decimals).toFixed(6));
if (bal < rootBudget) throw new Error(`User needs ≥ ${rootBudget} USDC atoms on ${chain.name} (have ${bal}). Fund ${userEoa.address}.`);

const feeCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [caps.feeCollector, feeAmount] });
const workCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", workAmount] });

const taskId = await rpc("relayer_send7710Transaction", {
  chainId: String(chain.id),
  context: fee.context,
  authorizationList,
  memo: "kuot-redelegation",
  transactions: [
    {
      permissionContext,
      executions: [
        { target: usdc.address, value: "0", data: feeCalldata },
        { target: usdc.address, value: "0", data: workCalldata },
      ],
    },
  ],
});
const id = typeof taskId === "string" ? taskId : (taskId.TaskId ?? taskId);
console.log("\n✅ redelegation chain redeemed via 1Shot — TaskId:", id);
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await rpc("relayer_getStatus", [id]);
  console.log("status:", JSON.stringify(s));
  if (["Confirmed", "Rejected", "Reverted"].includes(s.status)) {
    if (s.txHash) console.log(`🔗 mainnet/explorer tx: ${s.txHash}`);
    break;
  }
}
