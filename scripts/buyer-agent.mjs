#!/usr/bin/env node
/**
 * Kuot buyer-agent — generates REAL agent-to-agent payment volume on Arc.
 *
 * Simulates an external AI agent that pays Kuot:
 *   1) probes the x402 toll-booth (POST /api/research/x402) → sees the 402 price quote;
 *   2) pays to CITE a stored Kuot synthesis N times (reverse-x402 via Circle Gateway,
 *      settled + batched on Arc) — each call is a real on-chain nanopayment, and a
 *      fraction flows recursively back to the original authors.
 *
 * This is "payments actually flowing in test USDC, volume you can point to" (the
 * judging Traction axis), driven by an agent, not a human clicking buttons.
 *
 * Usage:
 *   DEV_PAY_TOKEN=… node scripts/buyer-agent.mjs [count] [summaryId]
 * Env:
 *   KUOT_BASE_URL   (default https://kuot-azure.vercel.app)
 *   DEV_PAY_TOKEN   (required — authorizes the server-side Gateway buyer endpoint)
 */
const BASE = (process.env.KUOT_BASE_URL ?? "https://kuot-azure.vercel.app").replace(/\/$/, "");
const TOKEN = process.env.DEV_PAY_TOKEN;
const COUNT = Math.max(1, Math.min(50, Number(process.argv[2] ?? 5)));
const SUMMARY_ID = process.argv[3] ?? "14c966d503a1d1b2";

async function jget(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

function fmt(atomicStr) {
  return (Number(atomicStr) / 1e6).toFixed(6);
}

async function main() {
  console.log(`[buyer-agent] target ${BASE}`);

  // 1) Probe the toll-booth: what would it cost an agent to commission research?
  const probe = await jget("/api/research/x402", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "what is direct air capture", papers: 3 }),
  });
  if (probe.status === 402) {
    const price = probe.headers?.get?.("x-kuot-price") ?? probe.body?.price?.dollars ?? "?";
    console.log(`[buyer-agent] toll-booth 402 → price ${price} to run research`);
  } else {
    console.log(`[buyer-agent] toll-booth returned HTTP ${probe.status}`);
  }

  if (!TOKEN) {
    console.error("[buyer-agent] DEV_PAY_TOKEN not set — cannot drive the server-side Gateway buyer. Probe only.");
    process.exit(probe.status === 402 ? 0 : 1);
  }

  // 2) Pay to cite a stored synthesis N times — real Gateway-batched settlements on Arc.
  let paid = 0;
  let firstBefore = null;
  let lastAfter = null;
  const settlements = [];
  for (let i = 0; i < COUNT; i++) {
    const r = await jget(`/api/dev/gateway-pay?id=${encodeURIComponent(SUMMARY_ID)}&token=${encodeURIComponent(TOKEN)}`);
    if (r.status !== 200 || r.body?.settlement?.settled !== true) {
      console.error(`[buyer-agent] payment ${i + 1} failed (HTTP ${r.status}):`, JSON.stringify(r.body).slice(0, 160));
      break;
    }
    if (firstBefore === null) firstBefore = r.body.before;
    lastAfter = r.body.after;
    paid++;
    // Decode the settlement tx id from the base64 facilitator response, if present.
    let tx = "";
    try { tx = JSON.parse(Buffer.from(r.body.settlement.response, "base64").toString()).transaction; } catch { /* ignore */ }
    settlements.push(tx);
    console.log(`[buyer-agent] cite #${i + 1} settled · Gateway balance ${r.body.before} → ${r.body.after}${tx ? ` · tx ${tx}` : ""}`);
  }

  console.log(`\n[buyer-agent] DONE — ${paid}/${COUNT} real A2A nanopayments settled on Arc.`);
  if (firstBefore !== null && lastAfter !== null) {
    const spent = Number(firstBefore) - Number(lastAfter);
    console.log(`[buyer-agent] Gateway balance ${firstBefore} → ${lastAfter} (spent ~${spent.toFixed(6)} USDC across ${paid} citations).`);
  }
  console.log(`[buyer-agent] settlement ids: ${settlements.filter(Boolean).join(", ") || "(see logs)"}`);
}

main().catch((e) => {
  console.error("[buyer-agent] error:", e?.message ?? e);
  process.exit(1);
});
