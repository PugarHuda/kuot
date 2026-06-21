import { NextRequest, NextResponse } from "next/server";
import {
  ORCID_COOKIE_NAME,
  buildCookiePayload,
  exchangeCodeForOrcid,
  isOrcidOauthEnabled,
  signCookie,
} from "@/lib/orcid-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isOrcidOauthEnabled()) return NextResponse.redirect(new URL("/claim?err=oauth_disabled", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("kuot_orcid_state")?.value;
  const storedReturn = req.cookies.get("kuot_orcid_return")?.value;
  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/claim?err=oauth_state", req.url));
  }

  let returnTo = "/claim";
  let expected: string | null = null;
  try {
    if (storedReturn) {
      const p = JSON.parse(storedReturn);
      returnTo = p.returnTo ?? "/claim";
      expected = p.expected || null;
    }
  } catch {
    /* ignore */
  }

  try {
    const token = await exchangeCodeForOrcid(code);
    if (expected && expected.toUpperCase() !== token.orcid.toUpperCase()) {
      const url = new URL(returnTo, req.url);
      url.searchParams.set("err", "oauth_orcid_mismatch");
      url.searchParams.set("got", token.orcid);
      const r = NextResponse.redirect(url);
      r.cookies.delete("kuot_orcid_state");
      r.cookies.delete("kuot_orcid_return");
      return r;
    }
    const signed = signCookie(buildCookiePayload(token.orcid));
    const target = new URL(returnTo, req.url);
    target.searchParams.set("verified", token.orcid);
    const res = NextResponse.redirect(target);
    res.cookies.set(ORCID_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30,
    });
    res.cookies.delete("kuot_orcid_state");
    res.cookies.delete("kuot_orcid_return");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/claim?err=oauth_exchange", req.url));
  }
}
