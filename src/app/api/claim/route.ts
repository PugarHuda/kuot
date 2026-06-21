import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { operatorBind } from "@/lib/registry";
import { ORCID_COOKIE_NAME, verifyCookie } from "@/lib/orcid-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/claim  { wallet, signature }
 * Requires a verified ORCID cookie (set by the OAuth callback or demo-verify).
 * The author proved ORCID ownership (OAuth) AND wallet control (signature over
 * keccak256(orcid, wallet)); we relay the on-chain binding orcid→wallet.
 */
type Body = { wallet?: string; signature?: `0x${string}` };

export async function POST(req: NextRequest) {
  const cookie = verifyCookie(req.cookies.get(ORCID_COOKIE_NAME)?.value);
  if (!cookie?.orcid) {
    return NextResponse.json({ error: "verify your ORCID first" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.wallet || !body.signature) {
    return NextResponse.json({ error: "wallet and signature required" }, { status: 400 });
  }
  if (!isAddress(body.wallet)) {
    return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
  }

  try {
    const txHash = await operatorBind({
      authorId: cookie.orcid, // the OAuth-proven ORCID is the identity
      wallet: getAddress(body.wallet),
      signature: body.signature,
    });
    return NextResponse.json({
      ok: true,
      txHash,
      orcid: cookie.orcid,
      demo: cookie.demo ?? false,
      wallet: getAddress(body.wallet),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: message.includes("signature") ? 400 : 502 });
  }
}
