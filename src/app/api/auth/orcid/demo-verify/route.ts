import { NextRequest, NextResponse } from "next/server";
import { ORCID_COOKIE_NAME, buildCookiePayload, isDemoVerifyAllowed, signCookie } from "@/lib/orcid-oauth";
import { lookupOrcid, isValidOrcidFormat, normalizeOrcid } from "@/lib/orcid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ORCID's official public test record — free to bind in demo.
const JOSIAH_TEST_ORCID = "0000-0002-1825-0097";

export async function GET(req: NextRequest) {
  if (!isDemoVerifyAllowed()) return NextResponse.redirect(new URL("/claim?err=demo_disabled", req.url));

  const orcid = normalizeOrcid(req.nextUrl.searchParams.get("orcid") ?? "");
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/claim";
  if (!isValidOrcidFormat(orcid)) return NextResponse.redirect(new URL("/claim?err=demo_bad_orcid", req.url));

  // Real researchers must use the real OAuth flow. The demo path allows the
  // ORCID test record, or any ORCID that doesn't resolve to a real person.
  if (orcid !== JOSIAH_TEST_ORCID) {
    try {
      const lookup = await lookupOrcid(orcid);
      if (lookup.real) {
        return NextResponse.redirect(
          new URL(`/claim?err=demo_real_orcid&orcid=${encodeURIComponent(orcid)}`, req.url),
        );
      }
    } catch {
      /* network failure — allow (allowlist already restrictive) */
    }
  }

  const signed = signCookie({ ...buildCookiePayload(orcid), demo: true });
  const target = new URL(returnTo, req.url);
  target.searchParams.set("verified", orcid);
  target.searchParams.set("demo", "1");
  const res = NextResponse.redirect(target);
  res.cookies.set(ORCID_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  return res;
}
