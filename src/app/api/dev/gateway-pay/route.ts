import { NextResponse } from "next/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { devTokenOk } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dev/gateway-pay?id=<shareId> — runs a REAL Gateway buyer server-side
 * (Vercel's clean network) that pays the reverse-x402 /api/summaries endpoint, so
 * the full batched settlement can be proven even when the local network blocks the
 * Gateway API. Returns the Gateway balance before/after (a drop = real settlement).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // FAIL CLOSED: each call spends from the operator's Gateway balance.
  if (!devTokenOk(req)) {
    return NextResponse.json({ error: "forbidden — set DEV_PAY_TOKEN and pass ?token=" }, { status: 403 });
  }
  const id = url.searchParams.get("id") ?? "14c966d503a1d1b2";
  const pk = process.env.AGENT_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!pk) return NextResponse.json({ error: "no key" }, { status: 500 });

  const client = new GatewayClient({
    chain: "arcTestnet",
    privateKey: (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`,
    rpcUrl: process.env.ARC_RPC_URL,
  });

  const bal = async () => (await client.getBalances()).gateway.formattedTotal;
  const before = await bal();
  let status: number | undefined;
  let settlement: unknown;
  let transaction: string | undefined;
  let error: string | undefined;
  try {
    const r = await client.pay<{ settlement?: unknown }>(`${url.origin}/api/summaries/${id}`);
    status = r.status;
    settlement = r.data?.settlement;
    transaction = r.transaction;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const after = await bal();
  return NextResponse.json({ buyer: client.address, before, after, status, transaction, settlement, error });
}
