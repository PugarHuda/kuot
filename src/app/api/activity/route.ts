import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { PERMISSION_CHAIN } from "@/lib/chains";

export const runtime = "nodejs";

const LEDGER = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as Address | undefined;
const QUERY_ATTESTED = parseAbiItem(
  "event QueryAttested(bytes32 indexed queryId, address indexed payer, uint256 total, uint256 citationCount)",
);
const AUTHOR_PAID = parseAbiItem(
  "event AuthorPaid(bytes32 indexed queryId, address indexed author, uint256 amount, uint16 weightBps)",
);

/** GET /api/activity → recent attestations + per-author leaderboard (on-chain). */
export async function GET() {
  if (!LEDGER) return NextResponse.json({ events: [], leaderboard: [] });
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc) });

  try {
    const latest = await client.getBlockNumber();
    const fromBlock = latest > 9_000n ? latest - 9_000n : 0n; // free-tier getLogs range cap (10k)

    const [attested, paid] = await Promise.all([
      client.getLogs({ address: LEDGER, event: QUERY_ATTESTED, fromBlock, toBlock: latest }),
      client.getLogs({ address: LEDGER, event: AUTHOR_PAID, fromBlock, toBlock: latest }),
    ]);

    // Per-query author counts.
    const authorsByQuery = new Map<string, number>();
    const earnings = new Map<string, bigint>();
    for (const l of paid) {
      const q = l.args.queryId as string;
      const a = l.args.author as string;
      authorsByQuery.set(q, (authorsByQuery.get(q) ?? 0) + 1);
      earnings.set(a, (earnings.get(a) ?? 0n) + (l.args.amount as bigint));
    }

    const events = attested
      .map((l) => ({
        queryId: l.args.queryId as string,
        payer: l.args.payer as string,
        total: (l.args.total as bigint).toString(),
        citationCount: Number(l.args.citationCount as bigint),
        block: Number(l.blockNumber),
        txHash: l.transactionHash,
      }))
      .reverse()
      .slice(0, 25);

    const leaderboard = [...earnings.entries()]
      .map(([author, amount]) => ({ author, earned: amount.toString() }))
      .sort((a, b) => (BigInt(b.earned) > BigInt(a.earned) ? 1 : -1))
      .slice(0, 10);

    return NextResponse.json({
      events,
      leaderboard,
      totals: { attestations: attested.length, authorsPaid: paid.length },
      ledger: LEDGER,
    });
  } catch (e) {
    return NextResponse.json({ events: [], leaderboard: [], error: e instanceof Error ? e.message : String(e) });
  }
}
