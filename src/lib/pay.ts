/**
 * Unified paper-unlock payment — Kuot
 *
 * The agent's "buy the paper" step. Prefers the Circle Gateway nanopayment rail
 * on Arc (gas-free, batched, sub-cent) when configured; falls back to the legacy
 * direct-transfer micropayment so the full research→payout flow stays testable
 * offline. This is the RFB-01 (Autonomous Paying Agents) payment primitive.
 */
import { getAddress, type Address } from "viem";
import { payResource } from "./gateway";
import { payForResource } from "./x402pay";

export type PaperPayment = {
  paid: boolean;
  rail: "gateway" | "legacy" | "none";
  txHash?: string;
  amountUSDC?: string;
  reason?: string;
};

/** Gateway rail is usable when we have an agent key, an Arc RPC, and a paper endpoint. */
function gatewayEnabled(): boolean {
  return Boolean(
    process.env.AGENT_PRIVATE_KEY &&
      (process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC) &&
      process.env.KUOT_PAPER_URL,
  );
}

/**
 * Pay to unlock paper `id`'s full text.
 * @param id      paper id (OpenAlex/Semantic Scholar)
 * @param payTo   recipient for the legacy direct-transfer fallback
 * @param price6  price in USDC atomic units (6 decimals)
 */
export async function payForPaper(id: string, payTo: Address, price6: bigint): Promise<PaperPayment> {
  // A non-positive bid means the source budget is exhausted — never submit a
  // 0-value transfer (wasted gas) and never report it as "paid".
  if (price6 <= 0n) return { paid: false, rail: "none", reason: "source budget exhausted (bid ≤ 0)" };
  // Preferred: Gateway nanopayment against the x402-protected paper endpoint.
  if (gatewayEnabled()) {
    try {
      const base = process.env.KUOT_PAPER_URL!.replace(/\/$/, "");
      const url = `${base}/${encodeURIComponent(id)}`;
      const r = await payResource(url, { maxPerPaymentUSDC: Number(price6) / 1e6 + 0.001 });
      return { paid: true, rail: "gateway", txHash: r.transaction, amountUSDC: r.amount };
    } catch {
      // fall through to the legacy rail
    }
  }

  // Legacy fallback: direct USDC transfer, verifiable on-chain.
  try {
    const txHash = await payForResource(getAddress(payTo), price6);
    return { paid: true, rail: "legacy", txHash, amountUSDC: (Number(price6) / 1e6).toString() };
  } catch (e) {
    return { paid: false, rail: "none", reason: e instanceof Error ? e.message : String(e) };
  }
}
