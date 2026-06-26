# Kuot × the Circle Agent Stack on Arc — live proof map

Every Circle/Arc primitive Kuot uses, with a real on-chain / API proof. All on **Arc testnet
(5042002)**; explorer https://testnet.arcscan.app. Operator/agent: `0x31481ADc…4a3e`.

| Circle / Arc primitive | How Kuot uses it | Live proof |
|---|---|---|
| **Arc L1** | Every contract + settlement lives here; gas paid in USDC, sub-second finality | 10 contracts deployed (below) |
| **Circle Gateway — nanopayments (batched)** | Reverse-x402 cite settled via `createGatewayMiddleware` verify+settle; gas-free batched | settlement `0c53ea2c-…`, buyer Gateway balance `0.9999 → 0.9998` |
| **x402** | Agent pays papers + reverse-x402 (cite Kuot); 402 challenge → PAYMENT-REQUIRED → settle | reverse-x402 `/api/summaries/14c966d503a1d1b2` → 402 + recursive split |
| **Circle Agent Wallets** (developer-controlled) | The agent has its own Circle wallet that **pays authors** via `createTransaction` | wallet `0x69906004…7cea`, tx `ab38c82f-f8ae-5873-921a-7360c7583cb1` (0.05 USDC) |
| **CCTP V2** | Cross-chain USDC: `depositForBurn` on Arc → message for Base (domain 6). Reproducible from code: `node scripts/cctp-burn.mjs` (TokenMessengerV2 `0x8FE6B999…`) | fresh burn tx `0x05b0cd2fb8f72a0eefcaf741fe0948f9481210b39df81d02cae25d56ae424ccd` (success, 7 logs) |
| **USDC** | Native gas (18-dec) + ERC-20 payments (6-dec) throughout | all txs |
| **EURC** | Multi-currency author payout — pay EU authors in EURC directly (no swap) | transfer `0x393469b110b0a0ae47d9cb2f9ce2d50c7cfcd8ff6468001547fbd28d45101062` (0.05 EURC) |
| **StableFX swap (USDC↔EURC)** | App Kit code ready (`src/lib/fx.ts`); LIVE swap via Kuot's own on-chain `StableFXPool` on Arc → swap-then-pay (`payAuthorEurcViaSwap`) | swap 1 USDC → 0.917240 EURC, tx `0x01c2e1fefceb7ba9711c0e2042cb85d693ea67e09c3258f4c1f7d597b8930cef` |
| **USYC** (tokenized treasury) | Unclaimed rewards accrue in a real ERC-4626 vault. NOTE: a **self-funded `MockUSYC` stand-in** on testnet (real USYC is institution-gated); the vault/redeem *mechanism* is real, the yield *source* is `simulateYield`, not treasuries | accrue 1.0 → vault +0.5 → redeem 1.5 (Foundry + on-chain) |
| **Contracts on Arc** | 10 Solidity contracts (Foundry): ledger, grounding, reputation bond, USYC vault, share, escrow, registry, bounty, agent-registry (ERC-8004), StableFX pool | see address table below |
| **ERC-8004** (agent identity/reputation) | AgentRegistry8004 (`0x53aaF839…`, 5 agents registered) + ReputationBond (directional, slashable) | reputation bump `0xe635fd27…` (researcher → rep 1); bond post→slash proven (Foundry + on-chain) |
| **proof-of-grounding** (Kuot novel) | keccak256 answer digest committed on-chain; only grounded authors paid | commit tx `0xad77a890…463c01ed` |
| **reverse-x402 recursive** (Kuot novel) | Cite Kuot → fraction flows back to original authors, depth after depth | recursive split @ `$0.000013`/author |

## On-chain settlements (AttributionLedger)
4 settled research queries → **27 author payouts** in real USDC (live read at `/dashboard/activity`).
- Example settle tx `0xd4f7988cc5ce80bcfa165eac7dcc9a6ac55f571ac0cebfe648b9df5418a7e36e`.
- **Full pipeline proven live end-to-end** (Venice `live` mode → grounding → x402 paper-buy → settle):
  research query "direct air carbon capture" → synthesis + 10 web citations + 8 weighted author
  shares; x402 paper payment tx `0x4e4c7b35eeabb0b4363f72b03b9ec1611d986f70144e04477a4ac66dda02f014`;
  `attestAndSplit` tx `0x30823b517ad509cb7f69afaa5b9aca76f44ecd537d64fc30745e9e1ec7e5db9a`
  (1 QueryAttested + 8 AuthorPaid, success); grounding-commit tx
  `0xd323872c6cc0ee497e2d658ff23dca2c4a1992892c5d0d3476256aebb8bf24e7`.
- Activity/author readers paginate `getLogs` from the ledger deploy block in <100k chunks
  (`src/lib/logs.ts`) — Arc caps ranges at 100k and moves fast, so a head-relative lookback would
  drop early attestations; anchoring at deploy keeps every payout visible.

## StableFX swap — now LIVE via an on-chain pool ✅ (was the only gap)
Circle's **App Kit Swap (StableFX USDC↔EURC)** has no route on Arc testnet (Circle-side; returns
`No route available`), and our App Kit code (`src/lib/fx.ts`, matches circlefin/arc-stablecoin-fx) is
ready for when a route ships. To make the swap **live now**, Kuot deploys its own on-chain
**`StableFXPool`** on Arc (`0x3B95B94BE1F0cAE3CFF64Ebdc82cB9397deDCEff`, seeded with USDC+EURC
liquidity): an author who elects euros gets a REAL on-chain USDC→EURC swap, then the swapped EURC is
transferred (`payAuthorEurcViaSwap` in `src/lib/eurc.ts`). No more bypass — the dollar→euro path is live.
- **Live swap proof:** 1 USDC → **0.917240 EURC**, tx
  `0x01c2e1fefceb7ba9711c0e2042cb85d693ea67e09c3258f4c1f7d597b8930cef` (pool reserves moved USDC 5→6,
  EURC 5→4.083; operator EURC 14.95→15.867). Deploy tx of the pool + 8 Foundry tests (`StableFXPool.t.sol`).
- **Reachable live:** `GET /api/fx?amount=1&from=USDC` (quote + reserves) · `GET /api/dev/fx-swap?token=…`
  (execute a real swap, server-side).
EURC-direct and CCTP-direct remain as additional live multi-currency / cross-chain rails.

## Contracts
See `DEPLOYED.md` for the full address table + the reproduce commands.
