import { NextRequest, NextResponse } from "next/server";
import { ORCID_COOKIE_NAME, isDemoVerifyAllowed, isOrcidOauthEnabled, verifyCookie } from "@/lib/orcid-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const demoVerifyAvailable = isDemoVerifyAllowed();
  const enabled = isOrcidOauthEnabled();
  // Read the verified cookie whether identity came via OAuth or demo-verify.
  let cookie = null;
  try {
    cookie = verifyCookie(req.cookies.get(ORCID_COOKIE_NAME)?.value);
  } catch {
    cookie = null; // ORCID_COOKIE_SECRET not configured
  }
  return NextResponse.json({
    enabled,
    demoVerifyAvailable,
    verifiedOrcid: cookie?.orcid ?? null,
    verifiedViaDemo: cookie?.demo ?? false,
  });
}
