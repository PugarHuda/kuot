# Kuot — Arc Testnet deployment (chain 5042002)

**Live app: https://kuot-azure.vercel.app** · **Repo: https://github.com/PugarHuda/kuot**
Explorer: https://testnet.arcscan.app · Gas paid in USDC (native).

Verified live in production: `/api/research` runs the agent with **real Venice LLM**, commits a
grounding digest, and produces a paid-author plan; Circle **Agent Wallet** created live on Arc
(`0x69906004c174c84ba9082f0f85dfa08ca7eb7cea`, funded 2 USDC).
Deployer/operator/agent: `0x31481ADc889B5e00b70846F59967DAF09CBe4a3e`

## Contracts (live on Arc testnet)
| Contract | Address |
|---|---|
| AttributionLedger | `0x6a1AB9C4Cfd7bd65397DC5dDa92d19fA8D49173e` |
| NameRegistry | `0x4bc59e385Be039C42eB32f00C473a8e1B1a76E1C` |
| UnclaimedEscrow | `0xf7E7c1619F9C5F3cDcCd1B209fdE0AedA4025812` |
| GroundingRegistry | `0x18FfEEbb779eDF44733C8EFcefeF70fB929636D1` |
| ReputationBond | `0xEBfe7B62cC6e383551c61d13437157E0Fe46f463` |
| AgentRegistry8004 (ERC-8004 identity/reputation) | `0x53aaF8397E518f2529e1682b9A03D73537B23f9d` |
| MockUSYC (yield vault) | `0xEe59BD14b54F48D769032c0950a773d41E12115d` |
| CitationYieldUSYC | `0x9E48A2D1501A1DB6A77b7bb325B2C22070be28d8` |
| ShareRegistry (reverse-x402 store) | `0x25BC0d7eA9B574CF47D7018cfBc5a1627F3227Df` |
| USDC (Arc erc20) | `0x3600000000000000000000000000000000000000` |
| Circle GatewayWallet (pre-existing) | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |

## Live on-chain proofs (real USDC moved on Arc)
**Proof-of-grounding** — `GroundingRegistry.commit`
- tx `0xad77a890ee39fe4327d3455f2c140bf21d4ff02dc4f332419f118329463c01ed` (block 47802177, status success)
- `isGrounded(queryId, authorHash)` → `true`; `verify(queryId, digest)` → `true`

**USYC real yield** — `CitationYieldUSYC` over `MockUSYC` vault
- `accrue` 1.0 USDC → `currentValue` = 1.000000, `pendingYield` = 0
- `MockUSYC.simulateYield` 0.5 USDC → `currentValue` = **1.500000**, `pendingYield` = **0.500000**
- → an unclaimed author redeems principal + real on-chain yield (not subsidised)

**Circle Gateway nanopayments** — FULLY SETTLING end-to-end ✅
- Agent's Gateway balance funded with a **real on-chain deposit** (1 USDC): approve `0xdb70b578…`,
  deposit `0x2e8364a4…`.
- A real `GatewayClient` pays the reverse-x402 `/api/summaries/[id]` endpoint for **$0.0001**; the
  route runs Circle's `createGatewayMiddleware().require()` which **verifies + settles the batch on
  Arc**. Proven: buyer Gateway balance dropped **0.9999 → 0.9998 USDC**, response
  `{"success":true,"transaction":"0c53ea2c-…","network":"eip155:5042002"}`.
- Reproduce: `GET /api/dev/gateway-pay?id=14c966d503a1d1b2` (server-side buyer, returns the
  before/after Gateway balance + settlement). Seller (KUOT_COLLECTOR) must differ from the buyer.

**ERC-8004 agent identity + reputation** — `AgentRegistry8004` `0x53aaF8397E518f2529e1682b9A03D73537B23f9d`
- Deploy tx `0x65d547b063b21026e6127092615e08679458be26cbd841eb9ab562c70f5cf916`
- 5 mesh agents registered on-chain by the operator (researcher/planner/reader/factchecker/summarizer) — `agentCount() = 5`
- Reputation is *earned*: `bumpReputation` tx `0xe635fd27cb786125ec19c40d80d59363d56036eddd390f8ff00069ec85b2d75c` → `getAgent(researcher).reputation = 1`
- Wired into the live app: `/api/agents/feedback` bumps contributors after each settled run (`src/lib/reputation.ts`)

**Directional reputation bond** — `ReputationBond`
- `postBond(provider, ctx, 1.0 USDC)` → `trustVector(operator→provider@ctx)` = **1.000000**
- capital at risk, keyed by (from→to→context) — slashable via `slash(id, beneficiary)`

## Deepening the Circle stack — solutions to the testnet/API walls
- **CCTP cross-chain — SOLVED, live.** Instead of Gateway `withdraw` (which needs the Gateway API +
  destination gas), call **CCTP V2 `depositForBurn` directly on Arc** (pure on-chain, no Gateway API).
  Real burn tx: **`0xceb08d128510915eed26c6b4f300dbaf8abf85d2b87ebd102ec3fb16c2f05715`** — 0.05 USDC
  burned on Arc, cross-chain message emitted (TokenMessengerV2 `0x8FE6B999…`, dest domain 6 = Base).
- **EURC multi-currency — SOLVED, live.** StableFX USDC↔EURC has no route on Arc testnet, so pay EU
  authors by **transferring EURC directly** (EURC `0x89B5…D72a` is native on Arc) — no swap. Proven:
  operator paid **0.05 EURC** to an author, tx
  **`0x393469b110b0a0ae47d9cb2f9ce2d50c7cfcd8ff6468001547fbd28d45101062`** (author EURC balance now
  0.05). `payAuthorEurc()` (`src/lib/eurc.ts`).
- **Agent Wallet as payer — SOLVED, live.** The Circle Agent Wallet can't be a Gateway
  `BatchEvmSigner` (it signs via Circle's API, not a raw key), but it pays authors directly via
  Circle `createTransaction`. Proven: Agent Wallet **`0x69906004…7cea`** (walletId
  `c2092a3d-e7b4-59f7-8473-5daa6f699332`) paid 0.05 USDC, **transactionId
  `ab38c82f-f8ae-5873-921a-7360c7583cb1`** (state INITIATED). Reproduce:
  `GET /api/dev/agent-pay?token=…` (server-side, Circle API). The Circle-managed Agent Wallet is
  the real payer for author payouts.

## Reproduce
```
cd contracts
set -a && source ../.env && set +a
forge script script/Deploy.s.sol     --rpc-url "$ARC_RPC_URL" --broadcast
forge script script/DeployKuot.s.sol --rpc-url "$ARC_RPC_URL" --broadcast
```
