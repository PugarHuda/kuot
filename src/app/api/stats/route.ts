import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { PERMISSION_CHAIN } from "@/lib/chains";
import { ledgerRanges } from "@/lib/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEDGER = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as Address | undefined;
const NAME_REGISTRY = process.env.NEXT_PUBLIC_NAME_REGISTRY as Address | undefined;
const ESCROW = process.env.NEXT_PUBLIC_UNCLAIMED_ESCROW as Address | undefined;

const QUERY_ATTESTED = parseAbiItem(
  "event QueryAttested(bytes32 indexed queryId, address indexed payer, uint256 total, uint256 citationCount)",
);
const AUTHOR_PAID = parseAbiItem(
  "event AuthorPaid(bytes32 indexed queryId, address indexed author, uint256 amount, uint16 weightBps)",
);
const RECORDED = parseAbiItem(
  "event Recorded(bytes32 indexed authorHash, uint256 amount, uint256 newTotal)",
);
const BINDING_COUNT = parseAbiItem("function bindingCount() view returns (uint256)");
const OWED = parseAbiItem("function owed(bytes32 authorHash) view returns (uint256)");

/**
 * GET /api/stats — public traction snapshot for the author-onboarding campaign.
 * Real, on-chain numbers a judge (or an author) can verify: how many authors have
 * been onboarded (bound a wallet), how much has been attributed, how many payouts.
 */
export async function GET() {
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc) });

  let attestations = 0;
  let authorPayouts = 0;
  let attributedAtomic = 0n;
  const uniqueAuthors = new Set<string>();
  try {
    if (LEDGER) {
      const latest = await client.getBlockNumber();
      const ranges = ledgerRanges(latest);
      const chunks = await Promise.all(
        ranges.map(({ lo, hi }) =>
          Promise.all([
            client.getLogs({ address: LEDGER, event: QUERY_ATTESTED, fromBlock: lo, toBlock: hi }),
            client.getLogs({ address: LEDGER, event: AUTHOR_PAID, fromBlock: lo, toBlock: hi }),
          ]),
        ),
      );
      // Dedup by (txHash, logIndex) in case a chunk boundary / reorg replays a log.
      const dedup = <T extends { transactionHash: `0x${string}` | null; logIndex: number }>(logs: T[]) => {
        const m = new Map<string, T>();
        for (const l of logs) m.set(`${l.transactionHash}:${l.logIndex}`, l);
        return [...m.values()];
      };
      const attested = dedup(chunks.flatMap((c) => c[0]));
      const paid = dedup(chunks.flatMap((c) => c[1]));
      attestations = attested.length;
      authorPayouts = paid.length;
      // Sum in bigint (no float drift / precision loss), divide once at the end.
      for (const l of attested) attributedAtomic += l.args.total as bigint;
      for (const l of paid) uniqueAuthors.add(String(l.args.author).toLowerCase());
    }
  } catch {
    /* network — return what we have */
  }
  const attributedUSDC = Number(attributedAtomic) / 1e6;

  // Authors with a real claimable balance held in UnclaimedEscrow (the wider
  // cohort: every cited co-author, not only those already paid via the ledger).
  let escrowedAuthors = 0;
  let escrowedAtomic = 0n;
  try {
    if (ESCROW) {
      const latest = await client.getBlockNumber();
      const ranges = ledgerRanges(latest);
      const recLogs = (
        await Promise.all(
          ranges.map(({ lo, hi }) => client.getLogs({ address: ESCROW, event: RECORDED, fromBlock: lo, toBlock: hi })),
        )
      ).flat();
      const hashes = [...new Set(recLogs.map((l) => String(l.args.authorHash)))] as `0x${string}`[];
      // Current owed (net of withdrawals) per distinct author — the honest live total.
      const owed = await Promise.all(
        hashes.map((h) => client.readContract({ address: ESCROW, abi: [OWED], functionName: "owed", args: [h] }) as Promise<bigint>),
      );
      for (const o of owed) {
        if (o > 0n) escrowedAuthors += 1;
        escrowedAtomic += o;
      }
    }
  } catch {
    /* network — escrow stats are additive, omit on failure */
  }
  const escrowedUSDC = Number(escrowedAtomic) / 1e6;

  let authorsOnboarded = 0;
  try {
    if (NAME_REGISTRY) {
      authorsOnboarded = Number(
        (await client.readContract({ address: NAME_REGISTRY, abi: [BINDING_COUNT], functionName: "bindingCount" })) as bigint,
      );
    }
  } catch {
    /* network */
  }

  return NextResponse.json({
    authorsOnboarded, // wallets bound on-chain (NameRegistry) — the campaign metric
    attestations, // settled research queries
    authorPayouts, // on-chain AuthorPaid events
    citedAuthors: uniqueAuthors.size, // distinct authors paid
    attributedUSDC: Number(attributedUSDC.toFixed(6)),
    escrowedAuthors, // distinct authors with a claimable balance waiting (escrow)
    escrowedUSDC: Number(escrowedUSDC.toFixed(6)), // total currently owed in escrow
    ledger: LEDGER ?? null,
  });
}
