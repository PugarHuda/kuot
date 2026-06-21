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
 * Pick the MetaMask **Flask** connector specifically (EIP-6963 announces it as
 * rdns `io.metamask.flask` / name "MetaMask Flask"). ERC-7715 Advanced
 * Permissions only run on Flask, and selecting the exact provider avoids the
 * ambiguous `window.ethereum` (which, with both regular MetaMask + Flask
 * installed, would otherwise connect the wrong wallet — or both).
 */
export function pickFlaskConnector(connectors: readonly Connector[]): Connector | undefined {
  const isFlask = (c: Connector) => {
    const rdns = (c as { rdns?: string | readonly string[] }).rdns;
    const rdnsMatch = Array.isArray(rdns) ? rdns.includes("io.metamask.flask") : rdns === "io.metamask.flask";
    return rdnsMatch || c.id === "io.metamask.flask" || /flask/i.test(c.name);
  };
  // Prefer the EIP-6963-tagged Flask provider (rdns), else any /flask/ named connector.
  return connectors.find((c) => {
    const rdns = (c as { rdns?: string | readonly string[] }).rdns;
    return Array.isArray(rdns) ? rdns.includes("io.metamask.flask") : rdns === "io.metamask.flask";
  }) ?? connectors.find(isFlask);
}
