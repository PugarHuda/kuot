import { describe, it, expect } from "vitest";
import {
  parseConfidence,
  needsRevision,
  buildRedelegations,
  scoreAgents,
  parseSubQuestions,
  MAX_SUBQUESTIONS,
  cosineSim,
  readerCountForBudget,
  settleForConfidence,
} from "../orchestrator";

describe("parseConfidence", () => {
  it("reads an explicit confidence line", () => {
    expect(parseConfidence("All good.\nConfidence: high")).toBe("high");
    expect(parseConfidence("Confidence: medium")).toBe("medium");
    expect(parseConfidence("confidence:  low")).toBe("low");
  });
  it("infers low from refuting language", () => {
    expect(parseConfidence("This claim is unsupported and contested.")).toBe("low");
    expect(parseConfidence("No evidence was found for the main result.")).toBe("low");
  });
  it("infers medium from hedging language", () => {
    expect(parseConfidence("The result is partially supported but uncertain.")).toBe("medium");
  });
  it("defaults to high when nothing is flagged", () => {
    expect(parseConfidence("The answer is well-supported by the sources.")).toBe("high");
  });
});

describe("needsRevision", () => {
  it("only low confidence forces a revision round", () => {
    expect(needsRevision("low")).toBe(true);
    expect(needsRevision("medium")).toBe(false);
    expect(needsRevision("high")).toBe(false);
  });
});

describe("buildRedelegations", () => {
  const now = 1_000_000;
  const hops = buildRedelegations(10, now + 86_400, now);

  it("creates one narrowed hop per depth-2 specialist", () => {
    expect(hops.map((h) => h.agent).sort()).toEqual(["factchecker", "reader", "summarizer"]);
  });
  it("every hop redelegates FROM the researcher", () => {
    expect(hops.every((h) => h.redelegation?.from === "researcher")).toBe(true);
  });
  it("authority only narrows — each sub-budget is < the root budget", () => {
    expect(hops.every((h) => (h.budgetUSDC ?? Infinity) < 10)).toBe(true);
  });
  it("expiry never exceeds the root window (24h)", () => {
    expect(hops.every((h) => (h.expiryHours ?? 99) <= 24)).toBe(true);
  });
});

describe("cosineSim", () => {
  it("is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 for a zero vector (degenerate)", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("readerCountForBudget", () => {
  it("scales with budget, clamped to [2,5]", () => {
    expect(readerCountForBudget(0)).toBe(2);
    expect(readerCountForBudget(4)).toBe(2);
    expect(readerCountForBudget(12)).toBe(3);
    expect(readerCountForBudget(100)).toBe(5);
  });
});

describe("settleForConfidence", () => {
  it("pays more when the research is more confident", () => {
    expect(settleForConfidence("high")).toBeGreaterThan(settleForConfidence("medium"));
    expect(settleForConfidence("medium")).toBeGreaterThan(settleForConfidence("low"));
  });
});

describe("parseSubQuestions", () => {
  it("strips numbering and bullets", () => {
    const qs = parseSubQuestions("1. What is X?\n2) How does Y work?\n- And Z?", "fallback");
    expect(qs).toEqual(["What is X?", "How does Y work?", "And Z?"]);
  });
  it("caps at MAX_SUBQUESTIONS", () => {
    const qs = parseSubQuestions("a?\nb?\nc?\nd?\ne?", "fallback");
    expect(qs.length).toBe(MAX_SUBQUESTIONS);
  });
  it("dedupes and drops a 'Sub-questions:' header line", () => {
    const qs = parseSubQuestions("Sub-questions:\nWhat is X?\nWhat is X?", "fallback");
    expect(qs).toEqual(["What is X?"]);
  });
  it("falls back to the original query when empty", () => {
    expect(parseSubQuestions("   \n\n", "the original")).toEqual(["the original"]);
  });
});

describe("scoreAgents", () => {
  it("the planner earns only when it actually splits the question", () => {
    const split = scoreAgents({ readersUsed: 2, confidence: "high", revised: false, subQuestions: 3 });
    const single = scoreAgents({ readersUsed: 1, confidence: "high", revised: false, subQuestions: 1 });
    expect(split.find((x) => x.agent === "planner")?.delta).toBe(1);
    expect(single.find((x) => x.agent === "planner")).toBeUndefined();
  });
  it("the fact-checker earns more when it forces a revision", () => {
    const noRev = scoreAgents({ readersUsed: 2, confidence: "high", revised: false });
    const rev = scoreAgents({ readersUsed: 2, confidence: "low", revised: true });
    const fc = (xs: ReturnType<typeof scoreAgents>) => xs.find((x) => x.agent === "factchecker")!.delta;
    expect(fc(rev)).toBeGreaterThan(fc(noRev));
  });
  it("a reader that read nothing earns nothing", () => {
    const s = scoreAgents({ readersUsed: 0, confidence: "high", revised: false });
    expect(s.find((x) => x.agent === "reader")).toBeUndefined();
  });
  it("the summarizer is not rewarded on a low-confidence run", () => {
    const s = scoreAgents({ readersUsed: 1, confidence: "low", revised: true });
    expect(s.find((x) => x.agent === "summarizer")).toBeUndefined();
  });
  it("the researcher always earns for orchestrating", () => {
    const s = scoreAgents({ readersUsed: 0, confidence: "high", revised: false });
    expect(s.find((x) => x.agent === "researcher")?.delta).toBe(1);
  });
});
