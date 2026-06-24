import { NextResponse } from "next/server";
import { swapOnArc, poolReserves, type FxToken } from "@/lib/onchain-fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dev/fx-swap?token=<DEV_PAY_TOKEN>&from=USDC&amount=0.1
 * Executes a REAL on-chain USDC<->EURC swap through Kuot's StableFXPool on Arc
 * (operator-signed, server-side). Proves the FX path is live, not a bypass.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = process.env.DEV_PAY_TOKEN;
  if (token && url.searchParams.get("token") !== token) {
    return NextResponse.json({ error: "forbidden — pass ?token=" }, { status: 403 });
  }
  const from = (url.searchParams.get("from") === "EURC" ? "EURC" : "USDC") as FxToken;
  const amount = Number(url.searchParams.get("amount") ?? "0.1");
  const amountIn = BigInt(Math.max(0, Math.round(amount * 1e6)));

  try {
    const before = await poolReserves();
    const res = await swapOnArc({ tokenIn: from, amountIn });
    const after = await poolReserves();
    return NextResponse.json({
      ok: true,
      from,
      to: from === "USDC" ? "EURC" : "USDC",
      amountIn: amountIn.toString(),
      amountOut: res.amountOut,
      amountOutHuman: (Number(res.amountOut) / 1e6).toFixed(6),
      approveTx: res.approveTx,
      swapTx: res.txHash,
      explorer: `https://testnet.arcscan.app/tx/${res.txHash}`,
      reservesBefore: { usdc: before.usdc.toString(), eurc: before.eurc.toString() },
      reservesAfter: { usdc: after.usdc.toString(), eurc: after.eurc.toString() },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
