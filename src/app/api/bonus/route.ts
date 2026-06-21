import { NextResponse } from "next/server";
import { bonusFor } from "@/lib/yield";

export const runtime = "nodejs";

/** GET /api/bonus?identity=orcid:... → citation-loyalty yield state (on-chain). */
export async function GET(req: Request) {
  const identity = new URL(req.url).searchParams.get("identity");
  if (!identity) return NextResponse.json({ error: "identity required" }, { status: 400 });
  try {
    const info = await bonusFor(identity);
    if (!info) return NextResponse.json({ identity, configured: false });
    return NextResponse.json({ identity, configured: true, ...info });
  } catch (e) {
    return NextResponse.json({ identity, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
