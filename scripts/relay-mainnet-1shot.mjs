/**
 * 1Shot MAINNET relay — the "Best Use of 1Shot Permissionless Relayer" artifact.
 *
 * Relays a real ERC-7710 transaction through the 1Shot Permissionless MAINNET
 * relayer (relayer.1shotapi.com) and upgrades the EOA to a smart account with an
 * EIP-7702 authorization — the two hard requirements of the 1Shot track. Gas is
 * paid in USDC (a transfer to the relayer feeCollector inside the bundle), so the
 * delegator needs only a little USDC — NO native ETH.
 *
 * We default to BASE mainnet (chainId 8453) because gas there is cents: the whole
 * relay costs ~$0.01–0.10 in USDC. Override with CHAIN_ID=10 (Optimism) or
 * 42161 (Arbitrum) — all three are served by the .com relayer (verified live).
 *
 * Run:
 *   DELEGATOR_PRIVATE_KEY=0x... node scripts/relay-mainnet-1shot.mjs
 *   # optional: CHAIN_ID=10  RPC_URL=https://...  WORK_USDC=0.01  DESTINATION=0x...
 *
 * The delegator must hold a small USDC balance on the chosen mainnet (fee + work).
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
import { base, optimism, arbitrum } from "viem/chains";
import { bytesToHex } from "viem/utils";

const CHAINS = { 8453: base, 10: optimism, 42161: arbitrum };
const DEFAULT_RPC = {
  8453: "https://base-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
};

const chainId = Number(process.env.CHAIN_ID ?? 8453);
const chain = CHAINS[chainId];
if (!chain) throw new Error(`unsupported CHAIN_ID ${chainId} (use 8453 Base, 10 Optimism, 42161 Arbitrum)`);
const RELAYER = process.env.ONESHOT_RELAYER_URL ?? "https://relayer.1shotapi.com/relayers";
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

const pk = process.env.DELEGATOR_PRIVATE_KEY;
if (!pk) throw new Error("set DELEGATOR_PRIVATE_KEY (a wallet holding a little USDC on the chosen mainnet)");
const delegator = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain, transport: http(RPC) });

console.log(`\n── 1Shot MAINNET relay ──`);
console.log("chain:", chain.name, `(${chainId})`, "| relayer:", RELAYER);
console.log("delegator:", delegator.address);

const caps = (await rpc("relayer_getCapabilities", [String(chainId)]))[String(chainId)];
if (!caps) throw new Error(`relayer has no capabilities for chain ${chainId}`);
console.log("targetAddress:", caps.targetAddress, "| feeCollector:", caps.feeCollector);
const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
const decimals = Number(usdc.decimals);

// Guard: make sure the delegator actually holds USDC (else the relay reverts).
const bal = await publicClient.readContract({
  address: usdc.address,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [delegator.address],
});
console.log(`USDC (${usdc.address}) balance:`, (Number(bal) / 10 ** decimals).toFixed(6));

const fee = await rpc("relayer_getFeeData", { chainId: String(chainId), token: usdc.address });
const nativeCost = 200_000n * BigInt(fee.gasPrice);
const convertedAtoms = BigInt(Math.ceil((Number(nativeCost) / 1e18) * fee.rate * 10 ** decimals));
const minFeeAtoms = parseUnits(fee.minFee, decimals);
const feeAmount = convertedAtoms > minFeeAtoms ? convertedAtoms : minFeeAtoms;
const workAmount = parseUnits(process.env.WORK_USDC ?? "0.01", decimals);
const destination = getAddress(process.env.DESTINATION ?? "0x000000000000000000000000000000000000dEaD");
console.log("feeAmount:", feeAmount.toString(), "| workAmount:", workAmount.toString());
if (bal < feeAmount + workAmount) {
  throw new Error(
    `insufficient USDC: have ${bal}, need ${feeAmount + workAmount} (fee+work). Fund ${delegator.address} on ${chain.name}.`,
  );
}

const smartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: delegator.address,
  signer: { account: delegator },
});

// ── EIP-7702 authorization (first use): upgrade EOA → stateless delegator ──
const env = smartAccount.environment;
const impl = env.implementations.EIP7702StatelessDeleGatorImpl;
const nonce = await publicClient.getTransactionCount({ address: delegator.address, blockTag: "pending" });
const auth = await delegator.signAuthorization({ chainId, contractAddress: getAddress(impl), nonce });
const authorizationList = [
  { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity ?? 0 },
];
console.log("EIP-7702 authorization signed → impl:", impl);

// ── ERC-7710 delegation: delegator's smart account → relayer targetAddress ──
const delegation = createDelegation({
  to: caps.targetAddress,
  from: smartAccount.address,
  environment: smartAccount.environment,
  salt: bytesToHex(Uint8Array.from(randomBytes(32))),
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc.address, maxAmount: feeAmount + workAmount },
});
const signature = await smartAccount.signDelegation({ delegation });
const signedDelegation = { ...delegation, signature };

const feeCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [caps.feeCollector, feeAmount] });
const workCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [destination, workAmount] });

const taskId = await rpc("relayer_send7710Transaction", {
  chainId: String(chainId),
  context: fee.context,
  authorizationList,
  destinationUrl: process.env.NEXT_PUBLIC_ONESHOT_WEBHOOK_URL || undefined,
  memo: "kuot-mainnet-payout",
  transactions: [
    {
      permissionContext: [toRelayerJson(signedDelegation)],
      executions: [
        { target: usdc.address, value: "0", data: feeCalldata },
        { target: usdc.address, value: "0", data: workCalldata },
      ],
    },
  ],
});
const id = typeof taskId === "string" ? taskId : (taskId.TaskId ?? taskId);
console.log("\n✅ relayer_send7710Transaction OK — TaskId:", id);

// ── Poll status until the mainnet tx confirms ──
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await rpc("relayer_getStatus", [id]);
  console.log("status:", JSON.stringify(s));
  if (["Confirmed", "Rejected", "Reverted"].includes(s.status)) {
    if (s.txHash) console.log(`\n🔗 mainnet tx: ${s.txHash}`);
    break;
  }
}
