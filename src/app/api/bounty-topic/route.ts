import { NextResponse } from "next/server";
import { putOnchain, getOnchain, canUseOnchainStore } from "@/lib/onchain-store";

export const runtime = "nodejs";

// Bounties store only a topicHash on-chain, so the readable topic is kept in the
// KV/on-chain store (keyed by hash) — letting the UI show the topic and offer a
// one-click "research this" action. Reuses the store precedence (KV → on-chain).
const URL_ENV = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const kvOn = () => Boolean(URL_ENV && TOKEN_ENV);
async function kv(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(URL_ENV!, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN_ENV}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  return ((await res.json()) as { result?: unknown }).result;
}
const key = (h: string) => `bounty-topic:${h.toLowerCase()}`;

export async function POST(req: Request) {
  let body: { topicHash?: string; topic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const topicHash = body.topicHash?.toLowerCase();
  const topic = body.topic?.trim();
  if (!topicHash || !/^0x[0-9a-f]{64}$/.test(topicHash) || !topic) {
    return NextResponse.json({ error: "topicHash + topic required" }, { status: 400 });
  }
  try {
    if (kvOn()) await kv(["SET", key(topicHash), topic.slice(0, 200)]);
    else if (canUseOnchainStore()) await putOnchain(key(topicHash), topic.slice(0, 120));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

/** Resolve a topicHash → readable topic (used by /api/bounties). null if unknown. */
export async function resolveBountyTopic(topicHash: string): Promise<string | null> {
  try {
    if (kvOn()) return ((await kv(["GET", key(topicHash)])) as string | null) ?? null;
    if (canUseOnchainStore()) return await getOnchain(key(topicHash));
  } catch {
    /* best-effort */
  }
  return null;
}
