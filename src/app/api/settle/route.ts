import { NextResponse } from "next/server";
import { operatorAttest, operatorAttestAndSplit, queryIdOf } from "@/lib/settlement";
import { escrowUnclaimed } from "@/lib/escrow";
import { commitGrounding, identityHash } from "@/lib/grounding";
import { arcTestnet } from "@/lib/chains";
import { devTokenOk } from "@/lib/authz";
import { agentWalletPayout } from "@/lib/agent-wallet";
import type { CitationPayout } from "@/lib/agent";

const ARC_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

/** Commit the proof-of-grounding digest + grounded authors on-chain (best-effort). */
async function commitProof(query: string, payouts: CitationPayout[], digest?: `0x${string}`): Promise<`0x${string}` | null> {
  if (!digest) return null;
  try {
    return await commitGrounding({
      queryId: queryIdOf(query),
      digest,
      grounded: [],
      dropped: [],
      groundedHashes: payouts.map((p) => identityHash(p.identity)),
    });
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settle  { query, amountUSDC6, payouts, ledger, chainId? }
 *
 * Sends a REAL on-chain attestation to AttributionLedger.attest (operator-relayed),
 * recording who was cited and their share — an auditable on-chain receipt. The
 * USDC payout itself runs gasless via Gateway (client "Pay authors gasless" button).
 * Also surfaces the live Circle Gateway scope for the chain.
 */
type Body = {
  query: string;
  amountUSDC6: string;
  payouts: CitationPayout[];
  ledger: `0x${string}`;
  chainId?: number;
  /** "split" = operator pays authors from a PRE-FUNDED pool (Kutip-style upfront). */
  mode?: "attest" | "split";
  /** keccak256(synthesis) — committed on-chain as proof-of-grounding (from result.grounding.digest). */
  digest?: `0x${string}`;
};

// Per-call ceiling so a single settle can never move more than a sane amount of
// operator USDC (legit settles are sub-cent up to the ~$2 max grant).
const MAX_SETTLE_USDC6 = 5_000_000n; // $5

/** Cheap sanity on the payout plan (the ledger also enforces the weight sum on-chain). */
function payoutsValid(payouts: CitationPayout[]): boolean {
  if (!payouts.length || payouts.length > 64) return false;
  let sum = 0;
  for (const p of payouts) {
    if (typeof p.author !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.author)) return false;
    if (/^0x0{40}$/.test(p.author)) return false;
    if (!Number.isInteger(p.weightBps) || p.weightBps < 0 || p.weightBps > 10_000) return false;
    sum += p.weightBps;
  }
  return sum === 10_000;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.query || !body.ledger || !Array.isArray(body.payouts) || !body.payouts.length) {
    return NextResponse.json({ error: "query, ledger, payouts required" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.ledger)) {
    return NextResponse.json({ error: "invalid ledger address" }, { status: 400 });
  }
  if (!payoutsValid(body.payouts)) {
    return NextResponse.json({ error: "invalid payouts (valid addresses, weightBps integers summing to 10000, ≤64 entries)" }, { status: 400 });
  }

  let total: bigint;
  try {
    total = BigInt(body.amountUSDC6 ?? "0");
  } catch {
    return NextResponse.json({ error: "amountUSDC6 must be an integer string (atomic USDC)" }, { status: 400 });
  }
  if (total < 0n || total > MAX_SETTLE_USDC6) {
    return NextResponse.json({ error: `amountUSDC6 out of range (0..${MAX_SETTLE_USDC6} atomic = $5 cap)` }, { status: 400 });
  }

  // Every settle path makes the OPERATOR sign + broadcast an on-chain tx (gas) and
  // sets attested[queryId] (which would block the real paid split if a stranger
  // pre-attested a public queryId). So require the operator token for ALL modes —
  // fail closed. Read-only research/plans stay open via /api/research.
  const authorized = devTokenOk(req);
  if (!authorized) {
    return NextResponse.json(
      { error: "forbidden — settle signs an operator tx; provide the operator token (x-settle-token / x-dev-token / ?token=)" },
      { status: 403 },
    );
  }
  const queryId = queryIdOf(body.query);

  // Prefunded split (Kutip-style upfront): the operator already holds the locked
  // USDC and splits it to authors in one tx (records attestation + transfers).
  if (body.mode === "split") {
    if (!authorized) {
      return NextResponse.json(
        { error: "forbidden — split moves operator USDC; provide the operator settle token (x-settle-token / ?token=)" },
        { status: 403 },
      );
    }
    try {
      const txHash = await operatorAttestAndSplit({ ledger: body.ledger, query: body.query, amount: total, payouts: body.payouts });
      const groundingTx = await commitProof(body.query, body.payouts, body.digest);
      return NextResponse.json({
        mode: "split",
        queryId,
        txHash,
        explorer: ARC_TX(txHash),
        chain: arcTestnet.name,
        grounding: groundingTx ? { txHash: groundingTx, explorer: ARC_TX(groundingTx) } : null,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e), queryId }, { status: 502 });
    }
  }

  // Real on-chain attestation (record-only) on Arc.
  try {
    const txHash = await operatorAttest({
      ledger: body.ledger,
      query: body.query,
      total,
      payouts: body.payouts,
    });

    // Commit the proof-of-grounding (digest + grounded authors) on-chain. Best-effort.
    const groundingTx = await commitProof(body.query, body.payouts, body.digest);

    // Escrow the shares of authors who haven't claimed a wallet yet (held on-chain
    // by identity; withdrawable after they bind their ORCID). This MOVES operator
    // USDC, so it only runs for an authorized caller — the public path records the
    // attestation (gas-only) without moving funds.
    let escrow: { fundTx: string; recordTx: string; total: string } | null = null;
    if (authorized) {
      try {
        escrow = await escrowUnclaimed({ payouts: body.payouts, totalUSDC6: total });
      } catch {
        escrow = null;
      }
    }

    // Autonomous Agent-Wallet payout: the agent pays its TOP-weighted source directly
    // from its own Circle Agent Wallet (developer-controlled) — a real in-loop wallet
    // settlement. Best-effort + self-capped; never blocks the on-chain attest.
    let agentWallet = null;
    if (total > 0n) {
      const top = [...body.payouts].sort((a, b) => b.weightBps - a.weightBps)[0];
      if (top) {
        const share = (Number(total) / 1e6) * (top.weightBps / 10_000);
        agentWallet = await agentWalletPayout(top.author as `0x${string}`, share);
      }
    }

    return NextResponse.json({
      mode: "attested",
      queryId,
      txHash,
      explorer: ARC_TX(txHash),
      chain: arcTestnet.name,
      grounding: groundingTx ? { txHash: groundingTx, explorer: ARC_TX(groundingTx) } : null,
      escrow,
      agentWallet,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), queryId },
      { status: 502 },
    );
  }
}
