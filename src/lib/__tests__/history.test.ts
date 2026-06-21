import { describe, it, expect, beforeEach } from "vitest";
import { loadHistory, saveToHistory, removeFromHistory, clearHistory } from "../history";
import type { ResearchResult } from "../agent";

// Minimal localStorage stub so the (browser-only) history lib is testable in node.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

const result = (query: string, venice: ResearchResult["venice"] = "live"): ResearchResult => ({
  query,
  synthesis: `answer to ${query}`,
  webCitations: [],
  works: [],
  payouts: [],
  venice,
  x402: { paid: false },
});

describe("research history", () => {
  it("saves and loads a run", () => {
    saveToHistory(result("carbon capture"), 1000);
    const h = loadHistory();
    expect(h).toHaveLength(1);
    expect(h[0].query).toBe("carbon capture");
    expect(h[0].result.synthesis).toBe("answer to carbon capture");
  });

  it("de-dupes by query (case-insensitive) and moves it to the top", () => {
    saveToHistory(result("Battery health"), 1000);
    saveToHistory(result("solar"), 2000);
    saveToHistory(result("battery HEALTH"), 3000); // same question, newer
    const h = loadHistory();
    expect(h).toHaveLength(2);
    expect(h[0].query).toBe("battery HEALTH");
  });

  it("orders most-recent-first", () => {
    saveToHistory(result("a"), 1000);
    saveToHistory(result("b"), 3000);
    saveToHistory(result("c"), 2000);
    expect(loadHistory().map((e) => e.query)).toEqual(["b", "c", "a"]);
  });

  it("removes one entry and clears all", () => {
    saveToHistory(result("a"), 1000);
    const after = saveToHistory(result("b"), 2000);
    const id = after.find((e) => e.query === "a")!.id;
    expect(removeFromHistory(id).map((e) => e.query)).toEqual(["b"]);
    expect(clearHistory()).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });

  it("ignores a result with an empty query", () => {
    saveToHistory(result("   "), 1000);
    expect(loadHistory()).toHaveLength(0);
  });
});
