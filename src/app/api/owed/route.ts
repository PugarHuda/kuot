import { NextResponse } from "next/server";
import { owedFor } from "@/lib/escrow";

export const runtime = "nodejs";

/** GET /api/owed?identity=<ORCID|id> → { identity, owedUSDC6 } */
export async function GET(req: Request) {
  const identity = new URL(req.url).searchParams.get("identity");
  if (!identity) return NextResponse.json({ error: "identity required" }, { status: 400 });
  const owed = await owedFor(identity);
  return NextResponse.json({ identity, owedUSDC6: owed.toString() });
}
