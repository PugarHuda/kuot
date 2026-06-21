/**
 * Small input-formatting helpers — Kuot
 *
 * A controlled <input type="number"> in React keeps stale leading zeros
 * ("000.1") because the parsed value doesn't change. We back the numeric fields
 * with a string and sanitize on each keystroke instead.
 */

/** Keep digits + a single decimal point; strip leading zeros (preserves "0.x"). */
export function sanitizeDecimal(v: string): string {
  let s = v.replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s.replace(/^0+(?=\d)/, "");
}

/** Digits only; strip leading zeros. */
export function sanitizeInteger(v: string): string {
  return v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** Dedupe OpenAlex work ids, lower-cased, dropping falsy — for excludeIds. */
export function uniqueWorkIds(ids: (string | undefined | null)[]): string[] {
  return Array.from(new Set(ids.filter((x): x is string => Boolean(x)).map((x) => x)));
}
