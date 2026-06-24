# Kuot — the recursive citation economy on Arc

> *Kuot* (from Indonesian *kutip*, "to cite") is an autonomous AI research agent. It pays for
> the papers it reads with **x402 nanopayments** on **Arc**, then splits **USDC** back to every
> author whose work **grounded** the answer — gas-free and batched via **Circle Gateway**. Every
> answer is itself a paid resource: when another agent cites Kuot, a fraction flows **recursively**
> back to the original authors. Unclaimed rewards earn **real USYC yield** until they're claimed.

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
- **Recursive reverse-x402** — being cited earns money; the citation graph pays itself, depth after depth.
- **Proof-of-grounding before pay** — an on-chain digest; only grounding authors are paid.
- **USYC-backed yield** — unclaimed rewards earn real tokenized-treasury yield (ERC-4626 vault).
- **Directional reputation-as-collateral** — USDC bond, slashable on a false citation (ERC-8004) —
  trust as a from→to→context vector, not a single score.

## Circle / Arc stack
Gateway nanopayments · x402 · Agent Wallets · StableFX swap (on-chain USDC↔EURC) · USYC · CCTP ·
Contracts · USDC + EURC. **10 contracts live on Arc testnet** (5042002) — see `DEPLOYED.md` for
addresses + the on-chain proof transactions.

## Architecture
```
User → /research ──► Agent (pays papers via x402/Gateway on Arc)
                       │
                       ├─ Planner → Readers ×N → Fact-checker → Summarizer   (Venice)
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
Contracts: `cd contracts && forge test` (80 Vitest + 59 Foundry green). Deploy with
`forge script script/Deploy.s.sol` then `script/DeployKuot.s.sol` (see `DEPLOYED.md`).

## Integrate (MCP)
Other agents can use — and **pay** — Kuot via the MCP server in `mcp/` (tools `kuot_research`,
`kuot_cite`, `kuot_authors`). See `mcp/README.md`.

## Docs
`CIRCLE-STACK.md` (every Circle primitive + live proof) · `KUOT.md` · `DEPLOYED.md` (addresses + proof txs) · `DEMO.md`
(3-min demo script) · `SUBMISSION.md` · `FEEDBACK.md` (Circle/Arc DX). MIT licensed.
