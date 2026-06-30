# Kuot — Lepton Agents Hackathon submission (Canteen × Circle × Arc)

**Tagline:** The recursive citation economy on Arc — every AI answer pays its sources a
nanopayment, and every agent that cites those answers pays again.

**Builder:** Pugar Huda Mantoro · GitHub @PugarHuda · X @BangDropID

## Submission fields
- **GitHub repo:** https://github.com/PugarHuda/kuot
- **Video demo (≤3 min):** https://kuot-azure.vercel.app/demo.mp4 · pitch: https://kuot-azure.vercel.app/pitch.mp4
  (self-hosted on the live deploy; swap for a Loom/YouTube link if preferred)
- **Live product:** https://kuot-azure.vercel.app · author page: `/cited` · dashboard: `/dashboard`
- **Runs on Arc:** yes — **11 contracts live on Arc testnet (5042002)**, see `DEPLOYED.md`
  (addresses + proof txs). All settlement is real testnet USDC on-chain.

## What it is / the problem
AI agents consume human writing as free substrate — "the author writes, the model grounds, the
answer ships, and no money moves." Kuot turns every citation into a nanopayment: the agent
**pays** for the papers it reads (x402 on Arc via Circle Gateway), **grounds** an answer with a
Venice multi-agent mesh, commits a **proof-of-grounding** digest on-chain, then **splits USDC**
to the cited authors. When another agent later cites Kuot's answer, a fraction flows
**recursively** back to those original authors. Unclaimed shares are held in on-chain escrow
(and accrue vault yield) until the author binds their ORCID and withdraws.

## RFBs it spans
- **RFB-01 Autonomous Paying Agents** — the agent discovers, prices, and pays for sources on a
  hard budget it can't exceed (self-pricing + per-source bidding in `src/lib/pricing.ts`).
- **RFB-06 Creator & Publisher Monetization** — per-citation payouts to real authors; an
  onboarding funnel (`/cited`, ORCID claim, escrow) that turns citations into claimable USDC.
- **RFB-03 Agent-to-Agent** — recursive reverse-x402 (a paid MCP toll-booth + a citable answer)
  and directional reputation-as-collateral (ERC-8004 bond, slashable).

## Traction — REAL, on-chain, verifiable now (`GET /api/stats`)
Every number below is read live from Arc, not asserted:
- **366 authors hold a real claimable balance** in `UnclaimedEscrow` (**~$18.1 USDC escrowed**),
  seeded through the **genuine research→settle pipeline** across 50+ topics (CRISPR/prime editing,
  perovskite, LLM hallucination, solid-state & Li-S batteries, quantum EC, DAC, Alzheimer, GNN/ML
  drug discovery & protein folding, SOFC, transformers, gut-microbiome immunotherapy, superconducting
  hydrides, wildfire AQ, fusion, scRNA atlas, perovskite LEDs, coral bleaching, neuromorphic…).
  Marquee real researchers cited & owed: **Yoshua Bengio, John Hardy, Dennis Selkoe, Oriol
  Vinyals, Michael Saliba, Michaël Grätzel, Shengdar Tsai, M. I. Eremets, Léon Bottou.**
- **AttributionLedger:** 467 distinct authors paid across 504 `AuthorPaid` events, **~$20.3 USDC
  attributed** on-chain → **~$38 total attributed to sources** (ledger + escrow).
- **Real agent-to-agent volume:** an external buyer-agent paid Kuot **20+ times** via
  Gateway-batched reverse-x402 nanopayments on Arc (`npm run traction`; settlement ids printed,
  buyer Gateway balance visibly drops each time).
- **ORCID claim rail LIVE:** real ORCID OAuth is wired (`/dashboard/claim` → "Verify with ORCID"),
  and the on-chain bind→withdraw is proven (`scripts/prove-claim.mjs`). A **~190-author outreach
  list** with pre-filled claim links (`?orcid=…` opens straight to their live balance) + mail-merge.
- **Other agents can pay today:** the MCP server (`mcp/`) exposes `kuot_research_paid` (x402
  toll-booth) and `kuot_cite` (reverse-x402).

## Circle / Arc stack — what's real vs. honest about
- **Circle Gateway nanopayment batching** — real `createGatewayMiddleware` verify+settle on Arc;
  the headline integration (the reverse-x402 endpoints settle batched on-chain).
- **x402 + recursive reverse-x402** — real paid endpoints (`/api/research/x402`, `/api/summaries`),
  MCP toll-booth, recursive author split.
- **Circle Agent Wallets (developer-controlled)** — the agent pays its **top source directly from
  its own Circle wallet inside the real `/api/settle` loop** (not just a dev proof).
- **CCTP V2** — **full cross-chain round-trip proven**: `depositForBurn` on Arc (domain 26→6) →
  Circle attestation → `receiveMessage` mint on Base. `scripts/cctp-burn.mjs` + `cctp-mint.mjs`;
  burn `0x05b0cd2f…` (Arc) → mint `0x62f3fabe…` (Base Sepolia, success).
- **EURC** — real multi-currency author payout (direct + swap-then-pay).
- **StableFX swap** — Circle's App Kit StableFX has **no Arc route**, so Kuot runs its **own**
  on-chain `StableFXPool` (honest: a bespoke AMM, not the App Kit product).
- **USYC** — a real ERC-4626 vault **mechanism**; honest caveat: it's a **self-funded `MockUSYC`
  stand-in** (real USYC is institution-gated), so the redeem path is real but the yield is seeded.
- **ERC-8004** — AgentRegistry (5 agents) + directional ReputationBond, deployed and exercised.
- **USDC** native gas + ERC-20 throughout. **11 Solidity contracts** on Arc (Foundry).

## Agentic sophistication
Venice multi-agent mesh: Planner → parallel Readers → Synthesizer → Fact-checker revision loop →
Summarizer, with embeddings-weighted relevance driving the payout split. The agent **self-prices**
its citation fee and recursive author-share by fact-checker confidence × grounding depth, and
**bids per source** by rank/budget — then gates payment on an on-chain proof-of-grounding digest.

## Security / integrity (hardened this cycle)
A 3-agent adversarial audit found and **fixed** fail-open money endpoints (dev payout, FX, Gateway,
venice-x402, settle) — all now **fail closed** behind a constant-time operator token; the public
attest path that could DoS real payouts is closed; ORCID demo-verify fails closed against real
authors. **No runtime mocks**; the only stubs (USYC yield) are now labeled honestly in the docs.

## Repro
`KUOT.md` (architecture) · `DEPLOYED.md` (addresses + proof txs) · `CIRCLE-STACK.md` (per-primitive
proof) · `INTEGRATE.md` (adopt it) · `DEMO.md` (3-min script) · `FEEDBACK.md` (Circle/Arc DX).
Tests: **108 Vitest + 59 Foundry green**. Drive traction yourself: `npm run traction`.
