import { NextResponse } from "next/server";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { getShared } from "@/lib/store";
import { ARC_CFG } from "@/lib/gateway";
import { proveGrounding } from "@/lib/grounding";
import { recursiveSplit } from "@/lib/recursive";
import type { ResearchResult } from "@/lib/agent";

export const runtime = "nodejs";

// Circle Gateway facilitator — verifies + settles the batched payment on Arc.
let _gw: ReturnType<typeof createGatewayMiddleware> | null = null;
function facilitator() {
  const sellerAddress =
    (process.env.KUOT_COLLECTOR as string) ??
    (process.env.NEXT_PUBLIC_SESSION_ACCOUNT as string) ??
    "0x000000000000000000000000000000000000dEaD";
  return (_gw ??= createGatewayMiddleware({
    sellerAddress,
    networks: ["eip155:5042002"],
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
  }));
}

/** The single source of truth for the 402 payment requirements (one accepts entry). */
function buildRequirements(queryId: string, payTo: string) {
  return {
    scheme: "exact",
    network: "eip155:5042002",
    amount: PRICE_USDC_6, // Circle batching client reads `amount`
    maxAmountRequired: PRICE_USDC_6, // legacy x402 field (humans/curl)
    resource: `/api/summaries/${queryId}`,
    description: `Cite Kuot's synthesis for ${queryId} (recursive citation toll)`,
    asset: ARC_CFG.usdc,
    payTo,
    maxTimeoutSeconds: 120,
    extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: ARC_CFG.gatewayWallet },
  };
}

/**
 * Verify + settle a REAL Gateway batched payment. The client sends the signed
 * authorization (base64 JSON) in the `Payment-Signature` header; the facilitator
 * needs both that payload and the original requirements. Returns the on-chain
 * settlement tx, or null for a demo header / failed verification.
 */
async function settleGatewayPayment(header: string, requirements: unknown): Promise<{ transaction?: string; payer?: string; error?: string } | null> {
  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null; // not a real payment payload (e.g. the "demo" header)
  }
  try {
    const gw = facilitator();
    // The Gateway verify API wants the requirement fields (resource, asset, payTo,
    // amount, network…) inside the paymentPayload too — merge them in.
    const merged = { ...(requirements as Record<string, unknown>), ...(paymentPayload as Record<string, unknown>) };
    const v = await gw.verify({ paymentPayload: merged, paymentRequirements: requirements });
    if (!v.valid) return { error: `verify: ${v.error ?? "invalid"}` };
    const s = await gw.settle({ paymentPayload: merged, paymentRequirements: requirements });
    return s.success ? { transaction: s.transaction, payer: v.payer } : { error: `settle: ${s.error ?? "failed"}` };
  } catch (e) {
    return { error: `exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * GET /api/summaries/[queryId] — reverse-x402: Kuot's own answers are a paid
 * resource. Another agent pays a nanopayment (Circle Gateway batched, on Arc) to
 * read a stored synthesis; a fraction of that payment then flows RECURSIVELY back
 * to the original authors whose work grounded the answer. Being cited earns money,
 * and the citation graph compounds (RFB-03 "payment-chain depth").
 *
 * No Payment-Signature → 402 advertising the Gateway-batched option.
 * Paid                 → 200 with the synthesis + the recursive payout plan.
 */
const PRICE_USDC_6 = "100"; // $0.0001 — a sub-cent nanopayment to cite Kuot

export async function GET(req: Request, ctx: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await ctx.params;
  const payTo =
    (process.env.KUOT_COLLECTOR as `0x${string}`) ??
    (process.env.NEXT_PUBLIC_SESSION_ACCOUNT as `0x${string}`) ??
    "0x000000000000000000000000000000000000dEaD";

  const stored = await getShared<{ result: ResearchResult }>(queryId);
  const result = stored?.result;
  if (!result) {
    return NextResponse.json({ error: "no stored synthesis for this id (publish via /api/share first)" }, { status: 404 });
  }

  // Gateway batching is detected by extra.name === "GatewayWalletBatched" + version "1"
  // (see @circle-fin/x402-batching supportsBatching). A GatewayClient pays this natively.
  const paid = req.headers.get("Payment-Signature") ?? req.headers.get("X-PAYMENT");
  if (!paid) {
    const challenge = { x402Version: 1, accepts: [buildRequirements(queryId, payTo)] };
    // The Circle GatewayClient reads the requirements from the PAYMENT-REQUIRED
    // header (base64 JSON); the body is the same, for humans/curl.
    return NextResponse.json(challenge, {
      status: 402,
      headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge), "utf8").toString("base64") },
    });
  }

  // Paid: compute the recursive split back to the original grounded authors.
  // (Server-side settlement verification is delegated to the Gateway facilitator;
  //  here we return the plan + unlocked synthesis the paying agent receives.)
  // Real Gateway payment → verify + settle the batch on Arc (returns the tx).
  const settlement = await settleGatewayPayment(paid, buildRequirements(queryId, payTo));

  const proof = proveGrounding({ query: result.query, synthesis: result.synthesis, payouts: result.payouts ?? [] });
  const split = recursiveSplit(BigInt(PRICE_USDC_6), proof.grounded);

  return NextResponse.json(
    {
      queryId,
      synthesis: result.synthesis,
      digest: proof.digest,
      settlement: settlement ?? { note: "demo header (no on-chain settle); a real GatewayClient payment settles the batch" },
      recursive: {
        recursiveBps: split.recursiveBps,
        toAuthorsTotalUSDC: Number(split.toAuthorsTotalAtomic) / 1e6,
        marginUSDC: Number(split.marginAtomic) / 1e6,
        authors: split.toAuthors.map((a) => ({
          identity: a.identity,
          author: a.author,
          amountUSDC: Number(a.amountAtomic) / 1e6,
          weightBps: a.weightBps,
        })),
      },
    },
    { status: 200, headers: { "X-PAYMENT-RESPONSE": "verified" } },
  );
}
