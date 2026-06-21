/**
 * Granted-permission persistence — Kuot (client-side)
 *
 * The ERC-7715 grant lives on-chain (valid until expiry/revoke), but the UI
 * "granted" state only lived in React, so navigating away lost the banner +
 * countdown. This keeps the granted context in localStorage (per wallet) so the
 * Research page re-shows the active budget after a page change or refresh.
 * Auto-drops once expired.
 */

export type StoredGrant = {
  wallet: string;
  context: unknown;
  expiryUnix: number;
  capUSDC: number;
};

const KEY = "kuot:active-grant";

export function saveGrant(g: StoredGrant): void {
  if (typeof window === "undefined") return;
  try {
    // The granted context contains BigInt values (e.g. periodAmount) — plain
    // JSON.stringify THROWS on BigInt, which silently dropped the save (grant
    // looked "lost" after navigation). Serialize BigInt as a string instead.
    window.localStorage.setItem(
      KEY,
      JSON.stringify(g, (_k, v) => (typeof v === "bigint" ? `${v.toString()}n` : v)),
    );
  } catch {
    /* quota / disabled — best-effort */
  }
}

/** Load the active grant for `wallet`, or null if none/expired/other wallet. */
export function loadGrant(wallet?: string): StoredGrant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as StoredGrant;
    const now = Math.floor(Date.now() / 1000);
    if (!g || typeof g.expiryUnix !== "number" || g.expiryUnix <= now) {
      clearGrant();
      return null;
    }
    // Only surface it for the wallet that granted it.
    if (wallet && g.wallet && g.wallet.toLowerCase() !== wallet.toLowerCase()) return null;
    return g;
  } catch {
    return null;
  }
}

export function clearGrant(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
