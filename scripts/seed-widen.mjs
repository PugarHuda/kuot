#!/usr/bin/env node
/**
 * Widen the on-chain author cohort: every real co-author surfaced by Kuot's
 * research that doesn't yet hold an escrow balance gets a real citation share
 * recorded in UnclaimedEscrow on Arc — funded by real operator USDC.
 *
 * Reads the outreach CSV (name,orcid,paper,owed_usd,claim_link), groups the
 * owed=0 authors by paper, assigns each paper a deterministic grounding total
 * split evenly among its authors, then funds + recordMany on-chain.
 *
 * IDEMPOTENT: skips any ORCID whose on-chain owed is already > 0, so re-runs
 * never double-record (recordMany is additive: owed += amount).
 *
 * Run: node scripts/seed-widen.mjs <path-to-csv>
 */
import { createPublicClient, createWalletClient, http, keccak256, encodePacked, getAddress, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const E = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();

const RPC = process.env.ARC_RPC_URL ?? E("ARC_RPC_URL");
const USDC = getAddress(process.env.NEXT_PUBLIC_ARC_USDC ?? E("NEXT_PUBLIC_ARC_USDC") ?? "0x3600000000000000000000000000000000000000");
const ESCROW = getAddress(E("NEXT_PUBLIC_UNCLAIMED_ESCROW"));
const opKey = process.env.OPERATOR_PRIVATE_KEY ?? E("OPERATOR_PRIVATE_KEY");
const CSV = process.argv[2];
if (!CSV) throw new Error("usage: node scripts/seed-widen.mjs <csv>");

const chain = { id: 5042002, name: "Arc Testnet", nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" }, rpcUrls: { default: { http: [RPC] } } };
const ESCROW_ABI = [
  { type: "function", name: "recordMany", stateMutability: "nonpayable", inputs: [{ name: "hashes", type: "bytes32[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "owed", stateMutability: "view", inputs: [{ name: "h", type: "bytes32" }], outputs: [{ type: "uint256" }] },
];
const authorHash = (id) => keccak256(encodePacked(["string"], [id]));

const op = privateKeyToAccount(opKey);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: op, chain, transport: http(RPC) });

// Deterministic per-paper grounding total in [0.06, 0.16] USDC (6-dec), from the title.
function paperTotal6(title) {
  let h = 0;
  for (const c of title) h = (h * 131 + c.charCodeAt(0)) >>> 0;
  return 60_000n + BigInt(h % 100_001); // 0.060000 … 0.160001
}

// Parse CSV (handles quoted fields minimally; our fields have no embedded commas in name/orcid).
function rows() {
  const lines = readFileSync(CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines.slice(1)) {
    const [name, orcid, paper, owed, link] = line.split(",");
    out.push({ name, orcid, paper, owed: Number(owed), link });
  }
  return out;
}

async function main() {
  console.log("operator:", op.address, "| escrow:", ESCROW);
  const all = rows();

  // candidates = CSV rows with owed 0 AND on-chain owed still 0 (idempotent)
  const byPaper = new Map();
  for (const r of all) {
    if (!r.orcid || r.owed > 0) continue;
    const chainOwed = await pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "owed", args: [authorHash(r.orcid)] });
    if (chainOwed > 0n) { console.log(`skip (already on-chain): ${r.name} ${r.orcid} = ${Number(chainOwed) / 1e6}`); continue; }
    if (!byPaper.has(r.paper)) byPaper.set(r.paper, []);
    byPaper.get(r.paper).push(r);
  }

  const hashes = [], amounts = [], plan = [];
  for (const [paper, authors] of byPaper) {
    const total = paperTotal6(paper);
    const n = BigInt(authors.length);
    const base = total / n;
    authors.forEach((a, i) => {
      const amt = i === authors.length - 1 ? total - base * (n - 1n) : base; // last gets the dust
      hashes.push(authorHash(a.orcid));
      amounts.push(amt);
      plan.push({ name: a.name, orcid: a.orcid, amt });
    });
  }

  if (hashes.length === 0) { console.log("nothing to widen — every author already holds a balance."); return; }
  const sum = amounts.reduce((s, x) => s + x, 0n);
  console.log(`\nrecording ${hashes.length} new author balances across ${byPaper.size} papers · total ${Number(sum) / 1e6} USDC`);
  for (const p of plan) console.log(`  + ${(Number(p.amt) / 1e6).toFixed(6)}  ${p.name.padEnd(24)} ${p.orcid}`);

  // 1) fund escrow with the new total (real USDC transfer)
  const fund = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [ESCROW, sum] });
  await pub.waitForTransactionReceipt({ hash: fund });
  console.log(`\nfunded escrow ${Number(sum) / 1e6} USDC · tx ${fund}`);

  // 2) record all owed amounts (chunk to stay well under gas/calldata limits)
  const CHUNK = 50;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const hs = hashes.slice(i, i + CHUNK), am = amounts.slice(i, i + CHUNK);
    const tx = await wallet.writeContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "recordMany", args: [hs, am] });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`recordMany [${i}..${i + hs.length}) · tx ${tx}`);
  }

  // 3) verify a sample on-chain
  let ok = 0;
  for (const p of plan) {
    const got = await pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "owed", args: [authorHash(p.orcid)] });
    if (got === p.amt) ok++;
    else console.log(`  MISMATCH ${p.name}: want ${p.amt} got ${got}`);
  }
  console.log(`\n✅ verified ${ok}/${plan.length} new balances on-chain. Widening complete.`);
}
main().catch((e) => { console.error("error:", e.shortMessage ?? e.message ?? e); process.exit(1); });
