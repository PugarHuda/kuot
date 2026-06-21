import { NextResponse } from "next/server";
import { SUPPORTED_KINDS } from "@/lib/facilitator";

export const runtime = "nodejs";

/** GET /api/facilitator/supported → the x402 schemes/networks this facilitator settles. */
export function GET() {
  return NextResponse.json({ kinds: SUPPORTED_KINDS });
}
