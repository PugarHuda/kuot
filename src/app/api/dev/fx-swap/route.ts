import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { swapOnArc, poolReserves, type FxToken } from "@/lib/onchain-fx";
import { payAuthorEurcViaSwap } from "@/lib/eurc";
import { devTokenOk } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FX = 5; // USDC/EURC per swap

/**
 * GET /api/dev/fx-swap?token=<DEV_PAY_TOKEN>&from=USDC&amount=0.1[&payTo=0x..]
 * Executes a REAL on-chain USDC<->EURC swap through Kuot's StableFXPool on Arc
 * (operator-signed, server-side). Proves the FX path is live, not a bypass.
 *
 * With &payTo=<author> (USDC→EURC only): swaps the dollar amount to EURC and
 * TRANSFERS the euros to that author — the full multi-currency author payout
 * (`eurc.ts#payAuthorEurcViaSwap`), so an EU author can be paid in real euros.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // FAIL CLOSED: operator-signed swap of operator funds.
  if (!devTokenOk(req)) {
    return NextResponse.json({ error: "forbidden — set DEV_PAY_TOKEN and pass ?token=" }, { status: 403 });
  }
  const from = (url.searchParams.get("from") === "EURC" ? "EURC" : "USDC") as FxToken;
  const amount = Number(url.searchParams.get("amount") ?? "0.1");
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_FX) {
    return NextResponse.json({ ok: false, error: `amount must be 0 < x ≤ ${MAX_FX}` }, { status: 400 });
  }
  const amountIn = BigInt(Math.round(amount * 1e6));

  // Multi-currency author payout: swap USDC→EURC, then pay the author in euros.
  const payTo = url.searchParams.get("payTo");
  if (payTo) {
    if (from !== "USDC") {
      return NextResponse.json({ ok: false, error: "payTo pays euros — use from=USDC" }, { status: 400 });
    }
    if (!isAddress(payTo)) {
      return NextResponse.json({ ok: false, error: "payTo must be a valid address" }, { status: 400 });
    }
    try {
      const r = await payAuthorEurcViaSwap(getAddress(payTo), amountIn);
      return NextResponse.json({
        ok: true,
        from: "USDC",
        to: "EURC",
        paidTo: getAddress(payTo),
        amountIn: amountIn.toString(),
        eurcPaid: r.eurcPaid,
        eurcPaidHuman: (Number(r.eurcPaid) / 1e6).toFixed(6),
        swapTx: r.swapTx,
        payTx: r.payTx,
        explorer: `https://testnet.arcscan.app/tx/${r.payTx}`,
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

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
