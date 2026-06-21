/**
 * A2A redelegation, redeemed END-TO-END on Base mainnet via 1Shot.
 *
 * The 1Shot relayer allows exactly ONE EIP-7702 authorization per relay. A naive
 * two-hop chain needs two (User + Researcher both upgraded) → rejected. The fix:
 * the Researcher is a PRE-DEPLOYED 7702 smart account (already has code), so only
 * the User needs an authorization. Authority still only ever narrows:
 *
 *   User (fresh, 1×7702 auth, holds USDC, root)
 *     └─ROOT delegation→ Researcher (operator 0x39D2, already 7702-upgraded)
 *          └─redelegation (parent=root, NARROWED)→ 1Shot relayer target
 *
 * Run: USER_PRIVATE_KEY=0x... RESEARCHER_PRIVATE_KEY=0x... node scripts/redelegation-2hop-1shot.mjs
 *   USER must hold a little USDC on Base. RESEARCHER must be an already-deployed
 *   7702 smart account (set RESEARCHER_PREDEPLOYED=1, the default).
 */
import { randomBytes } from "node:crypto";
import { Implementation, ScopeType, createDelegation, toMetaMaskSmartAccount } from "@metamask/smart-accounts-kit";
import { createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { bytesToHex } from "viem/utils";

const chain = base;
const RELAYER = "https://relayer.1shotapi.com/relayers";
const RPC = process.env.RPC_URL ?? "https://base-rpc.publicnode.com";
const RESEARCHER_PREDEPLOYED = (process.env.RESEARCHER_PREDEPLOYED ?? "1") === "1";
let _id = 0;
async function rpc(method, params) {
  const res = await fetch(RELAYER, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.code} ${j.error.message}`);
  return j.result;
}
function toRelayerJson(v) {
  if (typeof v === "bigint") return `0x${v.toString(16)}`;
  if (v instanceof Uint8Array) return `0x${Buffer.from(v).toString("hex")}`;
  if (Array.isArray(v)) return v.map(toRelayerJson);
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = toRelayerJson(x); return o; }
  return v;
}
const salt = () => bytesToHex(Uint8Array.from(randomBytes(32)));

const userPk = process.env.USER_PRIVATE_KEY, resPk = process.env.RESEARCHER_PRIVATE_KEY;
if (!userPk || !resPk) throw new Error("set USER_PRIVATE_KEY and RESEARCHER_PRIVATE_KEY");
const userEoa = privateKeyToAccount(userPk), resEoa = privateKeyToAccount(resPk);
const pub = createPublicClient({ chain, transport: http(RPC) });

console.log("\n── A2A 2-hop redelegation (end-to-end, Base mainnet) ──");
console.log("User (root):", userEoa.address);
console.log("Researcher  :", resEoa.address, RESEARCHER_PREDEPLOYED ? "(pre-deployed 7702)" : "");

const caps = (await rpc("relayer_getCapabilities", [String(chain.id)]))[String(chain.id)];
const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
const decimals = Number(usdc.decimals);
const fee = await rpc("relayer_getFeeData", { chainId: String(chain.id), token: usdc.address });
const nativeCost = 300_000n * BigInt(fee.gasPrice);
const conv = BigInt(Math.ceil((Number(nativeCost) / 1e18) * fee.rate * 10 ** decimals));
const minFee = parseUnits(fee.minFee, decimals);
const feeAmount = conv > minFee ? conv : minFee;
const workAmount = parseUnits(process.env.WORK_USDC ?? "0.01", decimals);
const budget = feeAmount + workAmount;
console.log("feeAmount:", feeAmount.toString(), "| work:", workAmount.toString(), "| budget:", budget.toString());

// Sanity: researcher must actually be deployed (have code) if we skip its auth.
const resCode = await pub.getCode({ address: resEoa.address });
if (RESEARCHER_PREDEPLOYED && (!resCode || resCode === "0x")) throw new Error(`Researcher ${resEoa.address} has NO code — not a deployed smart account. Run the single-hop relay once to 7702-upgrade it, or unset RESEARCHER_PREDEPLOYED.`);

const userSA = await toMetaMaskSmartAccount({ client: pub, implementation: Implementation.Stateless7702, address: userEoa.address, signer: { account: userEoa } });
const resSA = await toMetaMaskSmartAccount({ client: pub, implementation: Implementation.Stateless7702, address: resEoa.address, signer: { account: resEoa } });
const env = userSA.environment;

const bal = await pub.readContract({ address: usdc.address, abi: erc20Abi, functionName: "balanceOf", args: [userEoa.address] });
console.log("User USDC:", (Number(bal) / 10 ** decimals).toFixed(6));
if (bal < budget) throw new Error(`User needs ≥ ${budget} USDC atoms on Base (have ${bal}). Fund ${userEoa.address}.`);

// Hop 1: User → Researcher (root)
const root = createDelegation({ environment: env, from: userSA.address, to: resSA.address, salt: salt(), scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc.address, maxAmount: budget } });
const rootSig = await userSA.signDelegation({ delegation: root });
const signedRoot = { ...root, signature: rootSig };
console.log("✓ hop 1 signed: User → Researcher");

// Hop 2: Researcher → relayer (parent = root, narrowed)
const redel = createDelegation({ environment: env, from: resSA.address, to: caps.targetAddress, parentDelegation: signedRoot, salt: salt(), scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc.address, maxAmount: budget } });
const redelSig = await resSA.signDelegation({ delegation: redel });
const signedRedel = { ...redel, signature: redelSig };
console.log("✓ hop 2 signed: Researcher → relayer (redelegation, parent=root)");

const permissionContext = [signedRedel, signedRoot].map(toRelayerJson);

// ONLY the User needs a 7702 authorization (Researcher is pre-deployed).
const impl = env.implementations.EIP7702StatelessDeleGatorImpl;
const nonce = await pub.getTransactionCount({ address: userEoa.address, blockTag: "pending" });
const a = await userEoa.signAuthorization({ chainId: chain.id, contractAddress: getAddress(impl), nonce });
const authorizationList = [{ address: a.address, chainId: a.chainId, nonce: a.nonce, r: a.r, s: a.s, yParity: a.yParity ?? 0 }];
console.log("✓ single EIP-7702 authorization (User only)");

const feeData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [caps.feeCollector, feeAmount] });
const workData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", workAmount] });

const taskId = await rpc("relayer_send7710Transaction", {
  chainId: String(chain.id), context: fee.context, authorizationList, memo: "kuot-2hop-redelegation",
  transactions: [{ permissionContext, executions: [{ target: usdc.address, value: "0", data: feeData }, { target: usdc.address, value: "0", data: workData }] }],
});
const id = typeof taskId === "string" ? taskId : (taskId.TaskId ?? taskId);
console.log("\n✅ 2-hop redelegation redeemed via 1Shot — TaskId:", id);
console.log("(verify on basescan: USDC transfers from", userEoa.address + ")");
