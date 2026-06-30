import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { require402 } from "@/lib/x402";
import { USDC, PERMISSION_CHAIN } from "@/lib/chains";
import { verifyPayment } from "@/lib/x402pay";

export const runtime = "nodejs";

/**
 * GET /api/paper/[id]  — an x402-gated resource (premium paper full-text).
 *
 * No X-PAYMENT header  → 402 with payment requirements (USDC on Base via ERC-7710).
 * Valid X-PAYMENT      → 200 with the full text + X-PAYMENT-RESPONSE receipt.
 *
 * This is the agent's "buy the paper" step in the main research flow. The
 * payment is settled by redeeming a 7710 delegation (see settlement.ts), which
 * our facilitator relays via 1Shot.
 */
const PRICE_USDC_6 = 1_000n; // $0.001 — sub-cent nanopayment

// Best-effort single-use marker for the on-chain tx-hash payment, per serverless
// instance — same guard as /api/summaries. With the 120s recency window below it
// stops a confirmed transfer being replayed across paper ids (or the same id). The
// unlocked content is already-public OpenAlex data, so the residual cross-instance
// window is low-risk, but this keeps replay protection consistent across the
// verifyPayment callers (summaries had it; this sibling did not).
const seenPaperTx = new Set<string>();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const payTo = (process.env.NEXT_PUBLIC_SESSION_ACCOUNT as `0x${string}`) ??
    "0x000000000000000000000000000000000000dEaD";
  const delegationManager =
    (process.env.NEXT_PUBLIC_DELEGATION_MANAGER as `0x${string}`) ??
    "0x0000000000000000000000000000000000000000";

  // X-PAYMENT carries the tx hash of a USDC transfer to payTo (the "exact" scheme).
  const txHash = req.headers.get("X-PAYMENT") as `0x${string}` | null;

  if (!txHash) {
    return NextResponse.json(
      require402({
        amountUSDC6: PRICE_USDC_6,
        asset: USDC[PERMISSION_CHAIN.id],
        payTo,
        resource: `/api/paper/${id}`,
        description: `Full text access for paper ${id}`,
        network: PERMISSION_CHAIN.name.toLowerCase(),
        delegationManager,
      }),
      { status: 402 },
    );
  }

  // REAL on-chain verification: the tx must be a confirmed, FRESH (<120s), single-use
  // USDC Transfer to payTo of >= price. No header-shape stub (H1); no replay.
  const key = txHash.toLowerCase();
  if (seenPaperTx.has(key)) {
    return NextResponse.json({ error: "payment already used (replay)" }, { status: 402 });
  }
  const ok = await verifyPayment(txHash, getAddress(payTo), PRICE_USDC_6, 120);
  if (!ok) {
    return NextResponse.json({ error: "payment not verified on-chain (must be a fresh USDC transfer to payTo ≥ price)" }, { status: 402 });
  }
  seenPaperTx.add(key);

  // Real content, not a canned string: fetch the actual OpenAlex work the agent
  // paid to read (id is an OpenAlex work id / DOI). Abstract is reconstructed
  // from OpenAlex's inverted index.
  const paper = await fetchOpenAlexWork(id);
  return NextResponse.json(
    {
      id,
      ...paper,
      paid: `${Number(PRICE_USDC_6) / 1e6} USDC`,
      txHash,
    },
    { status: 200, headers: { "X-PAYMENT-RESPONSE": "verified" } },
  );
}

/** Reconstruct an abstract from OpenAlex's inverted index. */
function deinvert(idx?: Record<string, number[]> | null): string {
  if (!idx || typeof idx !== "object") return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) words[p] = word;
  }
  return words.join(" ");
}

async function fetchOpenAlexWork(id: string) {
  // OpenAlex accepts a bare work id, a full URL, or a DOI in the path.
  const key = id.startsWith("http") || id.startsWith("10.") ? id : `https://openalex.org/${id}`;
  try {
    const res = await fetch(`https://api.openalex.org/works/${encodeURIComponent(key)}`, {
      headers: { "User-Agent": "kuot (hudapugar@gmail.com)" },
    });
    if (!res.ok) return { error: `paper not found in OpenAlex (${res.status})` };
    const w = (await res.json()) as {
      title?: string | null;
      publication_year?: number;
      doi?: string | null;
      abstract_inverted_index?: Record<string, number[]> | null;
      authorships?: { author?: { display_name?: string } }[];
    };
    return {
      title: w.title ?? null,
      year: w.publication_year ?? null,
      doi: w.doi ?? null,
      authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean),
      abstract: deinvert(w.abstract_inverted_index),
    };
  } catch (e) {
    return { error: `OpenAlex fetch failed: ${String(e)}` };
  }
}
