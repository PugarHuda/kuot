import { NextResponse } from "next/server";
import { parseVenice402 } from "@/lib/venice-x402";

export const runtime = "nodejs";

/**
 * GET /api/venice-x402/quote
 * Calls Venice with NO API key → Venice replies HTTP 402 with its x402 payment
 * requirements. We parse and return the EVM (Base/USDC) requirement. This proves,
 * for free, that Venice is x402-gated and that we can pay it the spec way.
 * (Settling the payment costs the quoted amount — see src/lib/venice-x402.ts.)
 */
export async function GET() {
  const base = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" }, // intentionally NO Authorization
      body: JSON.stringify({ model: "venice-uncensored", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
    });
    if (res.status !== 402) {
      return NextResponse.json({ x402: false, status: res.status, note: "Venice did not return 402 (key present?)" });
    }
    const body = await res.json();
    const req = parseVenice402(body);
    return NextResponse.json({
      x402: true,
      requirement: req
        ? { network: req.network, asset: req.asset, amountUSDC: (Number(req.amount) / 1e6).toFixed(2), payTo: req.payTo, scheme: req.scheme }
        : null,
      note: "Agent can pay Venice via x402 (EIP-3009 exact, USDC on Base). Settle costs the quoted amount.",
    });
  } catch (e) {
    return NextResponse.json({ x402: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
