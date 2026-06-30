# Kuot — the recursive citation economy on Arc

> *Kuot* (from Indonesian *kutip*, "to cite") is an autonomous AI research agent. It pays for
> the papers it reads with **x402 nanopayments** on **Arc**, then splits **USDC** back to every
> author whose work **grounded** the answer — gas-free and batched via **Circle Gateway**. Every
> answer is itself a paid resource: when another agent cites Kuot, a fraction flows **recursively**
> back to the original authors. Unclaimed rewards accrue yield in a **USYC-style ERC-4626 vault**
> (a self-funded `MockUSYC` stand-in on testnet — real USYC is institution-gated — with the same
> deposit/redeem interface) until they're claimed.

Built for the **Lepton Agents Hackathon — Canteen × Circle × Arc** (June 2026).

**🔗 Live: https://kuot-azure.vercel.app · Repo: https://github.com/PugarHuda/kuot · On-chain: `DEPLOYED.md`**

---

## What it does, in one run
1. **Pay the sources.** The agent buys each paper it needs with an x402 nanopayment, settled on
   Arc in USDC (gas-free, sub-cent via Circle Gateway), under a budget cap it can never exceed.
2. **Ground the answer.** A Planner, parallel Readers and a Fact-checker reason over the papers
   (Venice AI). **Proof-of-grounding** commits a tamper-evident keccak256 digest on-chain so only
   the authors whose work actually grounded the answer get paid.
3. **Pay the authors — then pay them again.** Every citation pays its author a nanopayment via
   `AttributionLedger.attestAndSplit`. Unclaimed shares accrue **USYC** yield until the author
   binds an ORCID and claims. When another agent **cites Kuot** (reverse-x402), a fraction of that
   payment flows recursively back to the original authors.

## Differentiators
- **The agent decides the payout** — an Adjudicator LLM step splits the citation payment across the
  sources by how much each actually grounded the answer, and sets the total USDC (clamped 0.05–1.00);
  embedding/rank weighting is only the fallback. A genuine economic decision (`src/lib/orchestrator.ts`).
- **Cite from your own wallet** — the public share page (`/r/[id]`) lets any reader pay Kuot's reverse-x402
  toll from their OWN wallet (one on-chain USDC transfer on Arc, verified by the existing tx-hash acceptor).
  `GET /api/stats` exposes `externalPayers`/`externalPaidUSDC` — distinct **non-operator** wallets that paid
  on-chain (chain truth, excludes the operator). A judge can generate verifiable external traction in ~60s.
- **Recursive reverse-x402** — being cited earns money; the citation graph pays itself, depth after depth.
- **Proof-of-grounding before pay** — an on-chain digest; only grounding authors are paid.
- **USYC-style yield** — unclaimed rewards accrue in a real ERC-4626 vault (a self-funded `MockUSYC`
  stand-in on testnet; real USYC is institution-gated but shares the same redeem interface).
- **Directional reputation-as-collateral** — USDC bond, slashable on a false citation (ERC-8004) —
  trust as a from→to→context vector, not a single score.
- **Agent-payable toll-booth** — external agents pay Kuot to research via `POST /api/research/x402`
  (Gateway x402, $0.001/paper) and via the `kuot_research_paid` MCP tool; one payment fans out to authors.
- **The agent quotes its own work** — a Kuot answer self-prices its citation fee and its recursive
  author-share by the fact-checker's confidence × grounding depth, and **bids** per source (rank/budget),
  instead of one flat price (`src/lib/pricing.ts`).
- **Real publisher sources** — `webSources` augments the academic corpus with live articles (Google
  News RSS / self-hosted RSSHub); a citation-toll settles to the publisher (Prior Art #01).
- **Author onboarding** — `GET /api/stats` (on-chain `authorsOnboarded` + attributed) and a shareable
  referral claim link (`/dashboard/claim?orcid=…`) turn citations into real, claimable earnings.

## Circle / Arc stack
Gateway nanopayments · x402 · Agent Wallets · StableFX swap (on-chain USDC↔EURC) · USYC · CCTP ·
Contracts · USDC + EURC. **11 contracts live on Arc testnet** (5042002) — see `DEPLOYED.md` for
addresses + the on-chain proof transactions.

## Architecture
```
User → /research ──► Agent (pays papers via x402/Gateway on Arc)
                       │
                       ├─ Planner → Readers ×N → Fact-checker → Summarizer → Adjudicator   (Venice)
                       ├─ proof-of-grounding  → GroundingRegistry.commit(digest)
                       └─ settle → AttributionLedger.attestAndSplit ──► authors paid (USDC)
                                     │                                   └─ unclaimed → USYC yield
                                     └─ reverse-x402 (/api/summaries) ──► cite Kuot → recursive split
```

## Run it
```bash
npm install
cp .env.example .env     # fill ARC_RPC_URL, contract addresses, CIRCLE_*/VENICE_API_KEY
npm run dev              # http://localhost:3000
```
Contracts: `cd contracts && forge test` (109 Vitest + 59 Foundry green). Deploy with
`forge script script/Deploy.s.sol` then `script/DeployKuot.s.sol` (see `DEPLOYED.md`).
E2E: `npm run e2e` — 6 Playwright click-through tests against the live deploy (nav, docs,
claim, research box, and the Cite-from-wallet button's no-wallet graceful failure).

## Reproduce the traction
Drive real agent-to-agent payment volume yourself — an external agent probes the x402
toll-booth and pays to cite Kuot, settling Gateway-batched nanopayments on Arc:
```bash
DEV_PAY_TOKEN=… KUOT_BASE_URL=https://kuot-azure.vercel.app npm run traction -- 5
```
Each iteration is a real on-chain settlement (printed with its tx id); a fraction flows
recursively back to the cited authors. Live totals: `GET /api/stats` and `/dashboard`.

## Integrate (MCP)
Other agents can use — and **pay** — Kuot via the MCP server in `mcp/` (`npm run mcp`):
tools `kuot_research`, **`kuot_research_paid`** (x402 toll-booth), `kuot_cite` (reverse-x402),
`kuot_authors`. See `mcp/README.md`.

## For authors & communities
- **Authors:** [kuot-azure.vercel.app/cited](https://kuot-azure.vercel.app/cited) — a problem-first
  page (no crypto jargon): enter your ORCID, see what your citations have earned, claim in 2 minutes.
- **Publishers / communities:** `INTEGRATE.md` — add citation payments to your feed/catalog three ways
  (point agents at your sources · a claim link for contributors · a paid x402 endpoint).

## Docs
`CIRCLE-STACK.md` (every Circle primitive + live proof) · `KUOT.md` · `DEPLOYED.md` (addresses + proof txs) · `DEMO.md`
(3-min demo script) · `INTEGRATE.md` (adopt it for your community) · `SUBMISSION.md` · `FEEDBACK.md` (Circle/Arc DX). MIT licensed.
