import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { PERMISSION_CHAIN } from "@/lib/chains";
import { BOUNTY_ABI } from "@/lib/bounty";
import { resolveBountyTopic } from "../bounty-topic/route";

export const runtime = "nodejs";

const MARKET = process.env.NEXT_PUBLIC_BOUNTY_MARKET as Address | undefined;
const ZERO = "0x0000000000000000000000000000000000000000";
const CREATED = parseAbiItem(
  "event BountyCreated(uint256 indexed id, address indexed sponsor, bytes32 indexed topicHash, uint256 amount, uint64 expiresAt)",
);

/** GET /api/bounties → ALL bounties (read by id, no block-window limits) + readable topics. */
export async function GET() {
  if (!MARKET) return NextResponse.json({ bounties: [] });
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc) });
  try {
    // Authoritative list: read every bounty by id straight from the contract, so
    // none age out of a getLogs block window.
    const count = (await client.readContract({ address: MARKET, abi: BOUNTY_ABI, functionName: "bountyCount" })) as bigint;
    const n = Number(count);
    const ids = Array.from({ length: Math.min(n, 50) }, (_, i) => BigInt(n - 1 - i)); // newest first, capped
    const reads = await Promise.all(
      ids.map(async (id) => {
        const b = (await client.readContract({
          address: MARKET,
          abi: BOUNTY_ABI,
          functionName: "bounties",
          args: [id],
        })) as readonly [Address, `0x${string}`, bigint, bigint, boolean, boolean];
        return {
          id: id.toString(),
          sponsor: b[0] as string,
          topicHash: b[1] as string,
          amount: b[2].toString(),
          expiresAt: Number(b[3]),
          settled: b[4],
          refunded: b[5],
        };
      }),
    );
    const live = reads.filter((b) => b.sponsor !== ZERO && !b.refunded);

    // Best-effort: map id → creation txHash from recent logs (fine if older ones miss).
    const txById = new Map<string, string>();
    try {
      const latest = await client.getBlockNumber();
      const fromBlock = latest > 9_000n ? latest - 9_000n : 0n;
      const created = await client.getLogs({ address: MARKET, event: CREATED, fromBlock, toBlock: latest });
      for (const l of created) txById.set(String(l.args.id), l.transactionHash);
    } catch {
      /* logs are optional — the by-id read is the source of truth */
    }

    const bounties = await Promise.all(
      live.map(async (b) => ({ ...b, txHash: txById.get(b.id) ?? "", topic: await resolveBountyTopic(b.topicHash) })),
    );
    return NextResponse.json({ bounties, market: MARKET });
  } catch (e) {
    return NextResponse.json({ bounties: [], error: e instanceof Error ? e.message : String(e) });
  }
}
