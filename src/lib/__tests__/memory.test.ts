import { describe, it, expect } from "vitest";
import { keywordsOf, relatedness, rankRelated, type Memory } from "../memory";

describe("keywordsOf", () => {
  it("extracts significant words, drops stopwords + punctuation", () => {
    const kw = keywordsOf("What are the most effective carbon capture methods?");
    expect(kw).toContain("carbon");
    expect(kw).toContain("capture");
    expect(kw).not.toContain("the");
    expect(kw).not.toContain("most");
  });
  it("dedupes and lowercases", () => {
    expect(keywordsOf("Battery battery BATTERY health")).toEqual(["battery", "health"]);
  });
});

describe("relatedness", () => {
  it("is 1 for identical keyword sets, 0 for disjoint", () => {
    expect(relatedness(["a", "b"], ["a", "b"])).toBe(1);
    expect(relatedness(["a"], ["b"])).toBe(0);
  });
  it("is a Jaccard ratio for partial overlap", () => {
    expect(relatedness(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
  });
});

describe("rankRelated", () => {
  const m = (query: string): Memory => ({ query, takeaway: "", at: 0, keywords: keywordsOf(query) });
  const mems = [
    m("perovskite solar cell stability"),
    m("lithium battery recycling"),
    m("carbon capture cost comparison"),
  ];
  it("surfaces topically related prior runs above threshold", () => {
    const r = rankRelated("how to improve perovskite solar cell efficiency", mems);
    expect(r[0].query).toBe("perovskite solar cell stability");
  });
  it("returns nothing for an unrelated query", () => {
    expect(rankRelated("quantum entanglement teleportation", mems)).toEqual([]);
  });
  it("excludes the exact same query", () => {
    expect(rankRelated("lithium battery recycling", mems).find((x) => x.query === "lithium battery recycling")).toBeUndefined();
  });
});
