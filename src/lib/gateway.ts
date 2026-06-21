/**
 * Circle Gateway Nanopayments rail — Kuot (Lepton · Arc)
 *
 * Replaces the legacy 1Shot relayer (oneshot.ts) on the BUYER side. The paying
 * agent funds a Gateway balance once, then every paid request is a gas-free,
 * off-chain EIP-3009 authorization that Circle batches into one net on-chain
 * settlement (`submitBatch`) — making sub-cent per-citation payments economical.
 *
 * Verified against @circle-fin/x402-batching@3.2.0 (CHAIN_CONFIGS.arcTestnet):
 *   chain id      5042002
 *   USDC (erc20)  0x3600000000000000000000000000000000000000
 *   GatewayWallet 0x0077777d7EBA4688BDeF3E311b846F25870A19B9
 *   GatewayMinter 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B
 *   default RPC   https://rpc.testnet.arc.network  (override with ARC_RPC_URL)
 *
 * SERVER-ONLY: constructs from AGENT_PRIVATE_KEY. Never import into client code.
 */
import {
  GatewayClient,
  CHAIN_CONFIGS,
  type SupportedChainName,
} from "@circle-fin/x402-batching/client";
import type { Hex } from "viem";

/** The Gateway-supported chain Kuot settles on. Arc testnet for the hackathon. */
export const KUOT_CHAIN: SupportedChainName = "arcTestnet";

/** Canonical Arc testnet config straight from the SDK (source of truth for addrs). */
export const ARC_CFG = CHAIN_CONFIGS[KUOT_CHAIN];

function rpcUrl(): string | undefined {
  return process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? undefined;
}

function agentKey(): Hex {
  const k = process.env.AGENT_PRIVATE_KEY ?? process.env.OPERATOR_PRIVATE_KEY;
  if (!k) throw new Error("AGENT_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY) not configured");
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

/**
 * Build a GatewayClient for the paying agent, with a per-payment spending cap
 * enforced as an `onBeforePaymentCreation` hook. The cap is the agent's
 * cryptographic budget guardrail — the agent can reason about value/ROI above
 * this floor, but can never sign an authorization larger than `maxPerPaymentUSDC`.
 *
 * @param maxPerPaymentUSDC  hard ceiling for a single payment, in human USDC
 *                           (default 0.50 — a citation should be a fraction of a cent)
 */
export function makePayingAgent(maxPerPaymentUSDC = 0.5): GatewayClient {
  const capAtomic = BigInt(Math.round(maxPerPaymentUSDC * 1e6)); // USDC = 6 decimals
  const client = new GatewayClient({
    chain: KUOT_CHAIN,
    privateKey: agentKey(),
    ...(rpcUrl() ? { rpcUrl: rpcUrl()! } : {}),
  });

  client.onBeforePaymentCreation(async (ctx) => {
    const amount = BigInt(ctx.selectedRequirements.amount);
    if (amount > capAtomic) {
      return {
        abort: true,
        reason: `payment ${amount} exceeds Kuot per-payment cap ${capAtomic} (=$${maxPerPaymentUSDC})`,
      };
    }
    return undefined;
  });

  return client;
}

/** One-time: fund the agent's Gateway balance so future payments are gas-free. */
export async function fundGateway(amountUSDC: string): Promise<{ depositTxHash: `0x${string}` }> {
  const agent = makePayingAgent();
  const res = await agent.deposit(amountUSDC);
  return { depositTxHash: res.depositTxHash };
}

/**
 * Pay for an x402-protected resource (a paper full-text, Venice inference, or
 * another agent's reverse-x402 endpoint). The full 402 flow — request →
 * discover batching option → sign authorization → retry — is handled by the SDK.
 *
 * Returns the resource payload plus the USDC amount actually paid (for the
 * per-task ROI / accounting layer and the traction dashboard).
 */
export async function payResource<T = unknown>(
  url: string,
  opts: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string>; maxPerPaymentUSDC?: number } = {},
): Promise<{ data: T; amountAtomic: bigint; amount: string; transaction: string }> {
  const agent = makePayingAgent(opts.maxPerPaymentUSDC ?? 0.5);
  const { method, body, headers } = opts;
  const res = await agent.pay<T>(url, { method, body, headers });
  return { data: res.data, amountAtomic: res.amount, amount: res.formattedAmount, transaction: res.transaction };
}

/** Current wallet + Gateway balances for the paying agent (dashboard / preflight). */
export async function agentBalances() {
  const agent = makePayingAgent();
  return agent.getBalances();
}

/**
 * Pay an author cross-chain in one call: Gateway `withdraw` to the author's
 * preferred chain (instant on same-chain, gas-on-destination otherwise). This
 * covers the cross-chain payout path without a separate CCTP integration for v1.
 */
export async function payoutToChain(
  amountUSDC: string,
  destChain: SupportedChainName,
  recipient: `0x${string}`,
): Promise<{ mintTxHash: `0x${string}`; destinationChain: string }> {
  const agent = makePayingAgent();
  const res = await agent.withdraw(amountUSDC, { chain: destChain, recipient });
  return { mintTxHash: res.mintTxHash, destinationChain: res.destinationChain };
}

/**
 * On-chain payment history for the traction dashboard / accounting layer.
 * Powers RFB-01 traction metrics: total autonomous payments, average tx size.
 */
export async function recentTransfers(limit = 50) {
  const agent = makePayingAgent();
  return agent.searchTransfers({ pageSize: limit });
}
