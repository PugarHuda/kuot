/**
 * Circle Agent Wallet (Developer-Controlled) — Kuot (Lepton · Arc)
 *
 * Replaces the legacy MetaMask ERC-7715 grant (permissions.ts) for giving the
 * research agent its own on-chain identity that autonomously holds and spends
 * USDC on Arc, with Circle managing keys (MPC / Entity Secret). The per-payment
 * spending cap is enforced at the Gateway rail (see gateway.ts:makePayingAgent);
 * additional wallet-level policies (allow/blocklists, time-bound caps) are set on
 * the Agent Wallet via the Circle Console / API.
 *
 * Verified against @circle-fin/developer-controlled-wallets@10.6.0:
 *   Blockchain.ArcTestnet === "ARC-TESTNET" (Arc is natively supported).
 *
 * SERVER-ONLY: requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET. Never import client-side.
 */
import {
  initiateDeveloperControlledWalletsClient,
  Blockchain,
} from "@circle-fin/developer-controlled-wallets";

/** Arc testnet in Circle's blockchain enum. */
export const ARC_BLOCKCHAIN = Blockchain.ArcTestnet;

function client() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET not configured (run the Circle CLI to provision)");
  }
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

export type AgentWallet = { walletSetId: string; walletId: string; address: `0x${string}` };

/**
 * Provision a fresh Agent Wallet on Arc: one wallet set + one wallet. Returns the
 * wallet id and address. Fund it from the Arc faucet, then it can pay autonomously.
 */
export async function createAgentWallet(name = "kuot-agent"): Promise<AgentWallet> {
  const c = client();
  const ws = await c.createWalletSet({ name });
  const walletSetId = ws.data?.walletSet?.id;
  if (!walletSetId) throw new Error("createWalletSet returned no id");

  const created = await c.createWallets({
    blockchains: [ARC_BLOCKCHAIN],
    count: 1,
    walletSetId,
  });
  const wallet = created.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) throw new Error("createWallets returned no wallet");
  return { walletSetId, walletId: wallet.id, address: wallet.address as `0x${string}` };
}

/** Token balances (USDC/EURC) held by an agent wallet — for the dashboard / preflight. */
export async function walletBalances(walletId: string) {
  const c = client();
  const r = await c.getWalletTokenBalance({ id: walletId });
  return r.data?.tokenBalances ?? [];
}

/** Request Arc testnet tokens for an agent wallet (faucet) so it can pay. */
export async function fundFromFaucet(address: `0x${string}`) {
  const c = client();
  return c.requestTestnetTokens({ address, blockchain: ARC_BLOCKCHAIN, usdc: true });
}

/**
 * Autonomous USDC transfer from an agent wallet (e.g. a direct author payout that
 * isn't routed through Gateway). `tokenId` is Circle's token id for USDC on Arc
 * (resolve once via getWalletTokenBalance / getToken and cache in env).
 */
export async function transferUSDC(args: {
  walletId: string;
  tokenId: string;
  to: `0x${string}`;
  amount: string; // human USDC, e.g. "0.25"
}) {
  const c = client();
  const r = await c.createTransaction({
    walletId: args.walletId,
    tokenId: args.tokenId,
    destinationAddress: args.to,
    amount: [args.amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return r.data;
}
