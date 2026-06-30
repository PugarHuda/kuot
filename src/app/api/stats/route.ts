import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, getAddress, type Address } from "viem";
import { PERMISSION_CHAIN, USDC } from "@/lib/chains";
import { ledgerRanges } from "@/lib/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEDGER = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as Address | undefined;
const NAME_REGISTRY = process.env.NEXT_PUBLIC_NAME_REGISTRY as Address | undefined;
const ESCROW = process.env.NEXT_PUBLIC_UNCLAIMED_ESCROW as Address | undefined;
// Only the operator legitimately attests; ignore spoofed permissionless attest()
// calls so the traction snapshot can't be inflated by a stranger. See /api/activity.
const OPERATOR = (process.env.NEXT_PUBLIC_SESSION_ACCOUNT ?? "").toLowerCase();
// Where reverse-x402 / Cite-from-wallet payments land. External traction = anyone
// who is NOT the operator paying this address — chain truth, can't be inflated.
const COLLECTOR = (process.env.KUOT_COLLECTOR ?? process.env.NEXT_PUBLIC_SESSION_ACCOUNT) as Address | undefined;
const ARC_USDC = USDC[5042002];
const USDC_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

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
      const attestedAll = dedup(chunks.flatMap((c) => c[0]));
      const paidAll = dedup(chunks.flatMap((c) => c[1]));
      // Trust only operator-signed attestations; drop spoofed attest() entries.
      // FAIL CLOSED: no operator configured → trust nothing (not passthrough).
      const attested = OPERATOR ? attestedAll.filter((l) => String(l.args.payer).toLowerCase() === OPERATOR) : [];
      const legitQueries = new Set(attested.map((l) => String(l.args.queryId)));
      const paid = paidAll.filter((l) => legitQueries.has(String(l.args.queryId)));
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
  // Derived from the `Recorded(authorHash, amount, newTotal)` events ALONE — the
  // latest newTotal per hash is that author's recorded balance. We deliberately do
  // NOT read `owed` per hash: at hundreds of authors that was N RPC calls per
  // request, which intermittently rate-limited/timed out and zeroed the stat. The
  // only deduction we miss is a withdrawal (rare; recorded via a separate path),
  // so this slightly over-counts after a claim — acceptable for a traction figure.
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
      // latest newTotal wins per author (logs arrive in block order within/after flatten)
      const latestTotal = new Map<string, bigint>();
      for (const l of recLogs) latestTotal.set(String(l.args.authorHash), l.args.newTotal as bigint);
      for (const total of latestTotal.values()) {
        if (total > 0n) escrowedAuthors += 1;
        escrowedAtomic += total;
      }
    }
  } catch {
    /* network — escrow stats are additive, omit on failure */
  }
  const escrowedUSDC = Number(escrowedAtomic) / 1e6;

  // External payers: distinct non-operator wallets that paid USDC to the collector
  // on Arc (Cite-from-wallet button / reverse-x402). This is the verifiable
  // "not self-seeded" metric — every count is a real Transfer a judge can open on
  // Arcscan, and the operator's own address is excluded so it can't inflate itself.
  let externalPayers = 0;
  let externalPaidUSDC = 0;
  try {
    if (COLLECTOR && ARC_USDC) {
      const latest = await client.getBlockNumber();
      const ranges = ledgerRanges(latest);
      const xfers = (
        await Promise.all(
          ranges.map(({ lo, hi }) =>
            client.getLogs({ address: ARC_USDC, event: USDC_TRANSFER, args: { to: getAddress(COLLECTOR) }, fromBlock: lo, toBlock: hi }),
          ),
        )
      ).flat();
      const senders = new Set<string>();
      let atomic = 0n;
      for (const l of xfers) {
        const from = String(l.args.from).toLowerCase();
        if (from === OPERATOR) continue; // exclude self-seeding
        senders.add(from);
        atomic += l.args.value as bigint;
      }
      externalPayers = senders.size;
      externalPaidUSDC = Number(atomic) / 1e6;
    }
  } catch {
    /* network — additive metric, omit on failure */
  }

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
    externalPayers, // distinct NON-operator wallets that paid Kuot on-chain (verifiable, not self-seeded)
    externalPaidUSDC: Number(externalPaidUSDC.toFixed(6)),
    ledger: LEDGER ?? null,
  });
}
