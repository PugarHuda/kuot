import { NextResponse } from "next/server";
import { bumpReputations } from "@/lib/reputation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agents/feedback  { agents: string[] }
 * Bumps on-chain ERC-8004 reputation for the agents that contributed to a
 * settled research run. Called after settlement (the reputation feedback loop).
 */
export async function POST(req: Request) {
  let body: { agents?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const agents = Array.isArray(body.agents) ? body.agents.filter((a) => typeof a === "string") : [];
  if (!agents.length) return NextResponse.json({ error: "agents[] required" }, { status: 400 });

  const results = await bumpReputations(agents);
  return NextResponse.json({ results });
}
