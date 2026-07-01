import { NextResponse } from "next/server";
import { putShared, getShared, isShareConfigured, shareIdForQuery } from "@/lib/store";
import { queryIdOf } from "@/lib/settlement";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import type { ResearchResult } from "@/lib/agent";

export const runtime = "nodejs";

type SharedPayload = { result: ResearchResult; savedAt: number; queryId: string };

const cap = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Build a bounded, shareable copy of a result. Caps long text and trims arrays so
 * the stored blob stays small (cheap on-chain, fast over KV) while keeping
 * everything the public /r page renders.
 */
function slimForShare(r: ResearchResult): ResearchResult {
  return {
    ...r,
    synthesis: cap(r.synthesis, 1800) ?? "",
    summary: cap(r.summary, 320),
    verification: cap(r.verification, 500),
    // Keep a trimmed works list (title + url, no abstract/authors) so the
    // synthesis [n] citations stay clickable on the public page. Small blob.
    works: (r.works ?? []).slice(0, 8).map((w) => ({
      id: w.id,
      title: cap(w.title, 140) ?? "",
      url: w.url,
      abstract: "",
      authors: [],
      rank: w.rank,
      year: w.year,
    })),
    webCitations: (r.webCitations ?? []).slice(0, 3).map((c) => ({ title: cap(c.title, 100), url: c.url })),
    // Keep REAL author + identity (already public on-chain via AuthorPaid) so the
    // reverse-x402 recursive split can actually pay the original authors.
    payouts: (r.payouts ?? []).slice(0, 8).map((p) => ({
      author: p.author,
      authorName: p.authorName,
      workTitle: cap(p.workTitle, 90) ?? "",
      url: p.url,
      weightBps: p.weightBps,
      identity: p.identity,
      claimed: p.claimed,
    })),
    // Drop the heavy fields entirely to fit the on-chain blob (not rendered on /r).
    agentTrace: undefined,
    reputation: undefined,
    relevance: undefined,
  };
}

/**
 * POST /api/share { result }  → persist a finished result, return its permalink id.
 * The id derives from the on-chain queryId, so the share link and the attestation
 * line up.
 */
export async function POST(req: Request) {
  // Without KV, each share persists via an on-chain ShareRegistry tx on the
  // operator's gas — throttle hard so a public caller can't drain gas or spam
  // last-writer-wins overwrites of /r/<id> permalinks. (6/min/IP.)
  const rl = rateLimit(`share:${clientIp(req)}`, 6, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit — too many shares; retry shortly" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  if (!isShareConfigured()) {
    return NextResponse.json(
      { error: "sharing not configured — set KV_REST_API_URL / KV_REST_API_TOKEN (see SHARE-SETUP.md)" },
      { status: 501 },
    );
  }
  let body: { result?: ResearchResult };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const result = body.result;
  if (!result || typeof result.query !== "string" || !result.query.trim()) {
    return NextResponse.json({ error: "result.query required" }, { status: 400 });
  }
  const id = shareIdForQuery(result.query);
  // savedAt is 0 (not Date.now()) so concurrent shares of the SAME query produce
  // BYTE-IDENTICAL content — that makes the on-chain write idempotent under a burst
  // (no nonce collisions / 502s). The precise save time isn't essential for a
  // public permalink; the run's own history keeps a local timestamp.
  const payload: SharedPayload = { result: slimForShare(result), savedAt: 0, queryId: queryIdOf(result.query) };
  try {
    await putShared(id, payload);
    return NextResponse.json({ id, path: `/r/${id}` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

/** GET /api/share?id=… → the stored result (used by the /r/[id] page). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!isShareConfigured()) return NextResponse.json({ error: "sharing not configured" }, { status: 501 });
  try {
    const data = await getShared<SharedPayload>(id);
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
