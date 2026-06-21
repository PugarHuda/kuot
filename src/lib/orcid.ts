/**
 * ORCID public API adapter — Kuot
 *
 * Verifies an ORCID exists at https://pub.orcid.org/v3.0/{orcid} and fetches the
 * researcher's display name. Used by the claim flow to confirm a real ORCID and
 * to gate the demo path away from real researchers.
 */

export interface OrcidLookupResult {
  orcid: string;
  exists: boolean;
  real: boolean;
  name?: string;
  worksCount?: number;
  error?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const globalKey = "__kuot_ORCID_CACHE__";
type G = typeof globalThis & { [globalKey]?: Map<string, { at: number; result: OrcidLookupResult }> };
function cache() {
  const g = globalThis as G;
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey];
}

export function normalizeOrcid(raw: string): string {
  return raw.trim().replace(/^https?:\/\/orcid\.org\//i, "").toUpperCase();
}

export function isValidOrcidFormat(orcid: string): boolean {
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid);
}

type OrcidApiResponse = {
  person?: {
    name?: {
      "credit-name"?: { value?: string };
      "given-names"?: { value?: string };
      "family-name"?: { value?: string };
    };
  };
  "activities-summary"?: { works?: { group?: unknown[] } };
};

export async function lookupOrcid(raw: string): Promise<OrcidLookupResult> {
  const orcid = normalizeOrcid(raw);
  if (!isValidOrcidFormat(orcid)) return { orcid, exists: false, real: false, error: "invalid format" };

  const cached = cache().get(orcid);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  try {
    const res = await fetch(`https://pub.orcid.org/v3.0/${orcid}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) {
      const result: OrcidLookupResult = { orcid, exists: false, real: false };
      cache().set(orcid, { at: Date.now(), result });
      return result;
    }
    if (!res.ok) return { orcid, exists: false, real: false, error: `HTTP ${res.status}` };

    const data = (await res.json()) as OrcidApiResponse;
    const name = data.person?.name;
    const display =
      name?.["credit-name"]?.value ??
      [name?.["given-names"]?.value, name?.["family-name"]?.value].filter(Boolean).join(" ").trim();
    const result: OrcidLookupResult = {
      orcid,
      exists: true,
      real: true,
      name: display || undefined,
      worksCount: data["activities-summary"]?.works?.group?.length ?? 0,
    };
    cache().set(orcid, { at: Date.now(), result });
    return result;
  } catch (err) {
    return { orcid, exists: false, real: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}
