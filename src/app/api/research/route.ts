import { NextResponse } from "next/server";
import { runResearch } from "@/lib/agent";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
// Multi-agent orchestration can chain several Venice calls; give it headroom
// (Vercel caps to the plan's max, so this is safe even where it can't be honored).
export const maxDuration = 120;

/**
 * POST /api/research  { query: string, papers?: number }
 * Runs the research agent (corpus + Venice) and returns synthesis + the
 * citation payout plan the agent will settle via attestAndSplit.
 */
export async function POST(req: Request) {
  let body: {
    query?: string;
    papers?: number;
    fromYear?: number;
    toYear?: number;
    language?: string;
    rootBudgetUSDC?: number;
    excludeIds?: string[];
    webSources?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  // The free tier runs real Venice inference — throttle per-IP so it can't be
  // scripted to burn credits. (8 runs/min; the paid /api/research/x402 is uncapped.)
  const rl = rateLimit(`research:${clientIp(req)}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit — too many free research runs; retry shortly or use the paid /api/research/x402" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  try {
    const result = await runResearch(query, {
      papers: body.papers,
      fromYear: body.fromYear,
      toYear: body.toYear,
      language: body.language,
      // Clamp the budget that scales the agent fan-out (public endpoint).
      rootBudgetUSDC:
        typeof body.rootBudgetUSDC === "number"
          ? Math.min(1000, Math.max(0, body.rootBudgetUSDC))
          : undefined,
      excludeIds: Array.isArray(body.excludeIds)
        ? body.excludeIds.filter((x) => typeof x === "string").slice(0, 200)
        : undefined,
      webSources: typeof body.webSources === "number" ? Math.min(5, Math.max(0, body.webSources)) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
