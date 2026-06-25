import { NextResponse } from "next/server";
import { onchainFxEnabled, quoteOnArc, poolReserves, type FxToken } from "@/lib/onchain-fx";
import { FX_POOL, arcTestnet } from "@/lib/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fx?amount=1&from=USDC → live USDC<->EURC quote + pool reserves.
 * Reads Kuot's on-chain StableFXPool on Arc (Circle StableFX has no Arc route).
 */
export async function GET(req: Request) {
  if (!onchainFxEnabled()) return NextResponse.json({ enabled: false });
  const url = new URL(req.url);
  const from = (url.searchParams.get("from") === "EURC" ? "EURC" : "USDC") as FxToken;
  const to = from === "USDC" ? "EURC" : "USDC";
  const amount = Number(url.searchParams.get("amount") ?? "1");
  const amountIn = BigInt(Math.max(0, Math.round(amount * 1e6)));
  if (amountIn <= 0n) return NextResponse.json({ enabled: true, error: "amount must be > 0" }, { status: 400 });
  try {
    const [quoted, reserves] = await Promise.all([quoteOnArc(from, amountIn), poolReserves()]);
    return NextResponse.json({
      enabled: true,
      pool: FX_POOL[arcTestnet.id],
      from,
      to,
      amountIn: amountIn.toString(),
      amountOut: quoted.toString(),
      amountOutHuman: (Number(quoted) / 1e6).toFixed(6),
      effectiveRate: amountIn > 0n ? (Number(quoted) / Number(amountIn)).toFixed(6) : "0",
      reserves: { usdc: (Number(reserves.usdc) / 1e6).toFixed(6), eurc: (Number(reserves.eurc) / 1e6).toFixed(6) },
    });
  } catch (e) {
    return NextResponse.json({ enabled: true, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
