import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, getAddress, isAddress, type Address } from "viem";
import { PERMISSION_CHAIN } from "@/lib/chains";
import { ledgerRanges } from "@/lib/logs";

export const runtime = "nodejs";

const LEDGER = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as Address | undefined;
const AUTHOR_PAID = parseAbiItem(
  "event AuthorPaid(bytes32 indexed queryId, address indexed author, uint256 amount, uint16 weightBps)",
);
const EARNINGS_ABI = [
  {
    type: "function",
    name: "authorEarnings",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** GET /api/author?address=0x... → lifetime earnings + recent payments. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address");
  if (!raw || !isAddress(raw)) return NextResponse.json({ error: "valid address required" }, { status: 400 });
  const address = getAddress(raw);
  if (!LEDGER) return NextResponse.json({ address, earned: "0", payments: [] });

  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc) });

  try {
    const latest = await client.getBlockNumber();
    // Anchored at the ledger deploy block, <100k chunks — see src/lib/logs.ts.
    const ranges = ledgerRanges(latest);
    const [earned, logChunks] = await Promise.all([
      client.readContract({ address: LEDGER, abi: EARNINGS_ABI, functionName: "authorEarnings", args: [address] }),
      Promise.all(ranges.map(({ lo, hi }) => client.getLogs({ address: LEDGER, event: AUTHOR_PAID, args: { author: address }, fromBlock: lo, toBlock: hi }))),
    ]);
    const logs = logChunks.flat();

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

    return NextResponse.json({ address, earned: (earned as bigint).toString(), payments });
  } catch (e) {
    return NextResponse.json({ address, earned: "0", payments: [], error: e instanceof Error ? e.message : String(e) });
  }
}
