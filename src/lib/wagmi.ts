/**
 * wagmi config — Kuot
 *
 * Sepolia is where ERC-7715 Advanced Permissions are granted/redeemed (MetaMask
 * Flask; supporting Snaps are Sepolia-only). Base is where x402 + Venice settle.
 */
import { createConfig, http, type Connector } from "wagmi";
import { sepolia, base, baseSepolia } from "wagmi/chains";
import { arcTestnet } from "./chains";

// ERC-7715 needs MetaMask **Flask**. With both regular MetaMask and Flask
// installed, the shared `window.ethereum` is ambiguous — an `injected()` connector
// pointing at it can pop up the WRONG wallet (or both). So we rely *only* on
// EIP-6963 multi-provider discovery, which gives each wallet its own isolated
// connector (rdns), and the UI connects the Flask one specifically. No generic
// injected connector → no window.ethereum ambiguity.
export const wagmiConfig = createConfig({
  chains: [arcTestnet, sepolia, base, baseSepolia],
  multiInjectedProviderDiscovery: true,
  transports: {
    [arcTestnet.id]: http(process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0]),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

/**
 * Pick a wallet connector. Kuot works with ANY EIP-6963 injected wallet (MetaMask,
 * Rabby, Coinbase Wallet, Brave, etc.) — the only thing the user signs is a one-off
 * binding when claiming author payouts, so no wallet-specific feature is required.
 * We prefer a real injected provider but fall back to whatever the browser exposes.
 */
export function pickFlaskConnector(connectors: readonly Connector[]): Connector | undefined {
  const isInjected = (c: Connector) => {
    const rdns = (c as { rdns?: string | readonly string[] }).rdns;
    return c.type === "injected" || Boolean(rdns) || /metamask|rabby|coinbase|brave|wallet|injected/i.test(c.name);
  };
  // Any discovered injected wallet works; default to the first one announced.
  return connectors.find(isInjected) ?? connectors[0];
}
