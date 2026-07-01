# Kuot — local setup & live testnet demo

Everything except the LLM and the prize-mandated mainnet relay runs **free on testnet**.

## 1. Run the app

```bash
npm install
cp .env.example .env     # already scaffolded for the demo
npm run dev              # http://localhost:3000  →  /research
```

The research flow works immediately (free) using OpenAlex + a Venice **dev fallback**
when no Venice credit is present (clearly labeled in the UI).

## 2. A wallet — any wallet (MetaMask, Rabby, Coinbase…)

- Connect any EIP-6963 injected wallet. **No MetaMask Flask needed** — the old ERC-7715
  "scoped budget" grant has been removed. Research runs with no signature (operator-funded),
  and the optional "Lock … USDC" budget is a plain USDC transfer that works on any wallet.
- Add the **Arc testnet** network (chainId 5042002) when prompted.

## 3. Fund accounts (testnet, free)

**Agent / deployer address (throwaway, in `.env`):**
`0x55f43e2DF8A86c1D8852A53D00A8D09bC6bA6369`
- Base Arc ETH (for contract deploy gas): https://www.alchemy.com/faucets/base-sepolia

**Your Flask wallet (the "user" who grants the budget):**
- Test USDC on Base Arc (Circle faucet): https://faucet.circle.com → select **Base Arc**
- A little Base Arc ETH too (same Alchemy faucet) for any non-relayed actions.

## 4. Deploy AttributionLedger (free on Base Arc)

```bash
cd contracts
# contracts/.env already has PRIVATE_KEY (throwaway) + USDC_ADDRESS (Base Arc USDC)
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast
```
Copy the printed address into `NEXT_PUBLIC_ATTRIBUTION_LEDGER` in `.env`.

## 5. Venice (for the live multimodal demo)

- Generate an **Inference** key at https://venice.ai/settings/api and add ~$5 USD (or use the free dev fallback).
- Set `VENICE_API_KEY` in `.env` (local) and in Vercel → Project → Environment Variables.

## 6. The Circle Gateway relay

- **Testnet (free):** the client auto-targets `relayer.1shotapi.dev` on Base Arc / Arc.
  Click **"Pay authors gasless (Circle Gateway)"** on `/research` — grant once in Flask, the relayer
  pays gas, you pay zero ETH.
- **Mainnet (prize requirement):** switch Flask to Base mainnet and hold ~$2 USDC; the client
  auto-targets `relayer.1shotapi.com`.

## Chains used

| Purpose | Chain |
|---|---|
| Research + optional any-wallet budget lock | Arc testnet (5042002) |
| x402 + Venice settlement | Base |
| Circle Gateway relay (test) | Base Arc (`relayer.1shotapi.dev`) |
| Circle Gateway relay (prize) | Base / Ethereum mainnet (`relayer.1shotapi.com`) |
