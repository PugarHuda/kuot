/**
 * ORCID OAuth2 — Kuot
 *
 * Proves the user OWNS an ORCID (not just knows the number):
 *   /api/auth/orcid/authorize → orcid.org/oauth/authorize → callback → signed cookie.
 * The /authenticate scope is the minimum (identity only; no read/write).
 * A demo-verify path lets judges bind a test ORCID without the OAuth dance —
 * wallet signature + on-chain bind still happen for real.
 */
import crypto from "node:crypto";

export const ORCID_COOKIE_NAME = "kuot_orcid_verified";
const COOKIE_TTL_SECONDS = 60 * 30;

function base() {
  // Use https://sandbox.orcid.org for testing ORCID apps.
  return process.env.ORCID_OAUTH_BASE ?? "https://orcid.org";
}

export function redirectUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${site.replace(/\/$/, "")}/api/auth/orcid/callback`;
}

export function isOrcidOauthEnabled(): boolean {
  return Boolean(process.env.ORCID_CLIENT_ID && process.env.ORCID_CLIENT_SECRET);
}

export function isDemoVerifyAllowed(): boolean {
  return process.env.KUOT_ALLOW_DEMO_VERIFY === "1";
}

export function orcidAuthorizeUrl(state: string): string {
  const clientId = process.env.ORCID_CLIENT_ID;
  if (!clientId) throw new Error("ORCID_CLIENT_ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "/authenticate",
    redirect_uri: redirectUrl(),
    state,
  });
  return `${base()}/oauth/authorize?${params.toString()}`;
}

export interface OrcidTokenResponse {
  access_token: string;
  token_type: string;
  name?: string;
  orcid: string;
}

export async function exchangeCodeForOrcid(code: string): Promise<OrcidTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.ORCID_CLIENT_ID ?? "",
    client_secret: process.env.ORCID_CLIENT_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUrl(),
  });
  const res = await fetch(`${base()}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`ORCID token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as OrcidTokenResponse;
}

// ── signed cookie ──────────────────────────────────────────────────────────
function secret(): string {
  const s = process.env.ORCID_COOKIE_SECRET;
  if (!s || s.length < 16) throw new Error("ORCID_COOKIE_SECRET must be set (min 16 chars)");
  return s;
}

export interface OrcidCookiePayload {
  orcid: string;
  exp: number;
  demo?: boolean;
}

export function buildCookiePayload(orcid: string): OrcidCookiePayload {
  return { orcid, exp: Math.floor(Date.now() / 1000) + COOKIE_TTL_SECONDS };
}

export function signCookie(payload: OrcidCookiePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCookie(value: string | undefined): OrcidCookiePayload | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as OrcidCookiePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
