#!/usr/bin/env node
/**
 * Proof that the author claim rail works end-to-end on-chain (post-ORCID-verify):
 *   seed an owed balance → author signs → operator relays the bind → author
 *   withdraws → USDC lands in the author's wallet.
 *
 * Uses a throwaway identity + wallet, so no real researcher's escrow is touched.
 * Run: OPERATOR_PRIVATE_KEY=… ARC_RPC_URL=… NAME_REGISTRY=… ESCROW=… USDC=… node scripts/prove-claim.mjs
 */
import { createWalletClient, createPublicClient, http, keccak256, encodePacked, getAddress, parseEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const RPC = process.env.ARC_RPC_URL;
const REGISTRY = getAddress(process.env.NAME_REGISTRY);
const ESCROW = getAddress(process.env.ESCROW);
const USDC = getAddress(process.env.USDC);
const ID = `kuot-claim-proof-${process.argv[2] ?? "1"}`; // fresh, non-real identity
const AMOUNT = 50_000n; // 0.05 USDC (6-dec)

const chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [RPC] } },
};

const REGISTRY_ABI = [
  { type: "function", name: "bind", stateMutability: "nonpayable", inputs: [{ name: "authorHash", type: "bytes32" }, { name: "wallet", type: "address" }, { name: "signature", type: "bytes" }], outputs: [] },
  { type: "function", name: "walletOf", stateMutability: "view", inputs: [{ name: "authorHash", type: "bytes32" }], outputs: [{ type: "address" }] },
];
const ESCROW_ABI = [
  { type: "function", name: "recordMany", stateMutability: "nonpayable", inputs: [{ name: "hashes", type: "bytes32[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "owed", stateMutability: "view", inputs: [{ name: "authorHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "authorHash", type: "bytes32" }], outputs: [] },
];
const ERC20_ABI = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
];

const authorHash = (id) => keccak256(encodePacked(["string"], [id]));
const bindingMessage = (id, wallet) => keccak256(encodePacked(["string", "address"], [id, getAddress(wallet)]));

const op = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY);
const opWallet = createWalletClient({ account: op, chain, transport: http(RPC) });
const pub = createPublicClient({ chain, transport: http(RPC) });

async function main() {
  const h = authorHash(ID);
  console.log(`identity: ${ID}\nauthorHash: ${h}`);

  // 1) seed an owed balance: fund the escrow, then record the owed amount.
  const fund = await opWallet.writeContract({ address: USDC, abi: ERC20_ABI, functionName: "transfer", args: [ESCROW, AMOUNT] });
  await pub.waitForTransactionReceipt({ hash: fund });
  const rec = await opWallet.writeContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "recordMany", args: [[h], [AMOUNT]] });
  await pub.waitForTransactionReceipt({ hash: rec });
  const owed0 = await pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "owed", args: [h] });
  console.log(`1) seeded owed = ${Number(owed0) / 1e6} USDC (record tx ${rec})`);

  // 2) the author proves wallet control, operator relays the bind (gasless for author).
  const w = privateKeyToAccount(generatePrivateKey());
  const wWallet = createWalletClient({ account: w, chain, transport: http(RPC) });
  const sig = await w.signMessage({ message: { raw: bindingMessage(ID, w.address) } });
  const bind = await opWallet.writeContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "bind", args: [h, w.address, sig] });
  await pub.waitForTransactionReceipt({ hash: bind });
  const bound = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "walletOf", args: [h] });
  console.log(`2) bound ${ID} -> ${bound} (tx ${bind}) · matches author wallet: ${getAddress(bound) === getAddress(w.address)}`);

  // 3) fund a little gas, then the author withdraws their owed USDC.
  const gas = await opWallet.sendTransaction({ to: w.address, value: parseEther("0.05") });
  await pub.waitForTransactionReceipt({ hash: gas });
  const before = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [w.address] });
  const wd = await wWallet.writeContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "withdraw", args: [h] });
  await pub.waitForTransactionReceipt({ hash: wd });
  const after = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [w.address] });
  const owed1 = await pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "owed", args: [h] });
  console.log(`3) author withdrew (tx ${wd}) · escrow owed ${Number(owed0) / 1e6} -> ${Number(owed1) / 1e6} · wallet USDC ${Number(before) / 1e6} -> ${Number(after) / 1e6} (net of self-paid gas)`);

  // Definitive check: the escrow paid out the full owed (now 0). On Arc the gas
  // token IS this USDC, so the wallet delta is (owed − the gas W spent withdrawing).
  const ok = owed0 === AMOUNT && owed1 === 0n && after > before;
  console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — bind→withdraw works: the author claimed their full ${Number(AMOUNT) / 1e6} USDC owed (escrow now 0).`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("error:", e.shortMessage ?? e.message ?? e); process.exit(1); });
