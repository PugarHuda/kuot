/**
 * Research agent orchestrator — Kuot
 *
 * Pipeline: search corpus → synthesize with Venice (chat + web search) →
 * weight citations → produce the payout plan that AttributionLedger.attestAndSplit
 * settles. Venice does the reasoning (private, uncensored); the payout is what
 * makes every citation an on-chain payment to its author.
 */
import { searchCorpus, searchRSSHub, refineQueryForSearch, type Work } from "./corpus";
import { payForPaper } from "./pay";
import { dynamicPaperBid } from "./pricing";
import { proveGrounding } from "./grounding";
import { orchestrate, type AgentStep, type Confidence } from "./orchestrator";
import { getAddress } from "viem";

export type CitationPayout = {
  author: `0x${string}`;
  authorName: string;
  weightBps: number;
  workTitle: string;
  url: string;
  /** Registry identity (ORCID or OpenAlex id) — used to escrow unclaimed shares. */
  identity: string;
  /** true if the wallet is a real claimed wallet (NameRegistry), false if demo. */
  claimed: boolean;
};

export type ResearchResult = {
  query: string;
  synthesis: string;
  webCitations: { title?: string; url?: string }[];
  works: Work[];
  payouts: CitationPayout[];
  /** "live" = Venice synthesized; "fallback" = dev mode (no Venice credit). */
  venice: "live" | "fallback";
  /** Real x402 micropayment to unlock the top paper (or why it was skipped). */
  x402: { paid: boolean; rail?: "gateway" | "legacy" | "none"; txHash?: string; amountUSDC?: string; reason?: string };
  /** Fact-checker agent's independent verification (a 2nd Venice web search). */
  verification?: string;
  /** Summarizer agent's TL;DR (multi-agent orchestration). */
  summary?: string;
  /** Fact-checker's confidence verdict (drives the revision loop). */
  confidence?: Confidence;
  /** Synthesis rounds (2 = fact-checker forced a revision). */
  rounds?: number;
  /** Full multi-agent trace incl. redelegation hops (A2A coordination). */
  agentTrace?: AgentStep[];
  /** Per-agent reputation deltas to settle on-chain (ERC-8004 feedback loop). */
  reputation?: { agent: string; delta: number; reason: string }[];
  /** Citation-Matcher (Venice embeddings) relevance per work id, 0–1. */
  relevance?: Record<string, number>;
  /** Adjudicator: the agent's OWN decided payout share per work id (0–100). When
   *  present these drove the split — a genuine LLM economic decision, not just
   *  embedding math (embeddings are the fallback). */
  adjudication?: Record<string, number>;
  /** One-line rationale the Adjudicator gave for the payout split. */
  adjudicationWhy?: string;
  /** Recommended USDC to settle, scaled by the fact-checker's confidence. */
  recommendedSettleUSDC?: number;
  /** The cleaned academic keywords actually searched on OpenAlex (typo-fixed, translated). */
  searchTerms?: string;
  /** Proof-of-grounding: only grounded authors are paid; digest is committed on-chain. */
  grounding?: { digest: `0x${string}`; groundedCount: number; droppedCount: number };
};

/**
 * Weight citations across the works' authors. Higher-ranked works get more
 * weight (linear decay), split evenly among that work's authors. Capped to the
 * top `MAX_PAYOUT_AUTHORS` (keeps on-chain attest/redeem gas bounded and avoids
 * dust splits). Returns basis-point weights that sum to exactly 10_000.
 */
export const MAX_PAYOUT_AUTHORS = 8;

export function weightCitations(
  works: Work[],
  relevance?: Record<string, number>,
  adjudication?: Record<string, number>,
): CitationPayout[] {
  const flat: (Omit<CitationPayout, "weightBps"> & { raw: number })[] = [];
  // When the Adjudicator (LLM) decided the split, ITS shares are authoritative —
  // the agent itself chose who gets paid. Embeddings/rank are the fallback prior.
  const adjudicated = adjudication && Object.keys(adjudication).length > 0;

  // The agent adjudicated but credited NO source (every share 0) → it decided the
  // answer wasn't grounded in any cited paper. Honor that: pay no one, rather than
  // falling back to embeddings and paying irrelevant authors. (Only when the
  // Adjudicator ran — the embedding path never zeroes everything out.)
  if (adjudicated && works.every((w) => (adjudication![w.id] ?? 0) <= 0)) return [];

  works.forEach((w, i) => {
    let workWeight: number;
    if (adjudicated) {
      // The agent's own fair-share decision for this source (0 = not credited).
      workWeight = Math.max(0, adjudication![w.id] ?? 0);
    } else {
      // Base rank weight, scaled by the Citation-Matcher's embedding relevance when
      // available (relevant papers earn more; never zeroed out). Falls back to pure
      // rank when embeddings are unavailable.
      const rel = relevance?.[w.id];
      const relFactor = typeof rel === "number" ? 0.25 + 0.75 * rel : 1;
      workWeight = (works.length - i) * relFactor; // rank 0 → highest
    }
    const share = w.authors.length ? workWeight / w.authors.length : 0;
    for (const a of w.authors) {
      flat.push({
        author: a.wallet,
        authorName: a.name,
        workTitle: w.title,
        url: w.url,
        identity: a.orcid ?? a.id,
        claimed: a.claimed,
        raw: share,
      });
    }
  });
  if (flat.length === 0) return [];

  // Keep the top contributors, then renormalize their weights to sum to 10_000.
  const top = flat.sort((a, b) => b.raw - a.raw).slice(0, MAX_PAYOUT_AUTHORS);
  const total = top.reduce((s, x) => s + x.raw, 0) || 1;
  let distributed = 0;
  return top.map((c, i) => {
    const isLast = i === top.length - 1;
    const bps = isLast ? 10_000 - distributed : Math.floor((c.raw / total) * 10_000);
    distributed += bps;
    const { raw: _raw, ...rest } = c;
    void _raw;
    return { ...rest, weightBps: bps };
  });
}

export type ResearchOptions = {
  papers?: number;
  fromYear?: number;
  toYear?: number;
  /** Answer language: "auto" (match the question) or a language name like "English". */
  language?: string;
  /** Root ERC-7715 budget (USDC) — propagated to per-agent redelegation sub-budgets. */
  rootBudgetUSDC?: number;
  /** Root grant expiry (unix) — propagated to per-agent narrowed expiries. */
  rootExpiryUnix?: number;
  /** OpenAlex work ids already cited in past runs — skipped so each run finds fresh papers. */
  excludeIds?: string[];
  /** Augment the academic corpus with N REAL publisher articles via RSSHub (0 = off).
   *  Each becomes a citable source whose toll settles to the publisher (Prior Art #01). */
  webSources?: number;
};

/** Run a full research query and return synthesis + payout plan. */
export async function runResearch(query: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  // Clamp untrusted inputs (the API is public).
  const papers = Math.min(10, Math.max(1, Math.floor(opts.papers ?? 5)));
  const clampYear = (y?: number) =>
    y && y >= 1800 && y <= 2100 ? Math.floor(y) : undefined;

  // Turn the (possibly conversational / non-English / typo'd) request into clean
  // academic keywords before hitting OpenAlex — e.g. "carikan skripsi autamtion
  // tools" → "automation tools". This is what makes the search robust for real users.
  const searchOpts = {
    limit: papers,
    fromYear: clampYear(opts.fromYear),
    toYear: clampYear(opts.toYear),
    excludeIds: Array.isArray(opts.excludeIds) ? opts.excludeIds.slice(0, 200) : undefined,
  };
  const searchTerms = await refineQueryForSearch(query);
  let works = await searchCorpus(searchTerms, searchOpts);
  // Belt-and-braces: if the refined terms found nothing, try the raw query.
  if (works.length === 0 && searchTerms.toLowerCase() !== query.trim().toLowerCase()) {
    works = await searchCorpus(query, searchOpts);
  }

  // Augment with REAL publisher articles (RSSHub) when asked — a live citation-toll
  // to the actual source (Prior Art #01). Pure augmentation: degrades to [] safely.
  const webN = Math.min(5, Math.max(0, Math.floor(opts.webSources ?? 0)));
  if (webN > 0) {
    const web = await searchRSSHub(searchTerms, webN);
    if (web.length) works = [...works, ...web.map((w, i) => ({ ...w, rank: works.length + i }))];
  }

  // No corpus hits → return cleanly with no payouts (UI disables settle/redeem).
  if (works.length === 0) {
    return {
      query,
      synthesis: `No papers found for "${searchTerms}" (searched from "${query}"). Either narrow/broaden the topic, or the academic corpus (OpenAlex) is momentarily busy — try again in a few seconds.`,
      webCitations: [],
      works: [],
      payouts: [],
      venice: "fallback",
      x402: { paid: false, reason: "no papers" },
      searchTerms,
    };
  }

  // x402: pay a real USDC nanopayment to unlock the top paper's full text.
  // Prefers the Circle Gateway batched rail on Arc; falls back to a direct,
  // on-chain-verifiable transfer. Degrades honestly when the agent is unfunded.
  // The agent BIDS for the source rather than paying one flat price: a top-ranked
  // paper earns a higher bid than a marginal one, never exceeding the source budget.
  const sourceBudget6 = BigInt(Math.round(Math.max(0, opts.rootBudgetUSDC ?? 0.1) * 1e6));
  const paperBid6 = dynamicPaperBid({ rank: works[0]?.rank ?? 0, remainingBudget6: sourceBudget6 });
  let x402: ResearchResult["x402"] = { paid: false, rail: "none", reason: "agent has no test USDC yet" };
  const payTo = process.env.NEXT_PUBLIC_SESSION_ACCOUNT as `0x${string}` | undefined;
  const topPaperId = works[0]?.id ?? "top";
  if (payTo && paperBid6 > 0n) {
    x402 = await payForPaper(topPaperId, getAddress(payTo), paperBid6);
  } else if (paperBid6 <= 0n) {
    x402 = { paid: false, rail: "none", reason: "source budget exhausted (bid ≤ 0)" };
  }

  // Multi-agent orchestration: Researcher redelegates to a Reader fan-out (one
  // sub-agent per paper), a Synthesizer, a Fact-checker that can force a revision
  // round, and a Summarizer. Each agent does real Venice work under a narrowed
  // sub-budget. Degrades cleanly: if Venice has no credit the synthesis comes
  // back empty and we fall through to the labeled dev fallback below.
  try {
    const o = await orchestrate(query, works, {
      rootBudgetUSDC: opts.rootBudgetUSDC,
      rootExpiryUnix: opts.rootExpiryUnix,
      language: opts.language,
    });
    if (o.synthesis) {
      // Proof-of-grounding: drop sub-floor citations, keep only authors whose work
      // grounded the answer, and surface the tamper-evident digest. Only `grounded`
      // gets paid — commitGrounding(proof) records it on-chain at settlement time.
      const proof = proveGrounding({ query, synthesis: o.synthesis, payouts: weightCitations(works, o.relevance, o.adjudication) });
      return {
        query,
        synthesis: o.synthesis,
        webCitations: o.webCitations,
        works,
        payouts: proof.grounded,
        grounding: { digest: proof.digest, groundedCount: proof.grounded.length, droppedCount: proof.dropped.length },
        venice: "live",
        x402,
        verification: o.verification,
        summary: o.summary,
        confidence: o.confidence,
        rounds: o.rounds,
        agentTrace: o.trace,
        reputation: o.reputation,
        relevance: o.relevance,
        adjudication: o.adjudication,
        adjudicationWhy: o.adjudicationWhy,
        recommendedSettleUSDC: o.recommendedSettleUSDC,
        searchTerms,
      };
    }
  } catch {
    // fall through to the dev fallback below
  }

  // Dev fallback: no Venice credit / 402. Build a synthesis from the abstracts
  // so the full research → payout → settle flow stays testable for free.
  // The real demo uses live Venice (this branch is clearly labeled in the UI).
  const synthesis =
    `⚠️ Venice fallback (dev mode — no credit).\n\n` +
    `Synthesis for "${query}" drawn from ${works.length} papers:\n\n` +
    works
      .map((w, i) => `[${i + 1}] ${w.title} — ${w.abstract.slice(0, 240)}…`)
      .join("\n\n");
  return { query, synthesis, webCitations: [], works, payouts: weightCitations(works), venice: "fallback", x402, searchTerms };
}
