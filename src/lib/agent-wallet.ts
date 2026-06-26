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

const ARC_AGENT_WALLET = "0x69906004c174c84ba9082f0f85dfa08ca7eb7cea";
/** Hard cap so an in-loop autonomous payout can never drain the wallet. */
const MAX_AGENT_AUTOPAY = 0.1; // USDC

export type AgentWalletPayout = { payer: `0x${string}`; to: `0x${string}`; amountUSDC: string; transactionId?: string; state?: string };

/**
 * Autonomous in-loop payout: the research agent pays one cited author DIRECTLY
 * from its own Circle Agent Wallet (developer-controlled, MPC-signed) — a real
 * Agent-Wallet settlement inside the research→settle loop, not a dev-only proof.
 * Best-effort and self-capped: resolves the Arc wallet + USDC token, skips quietly
 * if the wallet holds no USDC or anything fails (never blocks the on-chain attest).
 */
export async function agentWalletPayout(to: `0x${string}`, amountUSDC: number): Promise<AgentWalletPayout | null> {
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) return null;
  const amount = Math.min(MAX_AGENT_AUTOPAY, amountUSDC);
  if (!(amount > 0) || !/^0x[0-9a-fA-F]{40}$/.test(to)) return null;
  try {
    const c = client();
    const wls = (await c.listWallets({ blockchain: ARC_BLOCKCHAIN }))?.data?.wallets ?? [];
    const w = wls.find((x) => x.address?.toLowerCase() === ARC_AGENT_WALLET) ?? wls[0];
    if (!w?.id || !w.address) return null;
    const bals = (await c.getWalletTokenBalance({ id: w.id }))?.data?.tokenBalances ?? [];
    const usdc = bals.find((b) => b.token?.symbol === "USDC");
    if (!usdc?.token?.id || Number(usdc.amount ?? 0) < amount) return null; // no funds → skip cleanly
    const amt = amount.toFixed(6);
    const tx = await c.createTransaction({
      walletId: w.id,
      tokenId: usdc.token.id,
      destinationAddress: to,
      amount: [amt],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    return { payer: w.address as `0x${string}`, to, amountUSDC: amt, transactionId: tx.data?.id, state: tx.data?.state };
  } catch {
    return null;
  }
}
