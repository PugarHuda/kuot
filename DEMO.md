# Kuot — demo video script (≤ 3 min, shot-by-shot)

Goal for the judges: show **real agency** (the agent decides + pays), **real on-chain USDC
flow on Arc** (traction), **deep Circle-stack use** (Gateway/x402/USYC/StableFX/Contracts),
and the **novel** bits (recursive reverse-x402, proof-of-grounding, reputation-as-collateral).
Record at 1080p, captions on. Keep each beat tight — aim ~20s each.

> Pre-roll setup (not filmed): `.env` filled, contracts live on Arc (DEPLOYED.md), app on Vercel,
> one funded Gateway balance. Have ArcScan (testnet.arcscan.app) open in a second tab.

## 0:00–0:15 — Hook
- On screen: the one-liner — *"Kuot: the recursive citation economy on Arc. Every AI answer
  pays its sources a nanopayment — and every agent that cites those answers pays again."*
- VO: "AI reads human work as free substrate. Kuot makes every citation a payment."

## 0:15–0:50 — Agent researches & PAYS sources (RFB-01, agency + x402)
- Type a real question in `/dashboard/research` (e.g. "best carbon-capture methods 2026").
- Show the live agent ticker: Search → **Pay paper via x402 (Gateway, Arc)** → Read → Attribute → Settle.
- Call out the agent's DECISIONS: which paper to buy, the sub-cent price, the budget cap.
- Cut to ArcScan: the USDC payment tx on Arc. VO: "Real testnet USDC, gas-free, sub-second."

## 0:50–1:25 — Proof-of-grounding + settlement on Arc (Contracts + innovation)
- Show the result: synthesis + the grounded authors (note some citations were **dropped** —
  only authors whose work grounded the answer get paid).
- Click **Settle**. Cut to ArcScan: `attest` tx + the `GroundingRegistry.commit` tx (digest).
- VO: "We commit a tamper-evident digest and pay only proven sources — closing the
  pay-then-maybe-delivered gap."

## 1:25–1:55 — Real yield while unclaimed (USYC) + multi-currency (EURC)
- Show an unclaimed author's escrow growing: `currentValue` 1.0 → after vault yield → **1.5 USDC**.
- VO: "Unclaimed rewards aren't idle — they earn real on-chain yield in a USYC vault until the
  author claims. EU authors can take EURC via Circle App Kit Swap."

## 1:55–2:30 — Recursive reverse-x402 (the headline, RFB-03)
- Open the MCP tool (Claude Desktop/Cursor) — another agent calls `kuot_cite(queryId)`.
- Show the 402 → pay → 200, and the **recursive split**: a fraction flows BACK to the original
  authors. VO: "Being cited earns money. The citation graph pays itself, depth after depth."
- (Optional) show `ReputationBond.trustVector` — capital staked behind a route, slashable.

## 2:30–3:00 — Traction & close
- Dashboard: total autonomous payments, avg tx size (sub-cent), authors paid, payment-chain depth.
- VO: "Seven contracts live on Arc, real USDC flowing, an MCP other agents can pay today.
  This is the beginning — we keep building past June 29." End on repo + live URL.

## Shot list / assets
- Browser: `/dashboard/research`, `/dashboard/activity`, `/dashboard/agents`.
- ArcScan tabs pre-opened to the deploy txs + a payment tx (from DEPLOYED.md).
- Terminal/Claude Desktop with the Kuot MCP connected (`kuot_research`, `kuot_cite`).
- Lower-third captions for each Circle product as it appears (Gateway, x402, USYC, App Kit, Contracts).
