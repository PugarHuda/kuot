import { describe, it, expect } from "vitest";
import { selfPriceForSynthesis, recursiveBpsFor, dynamicPaperBid, groundingDepth } from "../pricing";

const g = (groundedCount: number, droppedCount: number) => ({ digest: "0x0" as `0x${string}`, groundedCount, droppedCount });

describe("self-pricing", () => {
  it("groundingDepth is grounded / (grounded + dropped)", () => {
    expect(groundingDepth({ grounding: g(8, 0) })).toBe(1);
    expect(groundingDepth({ grounding: g(3, 1) })).toBe(0.75);
    expect(groundingDepth({ grounding: g(0, 0) })).toBe(0);
    expect(groundingDepth({ grounding: undefined })).toBe(0);
  });

  it("prices a high-confidence, fully-grounded answer above a low-confidence shallow one", () => {
    const strong = selfPriceForSynthesis({ confidence: "high", grounding: g(8, 0) });
    const weak = selfPriceForSynthesis({ confidence: "low", grounding: g(1, 4) });
    expect(strong.priceUsdc6).toBeGreaterThan(weak.priceUsdc6);
  });

  it("clamps price within the [floor, ceil] band", () => {
    const strong = selfPriceForSynthesis({ confidence: "high", grounding: g(10, 0) });
    const weak = selfPriceForSynthesis({ confidence: "low", grounding: g(0, 10) });
    expect(strong.priceUsdc6).toBeLessThanOrEqual(1_000n);
    expect(weak.priceUsdc6).toBeGreaterThanOrEqual(50n);
  });

  it("recursive share grows with grounding depth + confidence, bounded 50%-70%", () => {
    const deep = recursiveBpsFor({ confidence: "high", grounding: g(8, 0) });
    const shallow = recursiveBpsFor({ confidence: "low", grounding: g(1, 7) });
    expect(deep).toBe(7000);
    expect(shallow).toBeGreaterThanOrEqual(5000);
    expect(deep).toBeGreaterThan(shallow);
  });

  it("priceDollars matches the atomic price", () => {
    const p = selfPriceForSynthesis({ confidence: "medium", grounding: g(4, 0) });
    expect(p.priceDollars).toBe(`$${(Number(p.priceUsdc6) / 1e6).toFixed(6)}`);
  });
});

describe("dynamic paper bid", () => {
  it("bids more for the top-ranked paper than a lower-ranked one", () => {
    const top = dynamicPaperBid({ rank: 0, relevance: 1, remainingBudget6: 1_000_000n });
    const low = dynamicPaperBid({ rank: 4, relevance: 1, remainingBudget6: 1_000_000n });
    expect(top).toBeGreaterThan(low);
  });

  it("never bids more than the remaining budget", () => {
    const bid = dynamicPaperBid({ rank: 0, relevance: 1, remainingBudget6: 200n });
    expect(bid).toBeLessThanOrEqual(200n);
  });

  it("bids 0 when the budget is 0 (caller must skip the purchase, never pay 0)", () => {
    expect(dynamicPaperBid({ rank: 0, relevance: 1, remainingBudget6: 0n })).toBe(0n);
  });

  it("a strong relevance match bids above a weak one", () => {
    const strong = dynamicPaperBid({ rank: 0, relevance: 1, remainingBudget6: 1_000_000n });
    const weak = dynamicPaperBid({ rank: 0, relevance: 0, remainingBudget6: 1_000_000n });
    expect(strong).toBeGreaterThan(weak);
  });

  it("always bids at least 1 atomic unit when budget allows", () => {
    const bid = dynamicPaperBid({ rank: 9, relevance: 0, remainingBudget6: 1_000_000n });
    expect(bid).toBeGreaterThanOrEqual(1n);
  });
});
