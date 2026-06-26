/**
 * Operator-token gate for money-moving / operator-signing endpoints — Kuot.
 *
 * FAIL CLOSED: if DEV_PAY_TOKEN is unset, every gated endpoint denies. A missing
 * secret must never mean "open" (that inverts to a fund-drain). Compares in
 * constant time to avoid a token-length/equality side channel.
 */
import crypto from "node:crypto";

export function devTokenOk(req: Request): boolean {
  const token = process.env.DEV_PAY_TOKEN;
  if (!token) return false; // no secret configured → deny (never fail open)
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-dev-token") ??
    req.headers.get("x-settle-token") ??
    url.searchParams.get("token") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
