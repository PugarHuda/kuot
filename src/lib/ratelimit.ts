/**
 * Best-effort in-memory rate limiter — Kuot
 *
 * The free `/api/research` tier runs real (paid) Venice inference, so it needs a
 * brake against scripted abuse that would burn credits. Serverless instances are
 * reused across a burst, so a per-instance sliding window throttles a hammering
 * client without external infra. It resets on cold start — acceptable for
 * cost-protection (not a security boundary; money-moving paths are token-gated).
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Allow `limit` hits per `windowMs` for `key`. Returns ok + seconds until reset. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  // Opportunistic prune so the map can't grow unbounded on a long-lived instance.
  if (buckets.size > 2000) for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - 1 };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000), remaining: 0 };
  b.count++;
  return { ok: true, retryAfter: 0, remaining: limit - b.count };
}

/** Best-effort client IP from the proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
