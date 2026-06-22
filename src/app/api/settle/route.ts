import { NextResponse } from "next/server";
import { operatorAttest, operatorAttestAndSplit, queryIdOf } from "@/lib/settlement";
import { escrowUnclaimed } from "@/lib/escrow";
import { commitGrounding, identityHash } from "@/lib/grounding";
import { arcTestnet } from "@/lib/chains";
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

  const total = BigInt(body.amountUSDC6 ?? "0");
  const queryId = queryIdOf(body.query);

  // Prefunded split (Kutip-style upfront): the operator already holds the locked
  // USDC and splits it to authors in one tx (records attestation + transfers).
  if (body.mode === "split") {
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

    // Escrow the shares of authors who haven't claimed a wallet yet (held
    // on-chain by identity; withdrawable after they bind their ORCID). Best-effort.
    let escrow: { fundTx: string; recordTx: string; total: string } | null = null;
    try {
      escrow = await escrowUnclaimed({ payouts: body.payouts, totalUSDC6: total });
    } catch {
      escrow = null;
    }

    return NextResponse.json({
      mode: "attested",
      queryId,
      txHash,
      explorer: ARC_TX(txHash),
      chain: arcTestnet.name,
      grounding: groundingTx ? { txHash: groundingTx, explorer: ARC_TX(groundingTx) } : null,
      escrow,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), queryId },
      { status: 502 },
    );
  }
}
