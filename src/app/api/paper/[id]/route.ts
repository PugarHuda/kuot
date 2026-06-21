import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { require402 } from "@/lib/x402";
import { USDC, PERMISSION_CHAIN } from "@/lib/chains";
import { verifyPayment } from "@/lib/x402pay";

export const runtime = "nodejs";

/**
 * GET /api/paper/[id]  — an x402-gated resource (premium paper full-text).
 *
 * No X-PAYMENT header  → 402 with payment requirements (USDC on Base via ERC-7710).
 * Valid X-PAYMENT      → 200 with the full text + X-PAYMENT-RESPONSE receipt.
 *
 * This is the agent's "buy the paper" step in the main research flow. The
 * payment is settled by redeeming a 7710 delegation (see settlement.ts), which
 * our facilitator relays via 1Shot.
 */
const PRICE_USDC_6 = 1_000n; // $0.001 — sub-cent nanopayment

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const payTo = (process.env.NEXT_PUBLIC_SESSION_ACCOUNT as `0x${string}`) ??
    "0x000000000000000000000000000000000000dEaD";
  const delegationManager =
    (process.env.NEXT_PUBLIC_DELEGATION_MANAGER as `0x${string}`) ??
    "0x0000000000000000000000000000000000000000";

  // X-PAYMENT carries the tx hash of a USDC transfer to payTo (the "exact" scheme).
  const txHash = req.headers.get("X-PAYMENT") as `0x${string}` | null;

  if (!txHash) {
    return NextResponse.json(
      require402({
        amountUSDC6: PRICE_USDC_6,
        asset: USDC[PERMISSION_CHAIN.id],
        payTo,
        resource: `/api/paper/${id}`,
        description: `Full text access for paper ${id}`,
        network: PERMISSION_CHAIN.name.toLowerCase(),
        delegationManager,
      }),
      { status: 402 },
    );
  }

  // REAL on-chain verification: the tx must be a confirmed USDC Transfer to
  // payTo of >= price. No header-shape stub (H1).
  const ok = await verifyPayment(txHash, getAddress(payTo), PRICE_USDC_6);
  if (!ok) {
    return NextResponse.json({ error: "payment not verified on-chain" }, { status: 402 });
  }

  return NextResponse.json(
    {
      id,
      fullText: `Full text of paper ${id}. (Unlocked via x402 — on-chain USDC payment verified.)`,
      paid: `${Number(PRICE_USDC_6) / 1e6} USDC`,
      txHash,
    },
    { status: 200, headers: { "X-PAYMENT-RESPONSE": "verified" } },
  );
}
