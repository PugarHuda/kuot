/**
 * Agent self-pricing — Kuot (Lepton · Arc)
 *
 * Real agency means the agent decides prices, not a hardcoded constant. Two
 * decisions live here:
 *
 *  1) selfPriceForSynthesis() — when another agent cites a Kuot answer
 *     (reverse-x402), Kuot prices its OWN answer by how good it is: a
 *     high-confidence, deeply-grounded synthesis is worth more than a shallow
 *     one. The agent quotes its own work.
 *
 *  2) dynamicPaperBid() — when buying a source, the agent bids more for a
 *     high-relevance paper and less for a marginal one, within budget, instead
 *     of paying one flat price for everything.
 *
 *  3) recursiveBpsFor() — the fraction of a citation payment that flows back to
 *     the original authors scales with how grounded the answer was: the more an
 *     answer truly stands on its sources, the larger the share that returns to
 *     them.
 *
 * All amounts are atomic USDC (6 decimals). These are pure functions (unit-tested).
 */
import type { ResearchResult } from "./agent";

export type Confidence = "high" | "medium" | "low" | undefined;

/** Floor + ceiling for a self-quoted citation price (atomic USDC, 6-dec). */
const PRICE_FLOOR_6 = 50n; // $0.00005
const PRICE_CEIL_6 = 1_000n; // $0.001
const BASE_PRICE_6 = 100n; // $0.0001 — the reference lepton

function confidenceFactor(c: Confidence): number {
  if (c === "high") return 2.0;
  if (c === "medium") return 1.2;
  if (c === "low") return 0.7;
  return 1.0;
}

/** Fraction (0..1) of cited authors that survived proof-of-grounding. */
export function groundingDepth(result: Pick<ResearchResult, "grounding">): number {
  const g = result.grounding;
  if (!g) return 0;
  const total = g.groundedCount + g.droppedCount;
  if (total <= 0) return 0;
  return g.groundedCount / total;
}

export type SelfPrice = { priceUsdc6: bigint; priceDollars: string; recursiveBps: number };

/**
 * The agent quotes its own answer. Price scales with the fact-checker's
 * confidence and how much of the answer was genuinely grounded.
 */
export function selfPriceForSynthesis(result: Pick<ResearchResult, "confidence" | "grounding">): SelfPrice {
  const depth = groundingDepth(result);
  const factor = confidenceFactor(result.confidence) * (0.5 + 0.5 * depth);
  let price = BigInt(Math.round(Number(BASE_PRICE_6) * factor));
  if (price < PRICE_FLOOR_6) price = PRICE_FLOOR_6;
  if (price > PRICE_CEIL_6) price = PRICE_CEIL_6;
  return {
    priceUsdc6: price,
    priceDollars: `$${(Number(price) / 1e6).toFixed(6)}`,
    recursiveBps: recursiveBpsFor(result),
  };
}

/**
 * The deeper the grounding (and the higher the confidence), the larger the share
 * of a citation payment that flows recursively back to the original authors.
 * Range 50%–70%.
 */
export function recursiveBpsFor(result: Pick<ResearchResult, "confidence" | "grounding">): number {
  const depth = groundingDepth(result);
  const conf = result.confidence === "high" ? 1 : result.confidence === "medium" ? 0.7 : 0.4;
  const bps = Math.round(5000 + 2000 * depth * conf);
  return Math.max(5000, Math.min(7000, bps));
}

/**
 * The agent's bid for a single source. A top-ranked, highly-relevant paper is
 * worth a higher bid than a marginal one; the bid never exceeds the remaining
 * budget. `relevance` is the Citation-Matcher score (0..1); `rank` is 0-based.
 */
export function dynamicPaperBid(args: {
  rank: number;
  relevance?: number;
  remainingBudget6: bigint;
}): bigint {
  const BASE_6 = 1_000n; // $0.001 reference
  // Rank decay: each lower-ranked paper is worth ~20% less, floored at 30%.
  const rankFactor = Math.max(0.3, 1 - 0.2 * Math.max(0, args.rank));
  // Relevance lifts a strong match up to 1.5x; a weak/unknown match stays near base.
  const rel = typeof args.relevance === "number" ? Math.max(0, Math.min(1, args.relevance)) : 0.5;
  const relFactor = 0.6 + 0.9 * rel; // 0.6 .. 1.5
  let bid = BigInt(Math.round(Number(BASE_6) * rankFactor * relFactor));
  if (bid < 1n) bid = 1n;
  // Never bid more than the budget left for sources.
  if (args.remainingBudget6 >= 0n && bid > args.remainingBudget6) bid = args.remainingBudget6;
  return bid;
}
