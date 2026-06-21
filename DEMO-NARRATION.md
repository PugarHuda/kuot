# Kuot — word-for-word demo narration (≤ 3 min)

Read the **SAY** lines aloud; do the **DO** actions on screen. Record at 1080p, captions on.
Everything below uses live, working URLs/ids. Total ≈ 2:50.

> Pre-roll (not filmed): open two tabs — (1) `https://kuot-azure.vercel.app`, (2) ArcScan
> `https://testnet.arcscan.app`. Have this script on a second monitor/phone.

---

## 0:00–0:15 — Hook
**DO:** Show the Kuot homepage (hero: "the recursive citation economy on Arc").
**SAY:** "AI reads human research as free substrate and pays the authors nothing. Kuot fixes that.
It's an agent that pays for the papers it reads, and pays the authors it cites — in nanopayments,
on Arc. And when another agent cites Kuot, the money flows back again."

## 0:15–0:55 — The agent researches & pays sources (Agency + x402)
**DO:** Click **Research**. Type *"best carbon capture methods 2026"*. Click **research**.
Let the live agent ticker run; point at the steps.
**SAY:** "I ask a question. The agent searches the literature, then a mesh of sub-agents — Planner,
parallel Readers, a Fact-checker — read it with Venice. It decides which papers are worth buying and
pays for them with an x402 nanopayment on Arc. These are real decisions and real testnet USDC."
**DO:** When results appear, point at the cited authors + payout split.
**SAY:** "Out come the grounded authors, each with a share — only the ones whose work actually
grounded the answer get paid."

## 0:55–1:25 — Proof-of-grounding + settlement on Arc (Contracts + Innovation)
**DO:** Open the **Activity** page (it shows real on-chain data: attestations + author payouts).
**SAY:** "Every run is settled on-chain. Here are real attestations on Arc — three queries, nineteen
author payouts already, in real USDC. Each settlement also commits a tamper-evident digest of the
answer, so payment is bound to proof-of-grounding — you only pay a source once it's proven it
grounded the answer."
**DO:** Click one tx → ArcScan tab showing the on-chain transaction.

## 1:25–2:05 — Recursive reverse-x402 (the headline)
**DO:** In a terminal, run the server-side buyer (or show the JSON):
`https://kuot-azure.vercel.app/api/dev/gateway-pay?token=ab955bc58c44b103&id=14c966d503a1d1b2`
**SAY:** "Now the recursive part. Kuot's own answers are a paid resource. Here another agent pays one
ten-thousandth of a dollar — a true nanopayment — to cite Kuot's synthesis. Circle Gateway verifies
and settles the batch on Arc: watch the Gateway balance drop. And seventy percent of that payment
flows recursively back to the original authors — at thirteen millionths of a dollar each. Being
cited earns money; the citation graph pays itself, depth after depth."
**DO:** Point at `"settled": true` and the per-author recursive split in the JSON.

## 2:05–2:30 — Real yield + claim (USYC + ORCID)
**DO:** Open **Claim earnings**; click **Demo verify (test ORCID)** → bind.
**SAY:** "Authors claim by proving their ORCID. Until they do, their unclaimed rewards aren't idle —
they earn real treasury yield in a USYC vault. Reputation is staked as collateral, slashable on a
false citation. Nothing here is mocked away."

## 2:30–2:50 — Traction & close
**DO:** Back to **Activity** / **Overview** showing the live totals.
**SAY:** "Eight contracts live on Arc, real USDC flowing, an MCP other agents can pay today, and a
recursive economy that compounds. This is the beginning — we keep building past June twenty-ninth."
**DO:** End on the repo + live URL on screen.

---

## On-screen assets to have ready
- `https://kuot-azure.vercel.app` — Home · Research · Activity · Claim
- ArcScan tx (from `DEPLOYED.md`): grounding `0xad77a890…`, a settle tx `0xd4f7988c…`
- Terminal/browser for `…/api/dev/gateway-pay?token=ab955bc58c44b103&id=14c966d503a1d1b2`
- Reverse-x402 citable ids: `14c966d503a1d1b2`, `6ead66b614743c6e`, `088673f719c0f0b0`

## One-liner for the submission form
"Kuot — the recursive citation economy on Arc. An AI agent pays for the sources it reads with x402
nanopayments and splits USDC back to the authors who grounded the answer; cite Kuot and a fraction
flows back again. Live, on Arc, with real on-chain settlements."
