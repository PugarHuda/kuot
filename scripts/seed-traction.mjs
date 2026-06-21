#!/usr/bin/env node
/**
 * Seed real on-chain traction on the LIVE Kuot deployment: run a few research
 * queries through the agent, then settle each (operator attestAndSplit) so the
 * AttributionLedger emits real AuthorPaid events and the dashboards populate.
 *
 * Usage: node scripts/seed-traction.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
function loadEnv(p = ".env") { try { for (const l of readFileSync(p, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim(); } } catch {} }
loadEnv();

const BASE = (process.argv[2] ?? "https://kuot-azure.vercel.app").replace(/\/$/, "");
const LEDGER = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER;

const QUERIES = [
  "carbon capture methods 2026",
  "large language model agent autonomy",
  "user-centric music streaming royalties",
];

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

for (const query of QUERIES) {
  process.stdout.write(`\n▶ ${query}\n`);
  const res = await post("/api/research", { query, papers: 3 });
  if (res.status !== 200 || !res.body?.payouts?.length) { console.log("  research failed:", res.status); continue; }
  const { payouts, grounding } = res.body;
  console.log(`  venice=${res.body.venice} grounded=${payouts.length} digest=${grounding?.digest?.slice(0, 12)}…`);

  // Settle a small sub-cent-scale pool split across the grounded authors.
  const amountUSDC6 = "30000"; // $0.03 across all cited authors
  const settle = await post("/api/settle", {
    query, amountUSDC6, payouts, ledger: LEDGER, mode: "split", digest: grounding?.digest,
  });
  if (settle.status === 200) {
    console.log(`  ✓ settled tx=${settle.body.txHash?.slice(0, 14)}… grounding=${settle.body.grounding?.txHash?.slice(0, 12) ?? "-"}`);
  } else {
    console.log(`  ✗ settle ${settle.status}:`, JSON.stringify(settle.body)?.slice(0, 160));
  }
}
console.log("\nDone. Dashboards should now show real AuthorPaid volume.");
