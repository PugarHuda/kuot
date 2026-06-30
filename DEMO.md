# Kuot — demo video script (≤ 3 min, shot-by-shot)

Goal for the judges: show **real agency** (the agent decides + pays), **real on-chain USDC
flow on Arc** (traction), **deep Circle-stack use** (Gateway/x402/USYC/StableFX/Contracts),
and the **novel** bits (recursive reverse-x402, proof-of-grounding, reputation-as-collateral).
Record at 1080p, captions on. Keep each beat tight — aim ~20s each.

> Pre-roll setup (not filmed): `.env` filled, contracts live on Arc (DEPLOYED.md), app on Vercel,
> one funded Gateway balance. Have ArcScan (testnet.arcscan.app) open in a second tab.
> Note: the in-app "Set budget" (ERC-7715) step is **MetaMask-Flask-only and optional** — on a normal
> wallet skip it and go straight to "Ask a research question"; the agent runs under its own operator budget.

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
  only authors whose work grounded the answer get paid). Call out the **Adjudicator**: the agent
  itself decided how the payment splits across the sources AND the total USDC — not a fixed formula.
- Click **Settle**. Cut to ArcScan: `attest` tx + the `GroundingRegistry.commit` tx (digest).
- VO: "We commit a tamper-evident digest and pay only proven sources — closing the
  pay-then-maybe-delivered gap."

## 1:25–1:55 — Unclaimed rewards accrue (ERC-4626) + EURC + the agent's OWN wallet pays
- Show an unclaimed author's escrow + the ERC-4626 vault redeem: `currentValue` 1.0 → +vault → **1.5 USDC**.
- VO: "Unclaimed rewards sit in an ERC-4626 vault and accrue until claimed — a USYC-style stand-in on
  testnet (real USYC is institution-gated). EU authors can take EURC; the on-chain USDC↔EURC swap runs
  on our own StableFX pool since Circle's App Kit has no Arc route yet."
- Beat (Agent Wallets): show the `/api/settle` response `agentWallet.transactionId` — the agent pays its
  top source DIRECTLY from its own **Circle Agent Wallet** (developer-controlled, MPC-signed), in-loop.

## 1:55–2:30 — Recursive reverse-x402 (the headline, RFB-03)
- Open the MCP tool (Claude Desktop/Cursor) — another agent calls `kuot_cite(queryId)`.
- Show the 402 → pay → 200, and the **recursive split**: a fraction flows BACK to the original
  authors. VO: "Being cited earns money. The citation graph pays itself, depth after depth."
- (Optional) show `ReputationBond.trustVector` — capital staked behind a route, slashable.
- (Optional, judge-facing) Open a share page `/r/<id>` and click **"Cite this answer — pay from your
  wallet"**: pay the toll from your OWN wallet in ~60s and become a **verifiable non-operator payer**
  on Arc (`GET /api/stats` → `externalPayers`/`externalPaidUSDC`, chain truth that can't be self-seeded).

## 2:30–3:00 — Traction & close
- Run it live: `npm run traction -- 5` — an external **buyer agent** pays the x402 toll-booth +
  cites Kuot 5×; each line is a real Gateway-batched settlement on Arc (tx ids printed).
- Cut to `/dashboard` + `GET /api/stats`: **366 authors hold a real on-chain balance ($18.1 escrowed)**,
  467 cited / 504 payouts / **$20.3 attributed** (~$38 total to sources) — all read live from Arc.
- VO: "Eleven contracts live on Arc, 366 researchers already hold a balance and 467 are cited, 20+ real
  agent-to-agent payments, a proven CCTP cross-chain round-trip, an MCP other agents can pay today. This
  is the beginning — we keep building past the event." End on repo + live URL (`/cited` for authors).

## Shot list / assets
- Browser: `/dashboard/research`, `/dashboard/activity`, `/dashboard/agents`.
- ArcScan tabs pre-opened to the deploy txs + a payment tx (from DEPLOYED.md).
- Terminal/Claude Desktop with the Kuot MCP connected (`kuot_research`, `kuot_cite`).
- Lower-third captions for each Circle product as it appears (Gateway, x402, USYC, App Kit, Contracts).
