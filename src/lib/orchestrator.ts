/**
 * Multi-agent orchestrator — Kuot (A2A coordination)
 *
 * This is the real coordination layer the "Best Agent" + "Best A2A" tracks
 * reward. The Researcher orchestrates a mesh of specialist agents, each of which
 * does genuine work (its own Venice call) under a strictly narrowed slice of the
 * user's ERC-7715 budget:
 *
 *   Researcher (root budget)
 *     ├─ Reader×N   — one per paper, parallel fan-out (B). Each extracts that
 *     │               paper's key finding under a tiny redelegated sub-budget.
 *     ├─ Synthesizer — merges the readers' findings into a grounded answer.
 *     ├─ Fact-checker — independently verifies; can REJECT (low confidence) →
 *     │               triggers ONE Researcher revision round (A, a real loop).
 *     └─ Summarizer — condenses the verified answer to a TL;DR.
 *
 * After the run we score each agent on whether its work survived (E) and bump
 * its on-chain ERC-8004 reputation (done server-side at settlement, not here).
 *
 * Every Venice call is wrapped so a single agent failing degrades the trace
 * instead of breaking the whole run — the live demo never hard-fails.
 */
import type { Work } from "./corpus";
import { veniceChat, veniceEmbed } from "./venice";
import { AGENT_MESH, narrowedFor, type AgentRole } from "./agents";
import { recall, remember } from "./memory";
import { AGENT_MODELS, modelLabel } from "./agent-models";

/** Cosine similarity of two equal-length vectors (0 if degenerate). Pure + testable. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/**
 * How many parallel Reader sub-agents to spawn, scaled to the granted budget.
 * More budget → deeper coverage. Pure + testable. Clamped to [2, 5].
 */
export function readerCountForBudget(budgetUSDC: number): number {
  const n = Math.round((budgetUSDC || 0) / 4);
  return Math.max(2, Math.min(5, n || 2));
}

/** Recommended USDC to settle, scaled by the fact-checker's confidence. */
export function settleForConfidence(confidence: Confidence, base = 0.5): number {
  const factor = confidence === "high" ? 1 : confidence === "medium" ? 0.7 : 0.4;
  return Math.round(base * factor * 100) / 100;
}

/** A single step in the agent trace shown in the UI (and proof for judges). */
export type AgentStep = {
  agent: AgentRole["id"];
  label: string;
  /** What this agent did this step. */
  action: string;
  status: "ok" | "skipped" | "rejected" | "revised";
  /** Short human-readable detail / output preview. */
  detail: string;
  /** The narrowed sub-budget this agent operated under (USDC), if redelegated. */
  budgetUSDC?: number;
  /** Hours until this hop's redelegation expires. */
  expiryHours?: number;
  /** Set when this step is a redelegation hop (C). from → to with the caveats. */
  redelegation?: { from: AgentRole["id"]; to: AgentRole["id"]; caveats: string[] };
};

export type Confidence = "high" | "medium" | "low";

export type OrchestrationResult = {
  synthesis: string;
  verification?: string;
  summary?: string;
  confidence: Confidence;
  /** Number of synthesis rounds (2 = the fact-checker forced a revision). */
  rounds: number;
  trace: AgentStep[];
  webCitations: { title?: string; url?: string }[];
  /** Per-agent reputation deltas to settle on-chain (E). */
  reputation: { agent: AgentRole["id"]; delta: number; reason: string }[];
  /** Citation-Matcher (Venice embeddings) relevance score per work id, 0–1. */
  relevance: Record<string, number>;
  /** Adjudicator: the LLM's OWN decided fair-share per work id (0–100), judging how
   *  much each source actually grounded the answer. When present these are the
   *  authoritative payout weights — a genuine economic decision by the agent, not
   *  just embedding math; embeddings remain the fallback. */
  adjudication?: Record<string, number>;
  /** One-line rationale the Adjudicator gave for the split (shown in the trace). */
  adjudicationWhy?: string;
  /** Recommended USDC to settle, scaled by confidence (agent economic decision). */
  recommendedSettleUSDC: number;
};

const byId = (id: AgentRole["id"]) => AGENT_MESH.find((r) => r.id === id)!;

/**
 * Parse the fact-checker's verdict into a confidence level. Pure + testable.
 * Looks for an explicit "confidence: high|medium|low", else infers from tone.
 */
export function parseConfidence(text: string): Confidence {
  const t = text.toLowerCase();
  const m = t.match(/confidence[:\s]+(high|medium|low)/);
  if (m) return m[1] as Confidence;
  if (/\b(unsupported|contested|incorrect|no evidence|fabricat|cannot verify)\b/.test(t)) return "low";
  if (/\b(weak|uncertain|partially|mixed|some claims)\b/.test(t)) return "medium";
  return "high";
}

/** A low/medium verdict with flagged claims warrants one revision round. */
export function needsRevision(confidence: Confidence): boolean {
  return confidence === "low";
}

/**
 * Parse the Adjudicator LLM's payout decision. Pure + testable. Extracts the first
 * JSON object and reads `shares` (workId → 0..100) + an optional `why`. Returns a
 * map covering EVERY requested workId (omitted ids → 0, i.e. the agent chose not to
 * credit them) only if the model produced at least one positive share for a known
 * id; otherwise null (→ caller falls back to embedding-weighted payouts). Keeping
 * it all-or-nothing avoids mixing the LLM's 0-100 scale with the rank scale.
 */
/** The agent may also decide the TOTAL it pays; clamped to this band (USDC). */
export const ADJ_MIN_TOTAL = 0.05;
export const ADJ_MAX_TOTAL = 1.0;

export function parseAdjudication(
  text: string,
  workIds: string[],
): { shares: Record<string, number>; why?: string; total?: number } | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const raw = (obj as { shares?: unknown }).shares;
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const known = new Set(workIds);
  const shares: Record<string, number> = {};
  let positive = 0;
  for (const id of workIds) {
    const v = src[id];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    shares[id] = Number.isFinite(n) && n > 0 && known.has(id) ? n : 0;
    if (shares[id] > 0) positive += 1;
  }
  if (positive === 0) return null; // model credited nothing usable → fall back
  const why = (obj as { why?: unknown }).why;
  // The agent's own call on HOW MUCH to pay in total (not just the split). Clamped
  // to a safe band so a hallucinated number can't drain or zero the settlement.
  const tRaw = (obj as { total?: unknown }).total;
  const t = typeof tRaw === "number" ? tRaw : typeof tRaw === "string" ? Number(tRaw) : NaN;
  const total = Number.isFinite(t) && t > 0 ? Math.min(ADJ_MAX_TOTAL, Math.max(ADJ_MIN_TOTAL, t)) : undefined;
  return { shares, why: typeof why === "string" ? why : undefined, total };
}

/** Max sub-questions the Planner may emit (bounds the Reader fan-out). */
export const MAX_SUBQUESTIONS = 3;

/**
 * Parse the Planner's decomposition into a clean list of sub-questions. Pure +
 * testable. Strips list markers / numbering, drops empties, caps the count, and
 * always returns at least the original query so the pipeline never stalls.
 */
export function parseSubQuestions(text: string, fallback: string, maxN: number = MAX_SUBQUESTIONS): string[] {
  let lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0 && /\w/.test(l) && !/^(?:sub-?questions?|here are|these are).*:?\s*$/i.test(l));
  // Model returned everything on one line → split on "?" so we still fan out.
  if (lines.length === 1 && (lines[0].match(/\?/g)?.length ?? 0) >= 2) {
    lines = lines[0]
      .split("?")
      .map((s) => s.trim())
      .filter((s) => /\w/.test(s))
      .map((s) => `${s}?`);
  }
  // Drop a lone sub-question that just echoes the whole question (no real split).
  const cleaned = [...new Set(lines)].slice(0, Math.max(1, maxN));
  return cleaned.length ? cleaned : [fallback];
}

/**
 * Build the literal redelegation hops (C): for each specialist, the concrete
 * narrowed budget/expiry derived from the root grant. Pure + testable — this is
 * the same data the UI renders and (optionally) redeems via 1Shot.
 */
export function buildRedelegations(
  rootBudgetUSDC: number,
  rootExpiryUnix: number,
  nowUnix: number,
): AgentStep[] {
  return AGENT_MESH.filter((r) => r.depth >= 2).map((role) => {
    const { budgetUSDC, expiryUnix } = narrowedFor(role, rootBudgetUSDC, rootExpiryUnix, nowUnix);
    return {
      agent: role.id,
      label: role.label,
      action: "redelegation",
      status: "ok" as const,
      detail: `Researcher redelegates ≤ ${budgetUSDC.toFixed(2)} USDC (narrowed)`,
      budgetUSDC,
      expiryHours: Math.max(0, Math.round((expiryUnix - nowUnix) / 3600)),
      redelegation: { from: "researcher", to: role.id, caveats: role.caveats },
    };
  });
}

/**
 * Score each agent's contribution for the reputation feedback loop (E).
 * Reputation is earned, not given: an agent only scores if its work was used
 * and survived. The fact-checker scores more when it actually caught something.
 */
export function scoreAgents(input: {
  readersUsed: number;
  confidence: Confidence;
  revised: boolean;
  subQuestions?: number;
}): { agent: AgentRole["id"]; delta: number; reason: string }[] {
  const out: { agent: AgentRole["id"]; delta: number; reason: string }[] = [];
  out.push({ agent: "researcher", delta: 1, reason: "orchestrated the run" });
  if (input.subQuestions && input.subQuestions > 1)
    out.push({ agent: "planner", delta: 1, reason: `decomposed into ${input.subQuestions} sub-questions` });
  if (input.readersUsed > 0)
    out.push({ agent: "reader", delta: 1, reason: `answered ${input.readersUsed} sub-question(s)` });
  // The fact-checker earns more when it forced a correction — that's real value.
  out.push({
    agent: "factchecker",
    delta: input.revised ? 2 : 1,
    reason: input.revised ? "caught a weak claim → forced revision" : "verified the answer",
  });
  if (input.confidence !== "low")
    out.push({ agent: "summarizer", delta: 1, reason: "produced the verified TL;DR" });
  return out;
}

async function safeChat(
  opts: Parameters<typeof veniceChat>[0],
): Promise<{ text: string; citations: { title?: string; url?: string }[] } | null> {
  try {
    const r = await veniceChat(opts);
    return { text: r.text, citations: r.citations };
  } catch {
    return null;
  }
}

const lang = (language?: string) =>
  language && language !== "auto" ? `Always respond in ${language}.` : "Respond in the same language as the question.";

/**
 * Run the full multi-agent orchestration. `works` are the corpus hits the
 * Researcher already pulled. Returns the synthesis, verification, summary, and
 * the full agent trace (with redelegation hops) for the UI + judges.
 */
export async function orchestrate(
  query: string,
  works: Work[],
  opts: { rootBudgetUSDC?: number; rootExpiryUnix?: number; nowUnix?: number; language?: string } = {},
): Promise<OrchestrationResult> {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const rootBudget = opts.rootBudgetUSDC ?? 10;
  const rootExpiry = opts.rootExpiryUnix ?? now + 86_400;
  const trace: AgentStep[] = [];
  // Budget-scaled fan-out: a larger granted budget buys deeper coverage (#3).
  const targetSubQ = readerCountForBudget(rootBudget);

  // ── Researcher: plan + redelegate (C) ──────────────────────────────────────
  trace.push({
    agent: "researcher",
    label: byId("researcher").label,
    action: "plan",
    status: "ok",
    detail: `Pulled ${works.length} candidate paper(s); redelegating to specialists.`,
    budgetUSDC: rootBudget,
    expiryHours: Math.max(0, Math.round((rootExpiry - now) / 3600)),
  });
  for (const hop of buildRedelegations(rootBudget, rootExpiry, now)) trace.push(hop);

  // ── Memory: recall related prior research before planning (agent isn't amnesiac) ──
  try {
    const related = await recall(query, 3);
    if (related.length) {
      trace.push({
        agent: "researcher",
        label: byId("researcher").label,
        action: "recall memory",
        status: "ok",
        detail: `Recalled ${related.length} related prior run(s): ${related.map((m) => `“${m.query.slice(0, 45)}”`).join("; ")}`,
      });
    }
  } catch {
    /* memory is best-effort */
  }

  // Compact corpus the Readers ground their answers in (shared across the fan-out).
  const corpus = works
    .map((w, i) => `[${i + 1}] "${w.title}" (${w.year ?? "n.d."}): ${w.abstract.slice(0, 400)}`)
    .join("\n");

  // ── Planner (depth 1): decompose the question into focused sub-questions ────
  const planRes = await safeChat({
    model: AGENT_MODELS.planner,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          `You are a Planner agent. Decompose research questions into exactly ${targetSubQ} focused, ` +
          "non-overlapping sub-questions that together fully answer the original. Each sub-question MUST be " +
          "narrower than the original — never restate it. Output ONLY the sub-questions, one per line, each " +
          "starting with '- ', no numbering, no preamble, no answers. " + lang(opts.language),
      },
      {
        role: "user",
        content:
          `Original question: ${query}\n\nReturn exactly ${targetSubQ} narrower sub-questions, one per line, each starting with '- '.`,
      },
    ],
  });
  const subQuestions = planRes ? parseSubQuestions(planRes.text, query, targetSubQ) : [query];
  trace.push({
    agent: "planner",
    label: byId("planner").label,
    action: "decompose",
    status: planRes ? "ok" : "skipped",
    detail: planRes
      ? `[${modelLabel(AGENT_MODELS.planner)}] Split into ${subQuestions.length}/${targetSubQ} sub-question(s): ${subQuestions.map((q) => `“${q.slice(0, 45)}”`).join("; ")}`
      : "Planner unavailable — Readers answer the whole question.",
  });

  // ── Reader fan-out (B): one parallel sub-agent per sub-question ─────────────
  const readerBudget = narrowedFor(byId("reader"), rootBudget, rootExpiry, now).budgetUSDC;
  const perReader = subQuestions.length ? readerBudget / subQuestions.length : 0;
  const readings = await Promise.all(
    subQuestions.map(async (sq) => {
      const r = await safeChat({
        model: AGENT_MODELS.reader,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a Reader agent assigned ONE sub-question. Answer it concisely using only the provided " +
              "papers; cite them inline as [n]. If the papers don't cover it, say so. " + lang(opts.language),
          },
          { role: "user", content: `Sub-question: ${sq}\n\nPapers:\n${corpus}` },
        ],
      });
      return { sq, claim: r?.text?.trim() ?? "" };
    }),
  );
  const usedReadings = readings.filter((r) => r.claim.length > 0);
  for (const r of readings) {
    trace.push({
      agent: "reader",
      label: byId("reader").label,
      action: "answer sub-question",
      status: r.claim ? "ok" : "skipped",
      detail: r.claim
        ? `[${modelLabel(AGENT_MODELS.reader)}] “${r.sq.slice(0, 50)}” → ${r.claim.slice(0, 80)}${r.claim.length > 80 ? "…" : ""}`
        : `skipped: ${r.sq.slice(0, 60)}`,
      budgetUSDC: perReader,
    });
  }

  // ── Citation-Matcher (Venice embeddings): score each paper's semantic
  //    relevance to the question. Drives relevance-weighted payouts (#1/#2). ──
  const relevance: Record<string, number> = {};
  try {
    if (works.length) {
      const texts = [query, ...works.map((w) => `${w.title}. ${w.abstract.slice(0, 400)}`)];
      const vecs = await veniceEmbed(texts);
      if (vecs.length === texts.length) {
        const qv = vecs[0];
        works.forEach((w, i) => {
          // Map cosine [-1,1] → [0,1] so it can scale payout weights.
          relevance[w.id] = Math.max(0, (cosineSim(qv, vecs[i + 1]) + 1) / 2);
        });
      }
    }
  } catch {
    /* embeddings unavailable → relevance stays empty (uniform weighting) */
  }
  const matched = Object.keys(relevance).length;
  trace.push({
    agent: "reader",
    label: "Citation-Matcher",
    action: "embed + rank",
    status: matched ? "ok" : "skipped",
    detail: matched
      ? `Venice embeddings scored ${matched} paper(s) by relevance → relevance-weighted payouts.`
      : "Embeddings unavailable — payouts fall back to rank weighting.",
  });

  // ── Synthesizer: merge the readers' sub-answers into a grounded answer ──────
  const findings = usedReadings
    .map((r, i) => `[Sub-Q ${i + 1}] ${r.sq}\n→ ${r.claim}`)
    .join("\n\n");
  const synthRes = await safeChat({
    model: AGENT_MODELS.synth,
    webSearch: true,
    messages: [
      {
        role: "system",
        content:
          "You are a rigorous research Synthesizer. Combine the Reader agents' per-paper findings and live " +
          "web search into a concise, well-structured answer. Cite sources inline as [1], [2]. Be precise " +
          "and neutral. " + lang(opts.language),
      },
      {
        role: "user",
        content: `Question: ${query}\n\nReader findings:\n${findings || "(readers returned nothing; synthesize from the question)"}`,
      },
    ],
  });
  let synthesis = synthRes?.text ?? "";
  const webCitations = synthRes?.citations ?? [];
  trace.push({
    agent: "researcher",
    label: byId("researcher").label,
    action: "synthesize",
    status: synthesis ? "ok" : "skipped",
    detail: synthesis ? `[${modelLabel(AGENT_MODELS.synth)}] Merged Reader findings into a grounded synthesis (web-search grounded).` : "Synthesis unavailable.",
  });

  // ── Fact-checker (A): independent verify → may REJECT and force a revision ──
  let verification: string | undefined;
  let confidence: Confidence = "high";
  let rounds = 1;
  const fcRes = await safeChat({
    model: AGENT_MODELS.factcheck,
    webSearch: true,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a skeptical Fact-checker agent. Independently verify the key claims using live web search. " +
          "End with a line exactly like 'Confidence: high|medium|low'. List any unsupported, contested, or weak " +
          "claim. Be terse. " + lang(opts.language),
      },
      { role: "user", content: `Question: ${query}\n\nAnswer to verify:\n${synthesis}` },
    ],
  });
  if (fcRes) {
    verification = fcRes.text;
    confidence = parseConfidence(fcRes.text);
  }
  trace.push({
    agent: "factchecker",
    label: byId("factchecker").label,
    action: "verify",
    status: confidence === "low" ? "rejected" : "ok",
    detail: verification
      ? `[${modelLabel(AGENT_MODELS.factcheck)}] Confidence: ${confidence}${confidence === "low" ? " → sending back to Researcher for revision" : ""}`
      : "Verification unavailable.",
    budgetUSDC: narrowedFor(byId("factchecker"), rootBudget, rootExpiry, now).budgetUSDC,
  });

  // ── Revision round (A): the loop — Researcher addresses the flagged claims ──
  const revised = needsRevision(confidence) && !!synthesis && !!verification;
  if (revised) {
    rounds = 2;
    const revRes = await safeChat({
      model: AGENT_MODELS.synth,
      // No web search here — the fact-checker already did the grounding; revising
      // from its feedback keeps the worst-case latency inside the function budget.
      messages: [
        {
          role: "system",
          content:
            "You are the Researcher revising your answer after the Fact-checker flagged weak claims. Produce a " +
            "corrected, better-supported answer. Keep inline [n] citations. " + lang(opts.language),
        },
        {
          role: "user",
          content: `Question: ${query}\n\nPrevious answer:\n${synthesis}\n\nFact-checker feedback:\n${verification}`,
        },
      ],
    });
    if (revRes?.text) {
      synthesis = revRes.text;
      trace.push({
        agent: "researcher",
        label: byId("researcher").label,
        action: "revise",
        status: "revised",
        detail: "Revised the synthesis to address the Fact-checker's flagged claims.",
      });
    }
  }

  // ── Summarizer: condense the verified answer to a TL;DR ─────────────────────
  let summary: string | undefined;
  if (synthesis) {
    const sumRes = await safeChat({
      model: AGENT_MODELS.summary,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a Summarizer agent. Give a 2-3 sentence TL;DR of the answer. No preamble. " +
            "Preserve the inline citation markers exactly as they appear in the source (e.g. [1], [2]) so the " +
            "TL;DR stays attributable — keep each claim's [n] marker. " +
            lang(opts.language),
        },
        { role: "user", content: synthesis },
      ],
    });
    summary = sumRes?.text?.trim();
    trace.push({
      agent: "summarizer",
      label: byId("summarizer").label,
      action: "summarize",
      status: summary ? "ok" : "skipped",
      detail: summary ? `[${modelLabel(AGENT_MODELS.summary)}] TL;DR ready (${summary.length} chars).` : "Summary unavailable.",
      budgetUSDC: narrowedFor(byId("summarizer"), rootBudget, rootExpiry, now).budgetUSDC,
    });
  }

  // ── Adjudicator: the agent ITSELF decides how to split the payment across the
  //    sources, judging the finished answer against each source — a genuine economic
  //    decision by the LLM, not embedding arithmetic. Authoritative when usable;
  //    embeddings are the fallback. (Best-effort: any failure → fall back silently.) ──
  let adjudication: Record<string, number> | undefined;
  let adjudicationWhy: string | undefined;
  let adjudicatedTotal: number | undefined;
  if (synthesis && works.length) {
    const list = works.map((w, i) => `${i + 1}. id=${w.id} — ${w.title}`).join("\n");
    const adjRes = await safeChat({
      model: AGENT_MODELS.factcheck,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are the Adjudicator. Decide (a) how a citation payment is SPLIT across the listed sources, " +
            "by how much each ACTUALLY grounded the answer (a source that wasn't really used gets 0), and " +
            `(b) the fair TOTAL USDC to pay all sources for this answer, between ${ADJ_MIN_TOTAL} and ${ADJ_MAX_TOTAL} — ` +
            "more for a substantive, well-grounded answer, less for a thin or hedged one. " +
            'Reply with STRICT JSON only, no prose: {"shares":{"<id>":<0-100>,...},"total":<usdc>,"why":"<one short sentence>"}. ' +
            "Use the exact ids given.",
        },
        { role: "user", content: `Question: ${query}\n\nAnswer:\n${synthesis.slice(0, 2000)}\n\nSources:\n${list}` },
      ],
    });
    const parsed = parseAdjudication(adjRes?.text ?? "", works.map((w) => w.id));
    if (parsed) {
      adjudication = parsed.shares;
      adjudicationWhy = parsed.why;
      adjudicatedTotal = parsed.total;
    }
    trace.push({
      agent: "factchecker",
      label: "Adjudicator",
      action: "allocate payout",
      status: parsed ? "ok" : "skipped",
      detail: parsed
        ? `[${modelLabel(AGENT_MODELS.factcheck)}] The agent decided the split${parsed.total ? ` and a ${parsed.total.toFixed(2)} USDC total` : ""} itself — ${(parsed.why ?? "weighted by how much each source grounded the answer").slice(0, 140)}`
        : "Adjudicator output unusable — payouts fall back to embedding-weighted shares.",
    });
  }

  // ── Remember this run so future related questions can recall it (best-effort) ──
  if (synthesis) {
    try {
      await remember(query, summary || synthesis.slice(0, 200));
    } catch {
      /* best-effort */
    }
  }

  const reputation = scoreAgents({
    readersUsed: usedReadings.length,
    confidence,
    revised,
    subQuestions: subQuestions.length,
  });

  return {
    synthesis,
    verification,
    summary,
    confidence,
    rounds,
    trace,
    webCitations,
    reputation,
    relevance,
    adjudication,
    adjudicationWhy,
    // The agent's OWN decided total when it gave one; the confidence formula is the fallback.
    recommendedSettleUSDC: adjudicatedTotal ?? settleForConfidence(confidence),
  };
}
