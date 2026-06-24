# Kuot × the Circle Agent Stack on Arc — live proof map

Every Circle/Arc primitive Kuot uses, with a real on-chain / API proof. All on **Arc testnet
(5042002)**; explorer https://testnet.arcscan.app. Operator/agent: `0x31481ADc…4a3e`.

| Circle / Arc primitive | How Kuot uses it | Live proof |
|---|---|---|
| **Arc L1** | Every contract + settlement lives here; gas paid in USDC, sub-second finality | 8 contracts deployed (below) |
| **Circle Gateway — nanopayments (batched)** | Reverse-x402 cite settled via `createGatewayMiddleware` verify+settle; gas-free batched | settlement `0c53ea2c-…`, buyer Gateway balance `0.9999 → 0.9998` |
| **x402** | Agent pays papers + reverse-x402 (cite Kuot); 402 challenge → PAYMENT-REQUIRED → settle | reverse-x402 `/api/summaries/14c966d503a1d1b2` → 402 + recursive split |
| **Circle Agent Wallets** (developer-controlled) | The agent has its own Circle wallet that **pays authors** via `createTransaction` | wallet `0x69906004…7cea`, tx `ab38c82f-f8ae-5873-921a-7360c7583cb1` (0.05 USDC) |
| **CCTP V2** | Cross-chain USDC: `depositForBurn` on Arc → message for Base (domain 6) | burn tx `0xceb08d128510915eed26c6b4f300dbaf8abf85d2b87ebd102ec3fb16c2f05715` |
| **USDC** | Native gas (18-dec) + ERC-20 payments (6-dec) throughout | all txs |
| **EURC** | Multi-currency author payout — pay EU authors in EURC directly (no swap) | transfer `0x393469b110b0a0ae47d9cb2f9ce2d50c7cfcd8ff6468001547fbd28d45101062` (0.05 EURC) |
| **USYC** (tokenized treasury) | Unclaimed author rewards earn real ERC-4626 vault yield (`MockUSYC` on testnet → USYC on mainnet) | accrue 1.0 → vault +0.5 → claim 1.5 (Foundry + on-chain) |
| **Contracts on Arc** | 8 Solidity contracts (Foundry): ledger, grounding, reputation bond, USYC vault, share, escrow, registry, bounty | see address table below |
| **ERC-8004** (agent identity/reputation) | AgentRegistry8004 + ReputationBond (directional, slashable) | bond post→slash proven (Foundry + on-chain) |
| **proof-of-grounding** (Kuot novel) | keccak256 answer digest committed on-chain; only grounded authors paid | commit tx `0xad77a890…463c01ed` |
| **reverse-x402 recursive** (Kuot novel) | Cite Kuot → fraction flows back to original authors, depth after depth | recursive split @ `$0.000013`/author |

## On-chain settlements (AttributionLedger)
3 settled research queries → **19 author payouts** in real USDC (see `/dashboard/activity`). Example
settle tx `0xd4f7988cc5ce80bcfa165eac7dcc9a6ac55f571ac0cebfe648b9df5418a7e36e`.

## The one Circle primitive NOT live — and why
**App Kit Swap (StableFX USDC↔EURC)**: no swap route exists on Arc testnet yet (Circle-side; returns
`No route available`). Our App Kit code is correct (matches circlefin/arc-stablecoin-fx). We **bypass
the gap** with EURC-direct payouts (above) and CCTP-direct cross-chain (above) — so multi-currency and
cross-chain are both demonstrably live without depending on the missing swap route.

## Contracts
See `DEPLOYED.md` for the full address table + the reproduce commands.
