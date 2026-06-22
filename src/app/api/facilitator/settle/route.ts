import { NextResponse } from "next/server";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { verifyPayment, networkToChainId } from "@/lib/facilitator";
import { send7710Transaction, toRelayerJson, type Execution7710 } from "@/lib/oneshot";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/facilitator/settle
 * { paymentPayload, paymentRequirements } → { success, taskId?, network, payer? }
 *
 * The x402 facilitator settle step, built on Circle Gateway:
 * verify the ERC-7710 payment, then redeem the delegation gas-free via Gateway
 * (gas paid in stablecoin). Returns the relayer TaskId for status tracking.
 */
export async function POST(req: Request) {
  let body: { paymentPayload?: PaymentPayload; paymentRequirements?: PaymentRequirements };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, errorReason: "invalid_json" }, { status: 400 });
  }
  const { paymentPayload: payload, paymentRequirements: reqs } = body;
  if (!payload || !reqs) {
    return NextResponse.json({ success: false, errorReason: "missing_fields" }, { status: 400 });
  }

  const verdict = verifyPayment(payload, reqs);
  if (!verdict.isValid) {
    return NextResponse.json({ success: false, errorReason: verdict.invalidReason, network: payload.network }, { status: 402 });
  }

  const chainId = networkToChainId(payload.network);
  if (!chainId) {
    return NextResponse.json({ success: false, errorReason: "unsupported_network", network: payload.network }, { status: 400 });
  }

  try {
    // Decode the x402 permissionContext (encoded delegation chain) into the shape
    // the Circle Gateway expects, then relay the redemption of the execution.
    const delegations = decodeDelegations(payload.payload.permissionContext).map((d) => toRelayerJson(d));
    const execution: Execution7710 = {
      target: payload.payload.execution.to,
      value: payload.payload.execution.value ?? "0",
      data: payload.payload.execution.data,
    };
    const result = await send7710Transaction({
      chainId: String(chainId),
      transactions: [{ permissionContext: delegations as never, executions: [execution] }],
      destinationUrl: process.env.NEXT_PUBLIC_ONESHOT_WEBHOOK_URL || undefined,
      memo: "kuot-facilitator-settle",
    });
    return NextResponse.json({
      success: true,
      taskId: result.TaskId,
      network: payload.network,
      payer: verdict.payer,
      relayer: "1shot-permissionless",
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, errorReason: e instanceof Error ? e.message : String(e), network: payload.network },
      { status: 502 },
    );
  }
}
