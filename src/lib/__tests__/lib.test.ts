import { describe, it, expect } from "vitest";
import { weightCitations } from "../agent";
import { parseAdjudication } from "../orchestrator";
import { queryIdOf, encodeAttestAndSplit } from "../settlement";
import { shareIdForQuery } from "../store";
import { authorHash, bindingMessage, demoWallet } from "../registry";
import { encodePaymentHeader, decodePaymentHeader, require402, type PaymentPayload } from "../x402";
import { sanitizeQuery, fillerStrip, type Work } from "../corpus";

const work = (id: string, authors: { id: string; name: string }[]): Work => ({
  id,
  title: `Work ${id}`,
  url: "u",
  abstract: "a",
  rank: 0,
  authors: authors.map((a) => ({ ...a, wallet: demoWallet(a.id), claimed: false })),
});

describe("weightCitations", () => {
  it("weights sum to exactly 10000 bps", () => {
    const works = [
      work("1", [{ id: "a", name: "A" }, { id: "b", name: "B" }]),
      work("2", [{ id: "c", name: "C" }]),
    ];
    const p = weightCitations(works);
    expect(p.reduce((s, x) => s + x.weightBps, 0)).toBe(10_000);
  });
  it("higher-ranked work gets more weight", () => {
    const works = [work("1", [{ id: "a", name: "A" }]), work("2", [{ id: "b", name: "B" }])];
    const p = weightCitations(works);
    expect(p[0].weightBps).toBeGreaterThan(p[1].weightBps);
  });
  it("empty works → empty payouts", () => {
    expect(weightCitations([])).toEqual([]);
  });
  it("tolerates malformed works (missing/empty author fields) without throwing", () => {
    // Mirrors degraded OpenAlex data: author with empty id/name.
    const messy = [work("1", [{ id: "", name: "" }]), work("2", [{ id: "a", name: "A" }])];
    expect(() => weightCitations(messy)).not.toThrow();
    const p = weightCitations(messy);
    if (p.length) expect(p.reduce((s, x) => s + x.weightBps, 0)).toBe(10_000);
  });
  it("relevance boosts a lower-ranked but more relevant paper", () => {
    const works = [work("1", [{ id: "a", name: "A" }]), work("2", [{ id: "b", name: "B" }])];
    // Paper 2 is rank-lower but far more relevant per the Citation-Matcher.
    const p = weightCitations(works, { [works[0].id]: 0.1, [works[1].id]: 1.0 });
    const a = p.find((x) => x.authorName === "A")!.weightBps;
    const b = p.find((x) => x.authorName === "B")!.weightBps;
    expect(b).toBeGreaterThan(a);
    expect(p.reduce((s, x) => s + x.weightBps, 0)).toBe(10_000);
  });
  it("Adjudicator decision overrides rank: the agent's chosen source wins", () => {
    const works = [work("1", [{ id: "a", name: "A" }]), work("2", [{ id: "b", name: "B" }])];
    // Rank says work 1 wins, but the Adjudicator credited work 2 far more.
    const p = weightCitations(works, undefined, { "1": 10, "2": 90 });
    const a = p.find((x) => x.authorName === "A")!.weightBps;
    const b = p.find((x) => x.authorName === "B")!.weightBps;
    expect(b).toBeGreaterThan(a);
    expect(p.reduce((s, x) => s + x.weightBps, 0)).toBe(10_000);
  });
  it("Adjudicator share of 0 drops a source from payouts", () => {
    const works = [work("1", [{ id: "a", name: "A" }]), work("2", [{ id: "b", name: "B" }])];
    const p = weightCitations(works, undefined, { "1": 100, "2": 0 });
    expect(p.find((x) => x.authorName === "B")?.weightBps ?? 0).toBe(0);
    expect(p.find((x) => x.authorName === "A")!.weightBps).toBe(10_000);
  });
});

describe("parseAdjudication", () => {
  it("parses strict JSON shares and the why", () => {
    const r = parseAdjudication('{"shares":{"1":70,"2":30},"why":"work 1 grounded most"}', ["1", "2"]);
    expect(r).not.toBeNull();
    expect(r!.shares).toEqual({ "1": 70, "2": 30 });
    expect(r!.why).toBe("work 1 grounded most");
  });
  it("defaults omitted ids to 0 and only keeps known ids", () => {
    const r = parseAdjudication('{"shares":{"1":50,"x":99}}', ["1", "2"]);
    expect(r!.shares).toEqual({ "1": 50, "2": 0 });
  });
  it("tolerates prose around the JSON object", () => {
    const r = parseAdjudication('Here is my call:\n{"shares":{"1":100}}\nthanks', ["1"]);
    expect(r!.shares).toEqual({ "1": 100 });
  });
  it("returns null on garbage / no positive share so payouts fall back", () => {
    expect(parseAdjudication("not json", ["1"])).toBeNull();
    expect(parseAdjudication('{"shares":{"1":0,"2":0}}', ["1", "2"])).toBeNull();
    expect(parseAdjudication('{"nope":1}', ["1"])).toBeNull();
  });
});

describe("sanitizeQuery", () => {
  it("strips wildcard chars that break OpenAlex (? and *)", () => {
    expect(sanitizeQuery("What are the best carbon capture methods?")).toBe(
      "What are the best carbon capture methods",
    );
    expect(sanitizeQuery("deep* learning?")).toBe("deep learning");
  });
  it("collapses whitespace and trims", () => {
    expect(sanitizeQuery("  a   b  ")).toBe("a b");
  });
  it("falls back to the raw query if cleaning empties it", () => {
    expect(sanitizeQuery("???")).toBe("???");
  });
});

describe("fillerStrip", () => {
  it("strips Indonesian + English command/filler words, keeps the topic", () => {
    expect(fillerStrip("carikan informasi skripsi tentang automation tools")).toBe("automation tools");
    expect(fillerStrip("find papers about carbon capture")).toBe("carbon capture");
  });
  it("falls back to the raw query if everything is filler", () => {
    expect(fillerStrip("carikan informasi tentang")).toBe("carikan informasi tentang");
  });
});

describe("registry", () => {
  it("authorHash + bindingMessage are deterministic", () => {
    expect(authorHash("X")).toBe(authorHash("X"));
    const w = "0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E" as const;
    expect(bindingMessage("X", w)).toBe(bindingMessage("X", w));
  });
  it("demoWallet never returns the zero address", () => {
    for (const s of ["", "a", "https://openalex.org/A0", "0"]) {
      expect(demoWallet(s)).not.toBe("0x0000000000000000000000000000000000000000");
    }
  });
  it("demoWallet never throws on a missing/non-string seed (OpenAlex omits author.id)", () => {
    // Regression: 'seed is not iterable' crashed research when an author had no id.
    for (const bad of [undefined, null, 0]) {
      expect(() => demoWallet(bad as unknown as string)).not.toThrow();
      expect(demoWallet(bad as unknown as string)).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
  it("authorHash never throws on a missing/non-string id", () => {
    for (const bad of [undefined, null, 0]) {
      expect(() => authorHash(bad as unknown as string)).not.toThrow();
      expect(authorHash(bad as unknown as string)).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });
});

describe("settlement", () => {
  it("queryIdOf is a 32-byte hex and stable", () => {
    const id = queryIdOf("q");
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(queryIdOf("q")).toBe(id);
  });
  it("shareIdForQuery is deterministic and is the queryId's first 8 bytes", () => {
    const id = shareIdForQuery("carbon capture");
    expect(id).toBe(shareIdForQuery("carbon capture"));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(queryIdOf("carbon capture").startsWith(`0x${id}`)).toBe(true);
  });
  it("encodes attestAndSplit calldata", () => {
    const data = encodeAttestAndSplit({
      query: "q",
      amount: 1_000_000n,
      payouts: [
        { author: demoWallet("a"), authorName: "A", weightBps: 10_000, workTitle: "W", url: "u", identity: "a", claimed: false },
      ],
    });
    expect(data.startsWith("0x")).toBe(true);
    expect(data.length).toBeGreaterThan(10);
  });
});

describe("x402", () => {
  it("require402 yields exact-scheme erc7710 requirements", () => {
    const body = require402({
      amountUSDC6: 10_000n,
      asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      payTo: "0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E",
      resource: "/api/paper/1",
      description: "d",
      network: "sepolia",
      delegationManager: "0x0000000000000000000000000000000000000000",
    });
    expect(body.accepts[0].scheme).toBe("exact");
    expect(body.accepts[0].extra?.method).toBe("erc7710");
    expect(body.accepts[0].maxAmountRequired).toBe("10000");
  });
  it("payment header round-trips", () => {
    const p: PaymentPayload = {
      x402Version: 1,
      scheme: "exact",
      network: "sepolia",
      payload: {
        method: "erc7710",
        permissionContext: "0xabc",
        delegationManager: "0x0000000000000000000000000000000000000000",
        execution: { to: "0x0000000000000000000000000000000000000001", value: "0", data: "0x" },
      },
    };
    expect(decodePaymentHeader(encodePaymentHeader(p))).toEqual(p);
  });
});
