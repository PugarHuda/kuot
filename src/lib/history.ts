/**
 * Research history — Kuot (client-side persistence)
 *
 * A finished research run lives only in React state, so a refresh loses it. The
 * on-chain attestation is the canonical *paid* proof, but it stores only the
 * query hash + payouts — not the synthesis text. This keeps a per-device history
 * of full results in localStorage so a user can re-open and re-read past runs
 * (synthesis, summary, agent trace, payout plan) without re-paying. Non-custodial
 * and zero-infra: the data never leaves the browser.
 */
import type { ResearchResult } from "./agent";

export type HistoryEntry = {
  id: string;
  query: string;
  savedAt: number;
  /** "live" or "fallback" — surfaced so the list can flag dev-mode runs. */
  venice: ResearchResult["venice"];
  result: ResearchResult;
};

const KEY = "kuot:research-history";
const MAX = 25;

function read(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    // Quota exceeded or storage disabled — drop the oldest half and retry once.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, Math.floor(MAX / 2))));
    } catch {
      /* give up silently — history is best-effort */
    }
  }
}

/** Most-recent-first list of saved runs. */
export function loadHistory(): HistoryEntry[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Save a finished result. De-dupes by query (case-insensitive): re-running the
 * same question replaces the older entry and moves it to the top. Returns the
 * updated list so callers can refresh state without a second read.
 */
export function saveToHistory(result: ResearchResult, nowMs: number = Date.now()): HistoryEntry[] {
  const query = result.query?.trim();
  if (!query) return loadHistory();
  const key = query.toLowerCase();
  const rest = read().filter((e) => e.query.trim().toLowerCase() !== key);
  const entry: HistoryEntry = {
    id: `${nowMs}-${key.replace(/\W+/g, "-").slice(0, 40)}`,
    query,
    savedAt: nowMs,
    venice: result.venice,
    result,
  };
  const next = [entry, ...rest].slice(0, MAX);
  write(next);
  return next.sort((a, b) => b.savedAt - a.savedAt);
}

/** Remove one entry by id. Returns the updated list. */
export function removeFromHistory(id: string): HistoryEntry[] {
  const next = read().filter((e) => e.id !== id);
  write(next);
  return next.sort((a, b) => b.savedAt - a.savedAt);
}

/** Wipe all saved research. */
export function clearHistory(): HistoryEntry[] {
  write([]);
  return [];
}
