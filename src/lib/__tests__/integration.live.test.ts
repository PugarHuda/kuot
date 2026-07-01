import { describe, it, expect } from "vitest";
import { rateLimit } from "../ratelimit";

/**
 * Integration + load tests.
 *
 * - The burst/load test runs offline (deterministic algorithm check).
 * - The live suite hits the DEPLOYED API and is opt-in via LIVE_API=1, so the
 *   default `npm test` stays fast and offline. It's real end-to-end: real Venice,
 *   real corpus (OpenAlex→Crossref fallback), real on-chain reads. No mocks.
 *   Run: `LIVE_API=1 npx vitest run integration.live`
 */
const BASE = process.env.E2E_BASE_URL ?? "https://kuot-azure.vercel.app";

type Payout = { weightBps: number; author: string };
type Research = {
  works: unknown[];
  payouts: Payout[];
  grounding?: { digest: string };
  venice: string;
  recommendedSettleUSDC?: number;
  adjudicationWhy?: string;
};

describe("rateLimit under a burst (load)", () => {
  it("passes exactly `limit` of a 100-request burst, blocks the rest", () => {
    const key = `burst:${Math.random()}`;
    let ok = 0;
    for (let i = 0; i < 100; i++) if (rateLimit(key, 8, 60_000).ok) ok++;
    expect(ok).toBe(8);
  });
});

describe.skipIf(!process.env.LIVE_API)("live API integration", () => {
  it("full research pipeline: works, payouts sum to 10000 bps, grounding digest, settle amount", async () => {
    const res = await fetch(`${BASE}/api/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "carbon capture materials", papers: 4 }),
    });
    expect(res.ok, `research HTTP ${res.status}`).toBe(true);
    const r = (await res.json()) as Research;
    expect(r.works.length).toBeGreaterThan(0);
    const sum = r.payouts.reduce((s, p) => s + p.weightBps, 0);
    expect(sum).toBe(10_000);
    for (const p of r.payouts) expect(p.author).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(r.grounding?.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(["live", "fallback"]).toContain(r.venice);
    if (r.venice === "live") expect(r.recommendedSettleUSDC).toBeGreaterThan(0); // the agent decided a total
  }, 220_000);

  it("settle read-back: /api/stats returns consistent on-chain numbers", async () => {
    const s = (await (await fetch(`${BASE}/api/stats`)).json()) as {
      attributedUSDC: number;
      escrowedUSDC: number;
      escrowedAuthors: number;
      ledger: string;
    };
    expect(typeof s.attributedUSDC).toBe("number");
    expect(s.escrowedAuthors).toBeGreaterThan(0);
    expect(s.attributedUSDC).toBeGreaterThan(0);
    expect(s.ledger).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(s.escrowedUSDC).toBeLessThanOrEqual(s.attributedUSDC + 1); // escrow ⊆ attributed
  }, 60_000);

  it("rate-limit robustness: a 12-request burst to /api/share never 5xx-crashes", async () => {
    const body = JSON.stringify({
      result: { query: `burst-${Math.random()}`, synthesis: "x", works: [], payouts: [], webCitations: [], venice: "fallback", x402: { paid: false } },
    });
    const codes = await Promise.all(
      Array.from({ length: 12 }, () =>
        fetch(`${BASE}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.status),
      ),
    );
    // Under burst, every response is a handled status (200 ok / 429 throttled /
    // 501 no-store) — never a 5xx crash.
    expect(codes.every((c) => c < 500), `codes: ${codes.join(",")}`).toBe(true);
  }, 60_000);
});
