# Kuot — Lepton Agents Hackathon submission (Canteen × Circle × Arc)

**Tagline:** The recursive citation economy on Arc — every AI answer pays its sources a
nanopayment, and every agent that cites those answers pays again.

**Builder:** Pugar Huda Mantoro · GitHub @PugarHuda · Discord hajislamet

## Submission fields
- **GitHub repo (required):** https://github.com/PugarHuda/kuot
- **Video demo (≤3 min, required):** <Loom/YouTube URL — record per DEMO.md>
- **Live product link (encouraged):** https://kuot-azure.vercel.app
- **Runs on Arc:** yes — 7 contracts live on Arc testnet (5042002), see `DEPLOYED.md`. Real
  testnet USDC flows on-chain (deploy + 8 proof txs documented).

## What it is / the problem
AI agents and aggregators consume human writing as free substrate — "the author writes, the
model grounds, the answer ships, and no money moves." Kuot turns every citation into a
nanopayment: the agent **pays** for the papers it reads (x402 on Arc via Circle Gateway),
**grounds** an answer, and **splits USDC** to the cited authors. When another agent later
cites Kuot's answer, a fraction flows **recursively** back to those original authors.

## RFBs it spans
- **RFB-01 Autonomous Paying Agents** — the agent discovers, prices, and pays for sources on a
  budget (Canteen's own example build: "ResearchAgent: pays for premium sources and papers").
- **RFB-06 Creator & Publisher Monetization** — per-citation payouts to authors; unclaimed
  rewards earn real yield until claimed.
- **RFB-03 Agent-to-Agent** — recursive reverse-x402 + reputation-as-collateral.

## How it scores
- **Agentic sophistication (30%):** multi-agent mesh (Planner→Researcher→Reader fan-out→
  Fact-checker revision loop→Summarizer); the agent decides which sources are worth paying for,
  the sub-cent price, when an answer is grounded, and gates payment on proof.
- **Traction (30%):** real on-chain USDC on Arc (deploy + 8 proof txs in `DEPLOYED.md`); demand-
  side self-generates volume (1 query ≈ N citation payments); an **MCP server** other agents can
  call and pay today (`mcp/`); unclaimed payouts escrow on-chain so payments flow without
  blocking on author onboarding. Metrics surfaced: total autonomous payments, avg tx size
  (sub-cent), authors paid, payment-chain depth.
- **Circle tool usage (20%):** Gateway nanopayments + x402 (paying agent + reverse-x402),
  Agent Wallets, **App Kit Swap (StableFX USDC↔EURC)**, **USYC** real-yield vault, CCTP (via
  Gateway withdraw), Contracts (7 deployed), USDC + EURC.
- **Innovation (20%):** recursive reverse-x402 (the citation graph pays itself), proof-of-
  grounding committed on-chain before pay, and directional reputation-as-collateral (ERC-8004;
  trust as a from→to→context vector at risk, not a single score).

## Traction (verified live on Arc, see /dashboard/activity)
- **Real settlements flowing:** research→settle ran end-to-end on the live deployment with **real
  Venice LLM**; the AttributionLedger has settled queries emitting `AuthorPaid` events and moving
  real USDC to ~19 author wallets (split across 3 seeded queries; ongoing).
- **Reverse-x402 works live:** publish a synthesis → cite it for **$0.0001** (Gateway-batched x402
  challenge) → a recursive split pays the **original authors at $0.000013 each** (true sub-cent
  nanopayments). Example: `GET /api/summaries/14c966d503a1d1b2`.
- **Users onboarded:** <fill at submit> — target: real ORCID authors bound on-chain + other
  hackathon agents paying via the MCP (`mcp/`). Unclaimed shares escrow on-chain so payments flow
  without blocking on supply-side onboarding.
- **User problem:** creators/authors earn nothing when AI grounds answers in their work; Kuot
  pays them per citation, automatically, at a scale that was previously too small to clear.

## Repro
`KUOT.md` (architecture + build log) · `DEPLOYED.md` (addresses + proof txs) · `FEEDBACK.md`
(Circle/Arc DX) · `mcp/README.md` (integration). Tests: 80 Vitest + 51 Foundry green.
