import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { payVeniceX402 } from "@/lib/venice-x402";
import { devTokenOk } from "@/lib/authz";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/venice-x402/pay  { messages?, confirm: true }
 * Runs the FULL x402-pay-Venice handshake: no-key call → 402 → sign an EIP-3009
 * USDC authorization with the agent key → retry with X-PAYMENT → return Venice's
 * answer. Guarded by `confirm` because settling really costs the quoted amount
 * (≈10 USDC on Base). With an unfunded agent, Venice rejects the payment — the
 * code path still runs end-to-end.
 */
export async function POST(req: Request) {
  // FAIL CLOSED: settling signs an EIP-3009 USDC authorization (~10 USDC on Base)
  // with the operator key. Anonymous callers must never be able to spend it.
  if (!devTokenOk(req)) {
    return NextResponse.json({ error: "forbidden — set DEV_PAY_TOKEN and pass x-dev-token / ?token=" }, { status: 403 });
  }
  let body: { messages?: { role: string; content: string }[]; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.confirm) {
    return NextResponse.json(
      { error: "set confirm:true — this spends ~10 USDC on Base via x402", hint: "GET /api/venice-x402/quote to see the quote" },
      { status: 400 },
    );
  }
  const key = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return NextResponse.json({ error: "OPERATOR_PRIVATE_KEY not configured" }, { status: 501 });

  const account = privateKeyToAccount(key);
  const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;
  const validBeforeSec = Math.floor(Date.now() / 1000) + 300;

  try {
    const result = await payVeniceX402({
      body: {
        model: process.env.VENICE_CHAT_MODEL ?? "venice-uncensored",
        messages: body.messages ?? [{ role: "user", content: "Say hello." }],
        max_tokens: 64,
      },
      account: account.address,
      signTypedData: (td) => account.signTypedData(td as Parameters<typeof account.signTypedData>[0]),
      nonce,
      validBeforeSec,
    });
    return NextResponse.json({
      paid: result.paid,
      status: result.status,
      payer: account.address,
      requirement: result.requirement
        ? { amountUSDC: (Number(result.requirement.amount) / 1e6).toFixed(2), asset: result.requirement.asset, network: result.requirement.network }
        : undefined,
      answer: result.paid ? result.data : undefined,
      reason: result.paid ? undefined : "payment_rejected_or_insufficient_usdc",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
