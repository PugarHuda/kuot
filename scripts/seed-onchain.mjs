/**
 * Seed realistic on-chain attestation data for the demo (Sepolia).
 *
 * Mixes both settlement modes so the Activity page reflects reality:
 *   - attestAndSplit → REAL USDC transfer to authors (operator approves + pays).
 *   - attest         → records each author's owed share (settled separately via 1Shot).
 *
 * Varied cases: 1–4 authors, different topics, amounts, and recurring authors so
 * the leaderboard accumulates. Idempotent-ish: a queryId already attested is skipped.
 *
 * Run: node scripts/seed-onchain.mjs   (reads OPERATOR_PRIVATE_KEY + NEXT_PUBLIC_* from env)
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  getAddress,
  erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const LEDGER = getAddress(process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER);
const USDC = getAddress(process.env.NEXT_PUBLIC_USDC ?? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
const opKey = process.env.OPERATOR_PRIVATE_KEY;
if (!opKey) throw new Error("set OPERATOR_PRIVATE_KEY");

const account = privateKeyToAccount(opKey);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const LEDGER_ABI = [
  { type: "function", name: "attest", stateMutability: "nonpayable", inputs: [{ name: "queryId", type: "bytes32" }, { name: "total", type: "uint256" }, { name: "cites", type: "tuple[]", components: [{ name: "author", type: "address" }, { name: "weightBps", type: "uint16" }] }], outputs: [] },
  { type: "function", name: "attestAndSplit", stateMutability: "nonpayable", inputs: [{ name: "queryId", type: "bytes32" }, { name: "amount", type: "uint256" }, { name: "cites", type: "tuple[]", components: [{ name: "author", type: "address" }, { name: "weightBps", type: "uint16" }] }], outputs: [] },
  { type: "function", name: "attested", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ type: "bool" }] },
];

// Deterministic author wallet from a name (mirrors the app's demoWallet idea).
function authorAddr(name) {
  let h = 0n;
  for (const ch of name) h = (h * 131n + BigInt(ch.charCodeAt(0))) % (1n << 160n);
  if (h === 0n) h = 1n;
  return getAddress(`0x${h.toString(16).padStart(40, "0")}`);
}

// Build citations with even weights summing to exactly 10000.
function cites(names) {
  const n = names.length;
  const base = Math.floor(10000 / n);
  return names.map((nm, i) => ({
    author: authorAddr(nm),
    weightBps: i === n - 1 ? 10000 - base * (n - 1) : base,
  }));
}

const usdc6 = (x) => BigInt(Math.round(x * 1e6));

// Recurring authors (accumulate across papers) + unique ones → realistic leaderboard.
const CASES = [
  { mode: "split", topic: "perovskite solar cell operational stability", usdc: 0.20, authors: ["A. Nakamura", "L. Rossi"] },
  { mode: "attest", topic: "CRISPR off-target effects in vivo", usdc: 0.30, authors: ["A. Nakamura", "P. Sharma", "M. Chen"] },
  { mode: "attest", topic: "LLM hallucination mitigation via retrieval", usdc: 0.10, authors: ["S. Okafor"] },
  { mode: "split", topic: "surface-code quantum error correction thresholds", usdc: 0.15, authors: ["L. Rossi", "M. Chen", "P. Sharma", "K. Adebayo"] },
  { mode: "attest", topic: "enzymatic ocean microplastic degradation", usdc: 0.25, authors: ["S. Okafor", "A. Nakamura"] },
  { mode: "attest", topic: "thermostable mRNA vaccine formulation", usdc: 0.40, authors: ["P. Sharma", "M. Chen", "K. Adebayo", "L. Rossi"] },
  // --- richer batch (attest-only, no operator USDC needed) ---
  { mode: "attest", topic: "solid-state lithium battery dendrite suppression", usdc: 0.35, authors: ["H. Tanaka", "L. Rossi", "M. Chen"] },
  { mode: "attest", topic: "graph neural networks for molecular property prediction", usdc: 0.18, authors: ["S. Okafor", "D. Volkov"] },
  { mode: "attest", topic: "direct air capture sorbent regeneration energy", usdc: 0.28, authors: ["A. Nakamura", "K. Adebayo"] },
  { mode: "attest", topic: "gut microbiome and immunotherapy response", usdc: 0.22, authors: ["P. Sharma", "E. Larsson", "M. Chen"] },
  { mode: "attest", topic: "federated learning differential privacy bounds", usdc: 0.12, authors: ["D. Volkov"] },
  { mode: "attest", topic: "perovskite tandem cell certified efficiency", usdc: 0.33, authors: ["A. Nakamura", "L. Rossi", "H. Tanaka", "K. Adebayo"] },
  { mode: "attest", topic: "wastewater-based epidemiology SARS-CoV-2 variants", usdc: 0.16, authors: ["E. Larsson", "S. Okafor"] },
  { mode: "attest", topic: "transformer scaling laws for low-resource languages", usdc: 0.20, authors: ["S. Okafor", "D. Volkov", "P. Sharma"] },
  { mode: "attest", topic: "green hydrogen electrolyzer catalyst durability", usdc: 0.27, authors: ["H. Tanaka", "K. Adebayo"] },
  { mode: "attest", topic: "single-cell RNA atlas of tumor microenvironment", usdc: 0.31, authors: ["E. Larsson", "M. Chen", "P. Sharma"] },
  // --- edge cases: extremes of author-count and amount ---
  { mode: "attest", topic: "tiny micropayment edge case — single citation", usdc: 0.05, authors: ["S. Okafor"] },
  { mode: "split", topic: "high-value review — superconductivity at ambient pressure", usdc: 0.50, authors: ["A. Nakamura", "L. Rossi"] },
  { mode: "attest", topic: "large consortium — global biodiversity genome initiative", usdc: 0.45, authors: ["A. Nakamura", "L. Rossi", "M. Chen", "P. Sharma", "K. Adebayo", "E. Larsson"] },
  { mode: "attest", topic: "five-author meta-analysis — exoplanet atmospheric retrieval", usdc: 0.38, authors: ["H. Tanaka", "D. Volkov", "S. Okafor", "K. Adebayo", "L. Rossi"] },
  { mode: "attest", topic: "Indonesian NLP — low-resource Javanese language models", usdc: 0.14, authors: ["R. Wijaya", "S. Okafor"] },
  { mode: "attest", topic: "tropical peatland carbon flux measurement", usdc: 0.19, authors: ["R. Wijaya", "E. Larsson", "A. Nakamura"] },
  { mode: "attest", topic: "neuromorphic computing energy efficiency benchmarks", usdc: 0.23, authors: ["D. Volkov", "H. Tanaka"] },
  { mode: "attest", topic: "CAR-T cell therapy solid tumor penetration", usdc: 0.36, authors: ["P. Sharma", "M. Chen", "E. Larsson", "K. Adebayo"] },
];

const splitTotal = CASES.filter((c) => c.mode === "split").reduce((s, c) => s + c.usdc, 0);

async function main() {
  console.log("operator:", account.address, "| ledger:", LEDGER);
  const bal = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  console.log("operator USDC:", (Number(bal) / 1e6).toFixed(4), "| needed for real transfers:", splitTotal.toFixed(2));

  // Approve once for the attestAndSplit (real-transfer) cases.
  if (splitTotal > 0) {
    const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, LEDGER] });
    if (allowance < usdc6(splitTotal)) {
      console.log("approving USDC…");
      const tx = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [LEDGER, usdc6(splitTotal + 0.01)] });
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log("  approved:", tx);
    }
  }

  for (const c of CASES) {
    const queryId = keccak256(toHex(c.topic));
    const already = await pub.readContract({ address: LEDGER, abi: LEDGER_ABI, functionName: "attested", args: [queryId] });
    if (already) { console.log(`skip (already attested): "${c.topic}"`); continue; }
    const cs = cites(c.authors);
    const fn = c.mode === "split" ? "attestAndSplit" : "attest";
    try {
      const tx = await wallet.writeContract({ address: LEDGER, abi: LEDGER_ABI, functionName: fn, args: [queryId, usdc6(c.usdc), cs] });
      await pub.waitForTransactionReceipt({ hash: tx });
      console.log(`✓ ${fn.padEnd(13)} ${c.usdc.toFixed(2)} USDC · ${c.authors.length} authors · "${c.topic.slice(0, 40)}" → ${tx}`);
    } catch (e) {
      console.log(`✗ ${fn} "${c.topic.slice(0, 40)}": ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  console.log("done.");
}
main();
