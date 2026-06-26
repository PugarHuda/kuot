import { NextResponse } from "next/server";
import { initiateDeveloperControlledWalletsClient, Blockchain } from "@circle-fin/developer-controlled-wallets";
import { devTokenOk } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard ceiling so even an authorized call can't drain the Agent Wallet in one shot.
const MAX_AGENT_PAY = 0.25; // USDC

/**
 * GET /api/dev/agent-pay?token=<DEV_PAY_TOKEN>&to=<addr>&amount=0.05
 * Pays an author DIRECTLY from the Circle Agent Wallet (developer-controlled) via
 * Circle's createTransaction — proving the Agent Wallet is a real payer, server-side
 * (Vercel's clean network), independent of the operator EOA.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // FAIL CLOSED: this moves USDC out of the Agent Wallet to an arbitrary recipient.
  if (!devTokenOk(req)) {
    return NextResponse.json({ error: "forbidden — set DEV_PAY_TOKEN and pass ?token=" }, { status: 403 });
  }
  const to = (url.searchParams.get("to") ?? "0x31481ADc889B5e00b70846F59967DAF09CBe4a3e") as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return NextResponse.json({ error: "invalid 'to' address" }, { status: 400 });
  }
  const amount = url.searchParams.get("amount") ?? "0.05";
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > MAX_AGENT_PAY) {
    return NextResponse.json({ error: `amount must be 0 < x ≤ ${MAX_AGENT_PAY} USDC` }, { status: 400 });
  }

  try {
    const c = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });
    const wls = (await c.listWallets({ blockchain: Blockchain.ArcTestnet })).data?.wallets ?? [];
    const w = wls.find((x) => x.address?.toLowerCase() === "0x69906004c174c84ba9082f0f85dfa08ca7eb7cea") ?? wls[0];
    if (!w?.id) return NextResponse.json({ error: "no Arc agent wallet found" }, { status: 404 });

    const bals = (await c.getWalletTokenBalance({ id: w.id })).data?.tokenBalances ?? [];
    const usdc = bals.find((b) => b.token?.symbol === "USDC");
    if (!usdc?.token?.id) return NextResponse.json({ error: "agent wallet holds no USDC", wallet: w.address }, { status: 400 });

    const tx = await c.createTransaction({
      walletId: w.id,
      tokenId: usdc.token.id,
      destinationAddress: to,
      amount: [amount],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    return NextResponse.json({
      payer: w.address,
      payerWalletId: w.id,
      usdcBalance: usdc.amount,
      to,
      amount,
      transactionId: tx.data?.id,
      state: tx.data?.state,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
