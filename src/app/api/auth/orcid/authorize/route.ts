import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { isOrcidOauthEnabled, orcidAuthorizeUrl } from "@/lib/orcid-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isOrcidOauthEnabled()) {
    return NextResponse.json(
      { error: "ORCID OAuth not configured — set ORCID_CLIENT_ID and ORCID_CLIENT_SECRET" },
      { status: 503 },
    );
  }
  const expected = req.nextUrl.searchParams.get("orcid") ?? "";
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/claim";
  const state = crypto.randomBytes(16).toString("hex");

  const res = NextResponse.redirect(orcidAuthorizeUrl(state));
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("kuot_orcid_state", state, opts);
  res.cookies.set("kuot_orcid_return", JSON.stringify({ returnTo, expected }), opts);
  return res;
}
