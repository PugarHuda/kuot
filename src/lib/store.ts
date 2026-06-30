/**
 * Shared-result store — Kuot (public permalinks)
 *
 * Persists a finished research result server-side so anyone can open it at
 * /r/<id>. Backed by Upstash Redis over its REST API (the same store Vercel KV
 * provisions). Config is read from either naming convention:
 *   - Vercel KV:     KV_REST_API_URL        + KV_REST_API_TOKEN
 *   - Upstash direct: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 * If neither is set, `isShareConfigured()` is false and the API returns a clear
 * "sharing not configured" message instead of throwing — the rest of the app is
 * unaffected. Results are stored with a 90-day TTL.
 */

import { gzipSync, gunzipSync } from "node:zlib";
import { queryIdOf } from "./settlement";
import { canReadOnChain, canWriteOnChain, publishOnChain, readOnChain } from "./sharechain";

// In-memory record of what we last wrote per id, so a re-POST of identical content
// (the cheapest gas-drain loop — same query id, same blob) skips the on-chain write.
// ponytail: per-instance cache; cross-instance dups still cost one write each — the
// on-chain read below is the cross-instance backstop. Upgrade to KV if it matters.
const lastWritten = new Map<string, string>();

/** gzip+base64 a JSON string (tagged so reads can detect compression). */
function pack(json: string): string {
  return `gz:${gzipSync(Buffer.from(json, "utf8")).toString("base64")}`;
}
/** Inverse of pack(); passes through legacy uncompressed values. */
function unpack(raw: string): string {
  if (!raw.startsWith("gz:")) return raw;
  return gunzipSync(Buffer.from(raw.slice(3), "base64")).toString("utf8");
}

/** On-chain storage is gas-bound; reject blobs that won't fit a sane gas budget.
 *  Arc gas is cheap USDC, so we allow a larger blob than a typical L1 would. */
const MAX_ONCHAIN_BYTES = 12_288;

/** Public share id for a query — first 8 bytes of the same queryId attested on-chain. */
export function shareIdForQuery(query: string): string {
  return queryIdOf(query).slice(2, 18);
}

const URL_ENV = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const PREFIX = "share:";

function kvConfigured(): boolean {
  return Boolean(URL_ENV && TOKEN_ENV);
}

/** True when sharing can persist a result (KV configured, or on-chain operator). */
export function isShareConfigured(): boolean {
  return kvConfigured() || canWriteOnChain();
}

/** Run one Redis command via the Upstash REST API. */
async function command(args: (string | number)[]): Promise<unknown> {
  if (!URL_ENV || !TOKEN_ENV) throw new Error("sharing is not configured");
  const res = await fetch(URL_ENV, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN_ENV}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    // Always hit the store; never serve a stale CDN copy.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV ${args[0]} HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV ${args[0]}: ${json.error}`);
  return json.result;
}

/**
 * Persist a JSON-serializable value under a share id. Prefers KV (fast, 90-day
 * TTL) when configured; otherwise publishes on-chain via ShareRegistry (durable,
 * zero-infra — the default so sharing works out of the box).
 */
export async function putShared(id: string, value: unknown): Promise<void> {
  const packed = pack(JSON.stringify(value));
  if (kvConfigured()) {
    await command(["SET", PREFIX + id, packed, "EX", TTL_SECONDS]);
    return;
  }
  if (canWriteOnChain()) {
    // On-chain storage costs gas per byte — guard size, and turn the node's raw
    // "gas required exceeds allowance" revert into an actionable message.
    if (Buffer.byteLength(packed, "utf8") > MAX_ONCHAIN_BYTES) {
      throw new Error("result too large to publish on-chain — enable KV for unlimited sharing (see SHARE-SETUP.md)");
    }
    // Idempotent: don't pay gas to re-write byte-identical content. Checks this
    // instance's cache first, then the chain (covers a cold instance / re-share).
    // Best-effort — a read RPC blip must NOT block a legit share, so fall through.
    if (lastWritten.get(id) === packed) return;
    try {
      if ((await readOnChain(id)) === packed) {
        lastWritten.set(id, packed);
        return;
      }
    } catch {
      /* read failed — skip the optimization, publish normally */
    }
    try {
      await publishOnChain(id, packed);
      lastWritten.set(id, packed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/allowance|insufficient funds|exceeds/i.test(msg)) {
        throw new Error("on-chain publish failed (operator out of Arc gas (USDC)) — top up the operator or enable KV (SHARE-SETUP.md)");
      }
      throw e;
    }
    return;
  }
  throw new Error("sharing is not configured");
}

/** Retrieve a stored value by share id, or null if missing/expired. Tries KV then chain. */
export async function getShared<T = unknown>(id: string): Promise<T | null> {
  let raw: string | null = null;
  if (kvConfigured()) raw = (await command(["GET", PREFIX + id])) as string | null;
  if (!raw && canReadOnChain()) raw = await readOnChain(id);
  if (!raw) return null;
  try {
    return JSON.parse(unpack(raw)) as T;
  } catch {
    return null;
  }
}
