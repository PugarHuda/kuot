import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, getAddress, isAddress, type Address } from "viem";
import { PERMISSION_CHAIN } from "@/lib/chains";
import { ledgerRanges } from "@/lib/logs";

export const runtime = "nodejs";

const LEDGER = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as Address | undefined;
// AttributionLedger.attest() is permissionless on-chain, and authorEarnings is
// incremented inside it — so a stranger can spoof any address's lifetime earnings
// without moving USDC. Same trust boundary as /api/activity + /api/stats: count
// only AuthorPaid from operator-signed attestations, and FAIL CLOSED if the
// operator address isn't configured (trust nothing rather than show spoofs).
const OPERATOR = (process.env.NEXT_PUBLIC_SESSION_ACCOUNT ?? "").toLowerCase();
const QUERY_ATTESTED = parseAbiItem(
  "event QueryAttested(bytes32 indexed queryId, address indexed payer, uint256 total, uint256 citationCount)",
);
const AUTHOR_PAID = parseAbiItem(
  "event AuthorPaid(bytes32 indexed queryId, address indexed author, uint256 amount, uint16 weightBps)",
);

/** GET /api/author?address=0x... → lifetime earnings + recent payments (operator-attested only). */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address");
  if (!raw || !isAddress(raw)) return NextResponse.json({ error: "valid address required" }, { status: 400 });
  const address = getAddress(raw);
  if (!LEDGER || !OPERATOR) return NextResponse.json({ address, earned: "0", payments: [] });

  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc) });

  try {
    const latest = await client.getBlockNumber();
    // Anchored at the ledger deploy block, <100k chunks — see src/lib/logs.ts.
    const ranges = ledgerRanges(latest);
    const [attestedChunks, paidChunks] = await Promise.all([
      Promise.all(ranges.map(({ lo, hi }) => client.getLogs({ address: LEDGER, event: QUERY_ATTESTED, fromBlock: lo, toBlock: hi }))),
      Promise.all(ranges.map(({ lo, hi }) => client.getLogs({ address: LEDGER, event: AUTHOR_PAID, args: { author: address }, fromBlock: lo, toBlock: hi }))),
    ]);
    // Legit queryIds = those attested by the operator (drops spoofed attest() calls).
    const legitQueries = new Set(
      attestedChunks.flat().filter((l) => String(l.args.payer).toLowerCase() === OPERATOR).map((l) => String(l.args.queryId)),
    );
    const logs = paidChunks.flat().filter((l) => legitQueries.has(String(l.args.queryId)));

    let earnedAtomic = 0n;
    for (const l of logs) earnedAtomic += l.args.amount as bigint;
    const payments = logs
      .map((l) => ({
        queryId: l.args.queryId as string,
        amount: (l.args.amount as bigint).toString(),
        weightBps: Number(l.args.weightBps as number),
        txHash: l.transactionHash,
        block: Number(l.blockNumber),
      }))
      .reverse()
      .slice(0, 30);

    return NextResponse.json({ address, earned: earnedAtomic.toString(), payments });
  } catch (e) {
    return NextResponse.json({ address, earned: "0", payments: [], error: e instanceof Error ? e.message : String(e) });
  }
}
