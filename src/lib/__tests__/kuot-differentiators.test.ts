import { describe, it, expect } from "vitest";
import { proveGrounding, synthesisDigest, identityHash } from "../grounding";
import { recursiveSplit } from "../recursive";
import type { CitationPayout } from "../agent";

const mk = (over: Partial<CitationPayout>): CitationPayout => ({
  author: "0x0000000000000000000000000000000000000001",
  authorName: "A",
  weightBps: 5000,
  workTitle: "W",
  url: "http://x",
  identity: "0000-0000-0000-0001",
  claimed: true,
  ...over,
});

describe("proveGrounding", () => {
  const payouts = [
    mk({ identity: "id-a", weightBps: 6000 }),
    mk({ identity: "id-b", weightBps: 3900 }),
    mk({ identity: "id-c", weightBps: 100 - 1 + 1 }), // 100 = at floor, kept
    mk({ identity: "id-tail", weightBps: 1 }), // below floor → dropped
  ];

  it("drops sub-floor citations and renormalizes grounded weights to 10000", () => {
    const p = proveGrounding({ query: "q", synthesis: "answer", payouts });
    const ids = p.grounded.map((g) => g.identity);
    expect(ids).toContain("id-a");
    expect(ids).not.toContain("id-tail"); // dropped: not grounding
    expect(p.dropped.map((d) => d.identity)).toContain("id-tail");
    expect(p.grounded.reduce((s, g) => s + g.weightBps, 0)).toBe(10_000);
  });

  it("commits a deterministic digest + matching grounded hashes", () => {
    const p = proveGrounding({ query: "q", synthesis: "answer", payouts });
    expect(p.digest).toBe(synthesisDigest("answer"));
    expect(p.groundedHashes).toContain(identityHash("id-a"));
  });

  it("keeps the top citation when everything is below the floor", () => {
    const tiny = [mk({ identity: "only", weightBps: 1 })];
    const p = proveGrounding({ query: "q", synthesis: "a", payouts: tiny });
    expect(p.grounded).toHaveLength(1);
    expect(p.grounded[0].weightBps).toBe(10_000);
  });
});

describe("recursiveSplit", () => {
  const grounded = [
    mk({ identity: "a", weightBps: 5000 }),
    mk({ identity: "b", weightBps: 3000 }),
    mk({ identity: "c", weightBps: 2000 }),
  ];

  it("flows the configured fraction back to authors, keeps the rest as margin", () => {
    const s = recursiveSplit(1_000_000n, grounded, 7000); // 1 USDC, 70% recursive
    expect(s.toAuthorsTotalAtomic).toBe(700_000n);
    expect(s.marginAtomic).toBe(300_000n);
    // author amounts are exact (last absorbs rounding) and sum to the author total
    const sum = s.toAuthors.reduce((acc, t) => acc + t.amountAtomic, 0n);
    expect(sum).toBe(700_000n);
    expect(s.toAuthors[0].amountAtomic).toBe(350_000n); // 50% of 700k
  });

  it("handles indivisible amounts without losing a unit", () => {
    const s = recursiveSplit(333_333n, grounded, 7000);
    const sum = s.toAuthors.reduce((acc, t) => acc + t.amountAtomic, 0n);
    expect(sum).toBe(s.toAuthorsTotalAtomic);
    expect(s.toAuthorsTotalAtomic + s.marginAtomic).toBe(333_333n);
  });
});
