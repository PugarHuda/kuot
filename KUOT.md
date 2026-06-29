# Kuot — architecture & build notes (Lepton · Canteen × Circle × Arc)

**Positioning:** *the recursive citation economy on Arc — every AI answer pays its sources a
nanopayment, and every agent that cites those answers pays again, compounding back to the
original authors, accruing USYC-style vault yield while unclaimed.*

## Stack
- **Frontend/API:** Next.js (App Router), viem/wagmi, Tailwind.
- **Chain:** Arc testnet (5042002), USDC-native gas, sub-second finality.
- **Payments:** Circle Gateway nanopayments (`@circle-fin/x402-batching`) + x402.
- **Wallets:** Circle Agent Wallets (`@circle-fin/developer-controlled-wallets`).
- **FX:** Circle App Kit Swap (USDC↔EURC, `SwapChain.Arc_Testnet`).
- **Yield:** USYC-style ERC-4626 vault (`MockUSYC` on testnet → USYC on mainnet).
- **LLM:** Venice AI (chat + web search + embeddings).
- **Contracts:** Solidity 0.8.24 / Foundry.

## Key modules
| Area | File |
|---|---|
| Gateway nanopayment client | `src/lib/gateway.ts` |
| Paper-pay (Gateway → fallback) | `src/lib/pay.ts` |
| Circle Agent Wallet | `src/lib/agent-wallet.ts` |
| StableFX (App Kit Swap) | `src/lib/fx.ts` |
| Proof-of-grounding | `src/lib/grounding.ts` + `contracts/src/GroundingRegistry.sol` |
| Recursive reverse-x402 | `src/lib/recursive.ts` + `src/app/api/summaries/[queryId]/route.ts` |
| Settlement | `src/lib/settlement.ts`, `src/app/api/settle/route.ts` |
| Multi-agent mesh | `src/lib/orchestrator.ts`, `agents.ts`, `agent.ts` |

## Contracts (Arc testnet — see DEPLOYED.md for addresses)
AttributionLedger · NameRegistry · UnclaimedEscrow · GroundingRegistry · ReputationBond ·
StableFXPool · MockUSYC + CitationYieldUSYC · ShareRegistry · AgentRegistry8004 · BountyMarket
(11 contracts).

## Differentiators
1. **Recursive reverse-x402** — being cited earns money; the citation graph pays itself.
2. **Proof-of-grounding before pay** — on-chain digest; only grounding authors are paid.
3. **USYC-style yield** — unclaimed rewards sit in a real ERC-4626 vault (deposit/redeem path is real on-chain; a self-funded stand-in on testnet since real USYC is institution-gated).
4. **Directional reputation-as-collateral** — USDC bond slashable on a false citation (ERC-8004).

## How it maps to judging
- **Agency** — multi-agent mesh + Fact-checker revise loop + agent decides what to buy, when to
  settle, FX/yield routing, and gates payment on proof-of-grounding.
- **Traction** — real on-chain settlements (AuthorPaid events) + reverse-x402 sub-cent payouts +
  MCP other agents can pay; unclaimed → USYC so payments flow without supply-side onboarding.
- **Circle tools** — Gateway · x402 · Agent Wallets · App Kit Swap · USYC · CCTP · Contracts · USDC/EURC.
- **Innovation** — recursive reverse-x402 + proof-of-grounding + directional reputation bond.

## Tests
102 Vitest + 59 Foundry green. `npm test` · `cd contracts && forge test`.
