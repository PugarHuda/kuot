/**
 * Recursive reverse-x402 — Kuot (Lepton · Arc)
 *
 * Kuot's answers are themselves a paid resource: when another agent cites Kuot
 * (pays to read a stored synthesis via reverse-x402), a fraction flows BACK to
 * the original authors whose work grounded that answer — by their grounding
 * weights. A remix of a remix pays every ancestor. This is the recursive citation
 * economy: being cited earns money, and the graph compounds. The "payment-chain
 * depth" metric RFB-03 asks for is literally how deep this recursion runs.
 */
import type { CitationPayout } from "./agent";

/** Fraction (bps) of a reverse-x402 payment that flows back to original authors. */
const RECURSIVE_BPS = Number(process.env.KUOT_RECURSIVE_BPS ?? 7000); // 70%

export type RecursivePayout = {
  author: `0x${string}`;
  identity: string;
  weightBps: number;
  amountAtomic: bigint;
};

export type RecursiveSplit = {
  /** How much of the payment recursively reaches the original authors. */
  toAuthors: RecursivePayout[];
  toAuthorsTotalAtomic: bigint;
  /** Kuot's margin (covers the synthesis work; can itself be split to the mesh). */
  marginAtomic: bigint;
  recursiveBps: number;
};

/**
 * Split a reverse-x402 payment of `amountAtomic` USDC across the grounded authors
 * (by weight), keeping a margin. Weights are assumed to sum to ~10_000; the last
 * author absorbs any rounding remainder so the author total is exact.
 */
export function recursiveSplit(
  amountAtomic: bigint,
  grounded: CitationPayout[],
  recursiveBps: number = RECURSIVE_BPS,
): RecursiveSplit {
  const toAuthorsTotal = (amountAtomic * BigInt(recursiveBps)) / 10_000n;
  let distributed = 0n;
  const toAuthors: RecursivePayout[] = grounded.map((p, i) => {
    const isLast = i === grounded.length - 1;
    const amt = isLast ? toAuthorsTotal - distributed : (toAuthorsTotal * BigInt(p.weightBps)) / 10_000n;
    if (!isLast) distributed += amt;
    return { author: p.author, identity: p.identity, weightBps: p.weightBps, amountAtomic: amt };
  });
  return {
    toAuthors,
    toAuthorsTotalAtomic: toAuthorsTotal,
    marginAtomic: amountAtomic - toAuthorsTotal,
    recursiveBps,
  };
}
