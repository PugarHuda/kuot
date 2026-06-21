import { NextResponse } from "next/server";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { getShared } from "@/lib/store";
import { proveGrounding } from "@/lib/grounding";
import { recursiveSplit } from "@/lib/recursive";
import type { ResearchResult } from "@/lib/agent";

export const runtime = "nodejs";

const PRICE_DOLLARS = "$0.0001"; // a sub-cent nanopayment to cite Kuot
const PRICE_USDC_6 = "100"; // same, in atomic USDC (6 decimals)

// Circle Gateway facilitator middleware — builds the 402, verifies + settles the
// batched payment on Arc (settlement runs server-side on Vercel's clean network).
let _gw: ReturnType<typeof createGatewayMiddleware> | null = null;
function gateway() {
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

type PaywallResult = { paid: boolean; statusCode: number; headers: Record<string, string>; body: string };

/**
 * Run the Gateway `require()` middleware against a Node-style req/res shim. The
 * middleware constructs the correct payment requirements from `req.url`, and on a
 * valid payment verifies + settles the batch, then calls next(). We capture that.
 */
async function runGatewayPaywall(queryId: string, paymentHeader?: string): Promise<PaywallResult> {
  const mw = gateway().require(PRICE_DOLLARS);
  const req = {
    method: "GET",
    url: `/api/summaries/${encodeURIComponent(queryId)}`,
    headers: paymentHeader ? { "payment-signature": paymentHeader } : {},
  } as unknown as Parameters<typeof mw>[0];

  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(c: number) {
      statusCode = c;
    },
    setHeader: (k: string, v: string) => {
      headers[k.toUpperCase()] = v;
    },
    end: (b?: string) => {
      if (b != null) body = String(b);
    },
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    json: (o: unknown) => {
      headers["CONTENT-TYPE"] = "application/json";
      body = JSON.stringify(o);
    },
  } as unknown as Parameters<typeof mw>[1];

  let nexted = false;
  await mw(req, res, () => {
    nexted = true;
  });
  return { paid: nexted, statusCode, headers, body };
}

function recursivePlan(result: ResearchResult) {
  const proof = proveGrounding({ query: result.query, synthesis: result.synthesis, payouts: result.payouts ?? [] });
  const split = recursiveSplit(BigInt(PRICE_USDC_6), proof.grounded);
  return {
    digest: proof.digest,
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
  };
}

/**
 * GET /api/summaries/[queryId] — reverse-x402: Kuot's own answers are a paid
 * resource. Another agent pays a Gateway-batched nanopayment on Arc to cite a
 * stored synthesis; a fraction flows RECURSIVELY back to the original authors.
 *
 * No payment       → 402 (Gateway-batched challenge, built by the facilitator).
 * Real payment     → verify + settle the batch on Arc, then 200 + recursive plan.
 * `demo` header    → click-through preview (no on-chain settle).
 */
export async function GET(req: Request, ctx: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await ctx.params;

  const stored = await getShared<{ result: ResearchResult }>(queryId);
  const result = stored?.result;
  if (!result) {
    return NextResponse.json({ error: "no stored synthesis for this id (publish via /api/share first)" }, { status: 404 });
  }

  const paymentHeader = req.headers.get("Payment-Signature") ?? req.headers.get("X-PAYMENT") ?? undefined;

  // Demo click-through: preview the unlocked content + recursive plan without paying.
  if (paymentHeader === "demo") {
    const plan = recursivePlan(result);
    return NextResponse.json(
      { queryId, synthesis: result.synthesis, ...plan, settlement: { note: "demo preview — a real GatewayClient payment settles the batch on Arc" } },
      { status: 200 },
    );
  }

  // Real flow: the facilitator builds the 402 (unpaid) or verifies + settles (paid).
  const pw = await runGatewayPaywall(queryId, paymentHeader);
  if (!pw.paid) {
    // Unpaid (or invalid payment) → return the facilitator's response verbatim
    // (correct PAYMENT-REQUIRED format the GatewayClient understands).
    return new NextResponse(pw.body || JSON.stringify({ error: "payment required" }), {
      status: pw.statusCode || 402,
      headers: pw.headers,
    });
  }

  // Paid + settled on Arc. Surface the settlement + the recursive split to authors.
  const plan = recursivePlan(result);
  const settlementTx = pw.headers["X-PAYMENT-RESPONSE"] ?? pw.headers["PAYMENT-RESPONSE"] ?? null;
  return NextResponse.json(
    { queryId, synthesis: result.synthesis, ...plan, settlement: { settled: true, response: settlementTx } },
    { status: 200, headers: { "X-PAYMENT-RESPONSE": String(settlementTx ?? "settled") } },
  );
}
