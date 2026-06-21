#!/usr/bin/env node
/** Verify reverse-x402 end-to-end: research -> publish -> cite (402) -> paid (200 + recursive split). */
const BASE = (process.argv[2] ?? "https://kuot-azure.vercel.app").replace(/\/$/, "");
const query = process.argv[3] ?? "carbon capture methods 2026";

async function j(path, init) { const r = await fetch(`${BASE}${path}`, init); return { status: r.status, body: await r.json().catch(() => null) }; }

console.log("1) research…");
const res = await j("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, papers: 3 }) });
console.log("   venice=%s grounded=%d", res.body?.venice, res.body?.payouts?.length);

console.log("2) publish to share store (on-chain ShareRegistry)…");
const share = await j("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result: res.body }) });
console.log("   share:", share.status, JSON.stringify(share.body));
const id = share.body?.id;
if (!id) { console.log("   no share id — aborting"); process.exit(1); }

console.log("3) cite WITHOUT payment → expect 402…");
const unpaid = await j(`/api/summaries/${id}`, {});
console.log("   status:", unpaid.status, "| price:", unpaid.body?.accepts?.[0]?.maxAmountRequired, "| extra:", JSON.stringify(unpaid.body?.accepts?.[0]?.extra));

console.log("4) cite WITH payment header → expect 200 + recursive split…");
const paid = await j(`/api/summaries/${id}`, { headers: { "Payment-Signature": "demo" } });
console.log("   status:", paid.status);
if (paid.status === 200) {
  const r = paid.body.recursive;
  console.log("   recursiveBps:", r?.recursiveBps, "| toAuthorsUSDC:", r?.toAuthorsTotalUSDC, "| authors:", r?.authors?.length);
  console.log("   → original authors paid recursively:", (r?.authors ?? []).slice(0, 3).map((a) => `${a.identity}:$${a.amountUSDC}`).join(", "));
}
