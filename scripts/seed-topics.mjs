#!/usr/bin/env node
/**
 * Widen the on-chain author cohort through the REAL agent pipeline:
 *   POST /api/research (live multi-agent run) → take its payout plan →
 *   POST /api/settle (authorized) → on-chain attest + escrow real ORCID authors.
 *
 * Unlike seed-widen.mjs (which records owed directly), this drives the genuine
 * research→settle flow, so every seeded balance is the output of an actual run.
 *
 * Run: DEV_PAY_TOKEN=… KUOT_BASE_URL=… node scripts/seed-topics.mjs
 */
const BASE = (process.env.KUOT_BASE_URL ?? "https://kuot-azure.vercel.app").replace(/\/$/, "");
const TOKEN = process.env.DEV_PAY_TOKEN;
const LEDGER = process.env.LEDGER ?? "0x6a1AB9C4Cfd7bd65397DC5dDa92d19fA8D49173e";
if (!TOKEN) throw new Error("DEV_PAY_TOKEN required");

const TOPICS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "quantum error correction surface code threshold",
      "direct air capture CO2 sorbent regeneration",
      "amyloid beta immunotherapy Alzheimer clinical trial",
      "graph neural network drug discovery molecular property",
    ];

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;
const j = async (path, init) => {
  const r = await fetch(`${BASE}${path}`, init);
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};

// Renormalize weightBps to sum to exactly 10000 (settle/ledger require it).
function normalize(payouts) {
  const p = payouts.filter((x) => /^0x[0-9a-fA-F]{40}$/.test(x.author) && !/^0x0{40}$/.test(x.author));
  if (!p.length) return [];
  const sum = p.reduce((s, x) => s + (x.weightBps || 0), 0) || 1;
  let acc = 0;
  p.forEach((x, i) => {
    x.weightBps = i === p.length - 1 ? 10000 - acc : Math.round((x.weightBps / sum) * 10000);
    acc += x.weightBps;
  });
  return p;
}

async function main() {
  const seeded = [];
  for (const topic of TOPICS) {
    process.stdout.write(`\n• "${topic}"\n  research… `);
    const res = await j("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: topic, papers: 6 }),
    });
    if (res.status !== 200 || !res.body?.payouts?.length) {
      console.log(`skip (research ${res.status})`);
      continue;
    }
    const payouts = normalize(res.body.payouts);
    const withOrcid = payouts.filter((p) => p.identity && ORCID_RE.test(p.identity));
    const amount = Math.max(0.08, Math.min(0.3, Number(res.body.recommendedSettleUSDC) || 0.15));
    const amountUSDC6 = String(Math.round(amount * 1e6));
    console.log(`${payouts.length} payouts (${withOrcid.length} with ORCID) · settling $${amount.toFixed(3)}`);

    const settle = await j("/api/settle", {
      method: "POST",
      headers: { "content-type": "application/json", "x-settle-token": TOKEN },
      body: JSON.stringify({ query: `seed:${topic}`, amountUSDC6, ledger: LEDGER, payouts, mode: "attest" }),
    });
    if (settle.status !== 200) {
      console.log(`  settle failed ${settle.status}: ${JSON.stringify(settle.body).slice(0, 160)}`);
      continue;
    }
    console.log(`  ✓ attest ${settle.body.txHash?.slice(0, 14)}… · escrow ${settle.body.escrow ? "recorded" : "—"} · agentWallet ${settle.body.agentWallet?.transactionId ? "paid" : "—"}`);
    for (const p of withOrcid) seeded.push({ name: p.authorName, orcid: p.identity, paper: p.workTitle ?? topic });
  }

  console.log(`\n=== seeded ${seeded.length} real ORCID authors across ${TOPICS.length} topics ===`);
  for (const s of seeded) console.log(`  ${s.orcid}  ${s.name}`);
}
main().catch((e) => { console.error("error:", e.message ?? e); process.exit(1); });
