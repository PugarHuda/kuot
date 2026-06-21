/**
 * Chain configuration — Kuot (Lepton · Canteen × Circle × Arc)
 *
 * Primary chain is now ARC TESTNET (Circle's stablecoin-native L1): native USDC
 * gas, sub-second finality, gasless Gateway batching. The legacy Sepolia/Base
 * config is retained so the old MetaMask/1Shot path keeps compiling during the
 * port — Arc is the rail we build on for Lepton.
 *
 *  - Arc testnet (5042002) → x402 + Gateway nanopayments settle in USDC; gas in USDC.
 *  - Ethereum Sepolia      → legacy ERC-7715 Advanced Permissions stage (being replaced
 *                            by Circle Agent Wallets).
 *  - Base                  → legacy x402/Venice settle.
 *
 * NOTE: Arc addresses below are the documented Canteen-testnet defaults — VERIFY against
 * `arc-canteen context sync` output before relying on them, and override via env.
 */
import { defineChain } from "viem";
import { mainnet, sepolia, base, baseSepolia } from "viem/chains";

/** Canteen-hosted Arc testnet. RPC is personal (from `arc-canteen rpc-url`) → env-driven. */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc-node.thecanteenapp.com"],
    },
  },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const CHAINS = { arcTestnet, mainnet, sepolia, base, baseSepolia } as const;

/**
 * Kuot runs entirely on Arc. PERMISSION_CHAIN is kept as the name many on-chain
 * readers import, but now points at Arc testnet (the legacy ERC-7715/Sepolia path
 * is replaced by Circle Agent Wallets). `sepolia` stays imported for type compat.
 */
export const PERMISSION_CHAIN = arcTestnet;
void sepolia;

/** Chain where x402 + Gateway nanopayments settle. Kuot = Arc. */
export const PAYMENT_CHAIN = arcTestnet;

/**
 * Cheap L2 mainnet for the ONE real 1Shot relay the "Best 1Shot Relayer" track
 * requires (relay 7710 + EIP-7702 on a *mainnet* relayer). Base gas is cents, so
 * the qualifying relay costs ~$0.01–0.10 in USDC. Verified live: 1Shot `.com`
 * serves Base (8453), Optimism (10), and Arbitrum (42161). See scripts/relay-mainnet-1shot.mjs.
 */
export const ONESHOT_MAINNET_CHAIN = base;

/**
 * USDC ERC-20 interface addresses per chain (6 decimals).
 * On Arc, USDC is ALSO the native gas token (18 decimals) — but the ERC-20
 * interface used for payments/transfers is the 6-decimal contract below.
 */
export const USDC: Record<number, `0x${string}`> = {
  // Arc testnet — ERC-20 USDC interface (6 decimals). VERIFY via arc-canteen context sync.
  5042002: (process.env.NEXT_PUBLIC_ARC_USDC as `0x${string}`) ?? "0x3600000000000000000000000000000000000000",
  // Base mainnet
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  // Base Sepolia (x402 hosted facilitator testnet)
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  // Ethereum Sepolia (test USDC for 7715 budget demos)
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  // Ethereum mainnet
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

/**
 * EURC token addresses per chain (6 decimals). Used for multi-currency author
 * payouts via StableFX / App Kit Swap (USDC↔EURC).
 */
export const EURC: Record<number, `0x${string}`> = {
  // Arc testnet. VERIFY via arc-canteen context sync.
  5042002: (process.env.NEXT_PUBLIC_ARC_EURC as `0x${string}`) ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};

export const USDC_DECIMALS = 6;
export const EURC_DECIMALS = 6;

/** Convert a human USDC amount (e.g. 2.5) to base units (bigint). */
export function usdc(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/** Convert a human EURC amount to base units (bigint). */
export function eurc(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** EURC_DECIMALS));
}
