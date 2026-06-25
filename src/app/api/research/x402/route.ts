import { NextResponse } from "next/server";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { runResearch } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/research/x402 — Kuot as a PAID agent service (toll-booth).
 *
 * An external AI agent pays Kuot a Gateway-batched x402 nanopayment on Arc to run
 * a research query (RFB 1/2: selling an agent's work per-call, no subscription).
 * The agent then internally pays the cited authors — so one external payment fans
 * out into the citation economy.
 *
 *   No payment   → 402 (Gateway-batched challenge; price scales with paper count).
 *   Real payment → verify + settle on Arc, run the research, return the result.
 *
 * Price: $0.001 per paper consulted, floored at $0.002 per call.
 */
function priceFor(papers: number): { dollars: string; usdc6: number } {
  const usdc6 = Math.max(2_000, Math.round(Math.min(10, Math.max(1, papers)) * 1_000)); // $0.001/paper, min $0.002
  return { dollars: `$${(usdc6 / 1e6).toFixed(6)}`, usdc6 };
}

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

async function runGatewayPaywall(priceDollars: string, paymentHeader?: string): Promise<PaywallResult> {
  const mw = gateway().require(priceDollars);
  const req = {
    method: "POST",
    url: `/api/research/x402`,
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

export async function POST(req: Request) {
  let body: { query?: string; papers?: number; rootBudgetUSDC?: number; webSources?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const query = body.query?.trim();
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
  const papers = Math.min(10, Math.max(1, Math.floor(body.papers ?? 5)));
  const price = priceFor(papers);

  const paymentHeader = req.headers.get("Payment-Signature") ?? req.headers.get("X-PAYMENT") ?? undefined;

  // Demo click-through. Running the full (expensive) Venice pipeline for free is
  // only allowed when explicitly enabled (KUOT_ENABLE_DEMO=1) — otherwise this
  // PAID endpoint stays paid: we surface the toll instead of burning compute.
  // (The free public tier for output is /api/research.)
  if (paymentHeader === "demo") {
    if (process.env.KUOT_ENABLE_DEMO === "1") {
      const result = await runResearch(query, { papers, rootBudgetUSDC: body.rootBudgetUSDC, webSources: body.webSources });
      return NextResponse.json({ paid: "demo", price, result });
    }
    return NextResponse.json(
      { paid: false, price, note: "Pay the x402 toll to run. Free output is available at /api/research." },
      { status: 402 },
    );
  }

  const pw = await runGatewayPaywall(price.dollars, paymentHeader);
  if (!pw.paid) {
    // Unpaid → return the facilitator's 402 verbatim (the GatewayClient understands it),
    // plus a human-readable price header so non-SDK callers can see the toll.
    return new NextResponse(pw.body || JSON.stringify({ error: "payment required", price }), {
      status: pw.statusCode || 402,
      headers: { ...pw.headers, "X-Kuot-Price": price.dollars, "X-Kuot-Price-USDC6": String(price.usdc6) },
    });
  }

  // Paid + settled on Arc → run the research and return it.
  const settlementTx = pw.headers["X-PAYMENT-RESPONSE"] ?? pw.headers["PAYMENT-RESPONSE"] ?? null;
  try {
    const result = await runResearch(query, { papers, rootBudgetUSDC: body.rootBudgetUSDC, webSources: body.webSources });
    return NextResponse.json(
      { paid: true, price, settlement: { settled: true, response: settlementTx }, result },
      { status: 200, headers: { "X-PAYMENT-RESPONSE": String(settlementTx ?? "settled") } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
