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

**Directional reputation bond** — `ReputationBond`
- `postBond(provider, ctx, 1.0 USDC)` → `trustVector(operator→provider@ctx)` = **1.000000**
- capital at risk, keyed by (from→to→context) — slashable via `slash(id, beneficiary)`

## Reproduce
```
cd contracts
set -a && source ../.env && set +a
forge script script/Deploy.s.sol     --rpc-url "$ARC_RPC_URL" --broadcast
forge script script/DeployKuot.s.sol --rpc-url "$ARC_RPC_URL" --broadcast
```
