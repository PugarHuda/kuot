import { NextResponse } from "next/server";
import { verifyPayment } from "@/lib/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402";

export const runtime = "nodejs";

/**
 * POST /api/facilitator/verify
 * { paymentPayload, paymentRequirements } → { isValid, invalidReason?, payer? }
 * The x402 facilitator verify step (no settlement). Pure on-chain-shape validation.
 */
export async function POST(req: Request) {
  let body: { paymentPayload?: PaymentPayload; paymentRequirements?: PaymentRequirements };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ isValid: false, invalidReason: "invalid_json" }, { status: 400 });
  }
  if (!body.paymentPayload || !body.paymentRequirements) {
    return NextResponse.json(
      { isValid: false, invalidReason: "paymentPayload and paymentRequirements required" },
      { status: 400 },
    );
  }
  return NextResponse.json(verifyPayment(body.paymentPayload, body.paymentRequirements));
}
