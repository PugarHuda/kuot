/**
 * Seed the Claim & Rewards demo with REAL on-chain state for the test ORCID
 * (0000-0002-1825-0097), so the demo can actually:
 *   1) withdraw an accumulated "cited & owed" balance from UnclaimedEscrow, and
 *   2) show a visibly-accruing citation-loyalty yield from CitationYield.
 *
 * Everything here is real Sepolia state set by the operator — no mocks. The yield
 * is backdated only in the sense that the loyalty clock (`since`) was already
 * started by an earlier accrue; this script tops up principal + funds the reserve
 * so `pendingBonus` is non-zero and keeps ticking.
 *
 * Usage:
 *   node scripts/seed-claim-demo.mjs            # read-only: print current state
 *   node scripts/seed-claim-demo.mjs --seed     # fund escrow + record owed + accrue yield + fund reserve
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, keccak256, encodePacked, erc20Abi, formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// --- load .env (simple parser; values may contain '=') ---
const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ORCID = "0000-0002-1825-0097";
const RPC = env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const ESCROW = env.NEXT_PUBLIC_UNCLAIMED_ESCROW;
const YIELD = env.NEXT_PUBLIC_CITATION_YIELD;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia test USDC
const opKey = env.OPERATOR_PRIVATE_KEY;
if (!ESCROW || !YIELD || !opKey) throw new Error("missing ESCROW / YIELD / OPERATOR_PRIVATE_KEY in .env");

const id = keccak256(encodePacked(["string"], [ORCID]));

const ESCROW_ABI = [
  { type: "function", name: "owed", stateMutability: "view", inputs: [{ name: "h", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "recordMany", stateMutability: "nonpayable", inputs: [{ name: "hashes", type: "bytes32[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
];
const YIELD_ABI = [
  { type: "function", name: "principal", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "since", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "pendingBonus", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "apyBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "accrueMany", stateMutability: "nonpayable", inputs: [{ name: "ids", type: "bytes32[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
];

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const u = (x) => `${formatUnits(x, 6)} USDC`;

async function readState() {
  const [owed, principal, since, pending, apy, claimed, escBal, yldBal] = await Promise.all([
    pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "owed", args: [id] }),
    pub.readContract({ address: YIELD, abi: YIELD_ABI, functionName: "principal", args: [id] }),
    pub.readContract({ address: YIELD, abi: YIELD_ABI, functionName: "since", args: [id] }),
    pub.readContract({ address: YIELD, abi: YIELD_ABI, functionName: "pendingBonus", args: [id] }),
    pub.readContract({ address: YIELD, abi: YIELD_ABI, functionName: "apyBps" }),
    pub.readContract({ address: YIELD, abi: YIELD_ABI, functionName: "claimed", args: [id] }),
    pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [ESCROW] }),
    pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [YIELD] }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  console.log(`ORCID ${ORCID}\n  id            ${id}`);
  console.log(`  escrow.owed   ${u(owed)}`);
  console.log(`  escrow USDC   ${u(escBal)} (reserve held by escrow contract)`);
  console.log(`  yield.principal ${u(principal)}`);
  console.log(`  yield.since   ${since} ${since ? `(${Math.floor((now - Number(since)) / 3600)}h ago)` : "(not started)"}`);
  console.log(`  yield.pending ${u(pending)}  apy=${Number(apy) / 100}%  claimed=${claimed}`);
  console.log(`  yield USDC    ${u(yldBal)} (reserve to pay the bonus)`);
  return { owed, principal, since, pending, claimed, escBal, yldBal };
}

const state = await readState();

if (!process.argv.includes("--seed")) {
  console.log("\n(read-only) re-run with --seed to top up owed + yield + reserve.");
  process.exit(0);
}

// ---- SEED ----
const account = privateKeyToAccount(opKey.startsWith("0x") ? opKey : `0x${opKey}`);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
console.log(`\nOperator ${account.address}`);
const opUsdc = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
console.log(`Operator USDC ${u(opUsdc)}`);

// Target: a believable "accumulated from several citations" balance.
// Capped to what the escrow already holds (operator has no spare test-USDC), so
// the recorded owed is always fully backed by real USDC in the contract.
const TARGET_OWED = 2_000_000n;      // 2.00 USDC owed (claimable; escrow holds 2.4)
const TARGET_PRINCIPAL = 2_000_000n; // mirror into yield so loyalty bonus accrues
const RESERVE = 500_000n;            // 0.50 USDC reserve so the bonus is always payable (yield holds 0.6)

let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });

// 1) ensure escrow holds enough USDC to cover the owed (fund the gap)
if (state.escBal < TARGET_OWED) {
  const gap = TARGET_OWED - state.escBal;
  const tx = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [ESCROW, gap], nonce: nonce++ });
  console.log(`fund escrow +${u(gap)} → ${tx}`);
  await pub.waitForTransactionReceipt({ hash: tx });
}
// 2) record owed up to target (recordMany ADDS; only top up the delta)
if (state.owed < TARGET_OWED) {
  const delta = TARGET_OWED - state.owed;
  const tx = await wallet.writeContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "recordMany", args: [[id], [delta]], nonce: nonce++ });
  console.log(`record owed +${u(delta)} → ${tx}`);
  await pub.waitForTransactionReceipt({ hash: tx });
}
// 3) accrue yield principal up to target (also adds; starts `since` if unset)
if (state.principal < TARGET_PRINCIPAL) {
  const delta = TARGET_PRINCIPAL - state.principal;
  const tx = await wallet.writeContract({ address: YIELD, abi: YIELD_ABI, functionName: "accrueMany", args: [[id], [delta]], nonce: nonce++ });
  console.log(`accrue yield +${u(delta)} → ${tx}`);
  await pub.waitForTransactionReceipt({ hash: tx });
}
// 4) fund the yield reserve so claimBonus can actually pay out
if (state.yldBal < RESERVE) {
  const gap = RESERVE - state.yldBal;
  const tx = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [YIELD, gap], nonce: nonce++ });
  console.log(`fund yield reserve +${u(gap)} → ${tx}`);
  await pub.waitForTransactionReceipt({ hash: tx });
}

console.log("\nAfter seeding:");
await readState();
