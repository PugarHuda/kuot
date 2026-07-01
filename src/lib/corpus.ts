/**
 * Corpus search — Kuot
 *
 * Finds the papers an agent will read and pay for. Uses OpenAlex (free, no key).
 * Each work carries its authors, which is who Kuot pays on settlement.
 */
import { resolveAuthorWallets, demoWallet } from "./registry";
import { normalizeOrcid } from "./orcid";
import { veniceChat } from "./venice";
import { AGENT_MODELS } from "./agent-models";

// Conversational/command/filler words (Indonesian + English) that hurt an academic
// paper search. Stripped as a heuristic fallback when the LLM refinement is down.
const FILLER = new Set(
  ("carikan cari carilah tolong mohon coba kasih berikan informasi info tentang mengenai soal " +
    "skripsi tesis jurnal paper makalah penelitian riset studi artikel apa bagaimana gimana kenapa " +
    "mengapa yang untuk dari dengan dan atau adalah ada dong ya sih kan nya " +
    "find search look get show me about information info on the a an of to with and or for " +
    "thesis paper papers research study studies article what how why which are is most best effective").split(
    " ",
  ),
);

/** Heuristic: strip filler/command words, keep topical keywords. Pure + testable. */
export function fillerStrip(query: string): string {
  const kept = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w));
  return kept.join(" ").trim() || query.trim();
}

/**
 * Turn a free-text (possibly conversational, non-English, typo'd) request into a
 * clean academic search query for OpenAlex. Uses Venice to fix typos + translate
 * + keep the core topic; falls back to a heuristic strip if Venice is unavailable.
 */
export async function refineQueryForSearch(query: string): Promise<string> {
  try {
    const { text } = await veniceChat({
      model: AGENT_MODELS.refine,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You convert a user's request into a concise English academic search query for a paper " +
            "database (OpenAlex). Fix typos, translate to English, and output ONLY 2–6 core topic " +
            "keywords — no commands, no punctuation, no quotes, no explanation.",
        },
        { role: "user", content: query },
      ],
    });
    const cleaned = text.trim().replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, " ");
    // Guard against the model echoing the whole sentence or returning junk.
    if (cleaned && cleaned.length <= 80 && cleaned.split(" ").length <= 8) return cleaned;
  } catch {
    /* fall through to heuristic */
  }
  return fillerStrip(query);
}

export type Author = {
  id: string;
  name: string;
  /** Normalized ORCID (if OpenAlex has one) — the identity used for claims. */
  orcid?: string;
  /** Resolved wallet: the real claimed wallet if bound in NameRegistry, else a
   *  deterministic demo address. `claimed` says which. */
  wallet: `0x${string}`;
  claimed: boolean;
};

/** The registry identity for an author: their ORCID if known, else OpenAlex id. */
function identityOf(a: { id: string; orcid?: string }): string {
  return a.orcid ? a.orcid : a.id;
}

export type Work = {
  id: string;
  title: string;
  year?: number;
  url: string;
  abstract: string;
  authors: Author[];
  /** Relevance rank (0 = most relevant) used to weight citation payouts. */
  rank: number;
  /** Where the source came from: academic corpus (OpenAlex) or a live publisher feed. */
  source?: "openalex" | "rsshub";
};

/** Reconstruct an abstract from OpenAlex's inverted index. */
function deinvert(idx?: Record<string, number[]>): string {
  if (!idx || typeof idx !== "object") return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    if (!Array.isArray(positions)) continue; // malformed entry → skip, don't throw
    for (const p of positions) words[p] = word;
  }
  return words.join(" ");
}

type OpenAlexWork = {
  id: string;
  title: string | null;
  publication_year?: number;
  primary_location?: { landing_page_url?: string } | null;
  doi?: string | null;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: { author: { id: string; display_name: string; orcid?: string | null } }[];
};

export type CorpusOptions = {
  limit?: number;
  /** Inclusive publication year range. */
  fromYear?: number;
  toYear?: number;
  /** ISO 639-1 language filter (e.g. "en", "id"). Omit to search all languages. */
  language?: string;
  /** OpenAlex work ids to skip (e.g. already cited in past runs) → surfaces fresh papers. */
  excludeIds?: string[];
};

/**
 * Sanitize a free-text query for OpenAlex's `search` param. OpenAlex treats `?`
 * and `*` as wildcards that require an exact (no-stem) search and otherwise 400s
 * — so a natural question like "…methods?" breaks it. Strip wildcard chars and
 * stray quotes, collapse whitespace. Falls back to the raw query if cleaning
 * empties it.
 */
export function sanitizeQuery(query: string): string {
  const cleaned = query.replace(/[?*"]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || query.trim();
}

// ---- Real publisher sources via RSSHub (Prior Art #01: content that earns when cited) ----

// Optional self-hosted RSSHub instance. If unset we hit Google News' own RSS
// directly — the real upstream that RSSHub's /google/news route wraps, and far
// more reliable than the rate-limited public rsshub.app demo (which 403s in prod).
const RSSHUB_BASE = process.env.KUOT_RSSHUB_BASE?.replace(/\/$/, "");

/** Strip HTML tags + decode the few entities we care about, for a clean abstract. */
function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? stripHtml(m[1]) : "";
}

/** A publisher's payout identity, derived from its name (stable, claimable). */
function publisherIdentity(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "publisher";
  return `rsshub:${slug}`;
}

/**
 * Fetch REAL publisher articles for a query from a live RSSHub feed (Google News
 * route) and map them to Works. The "author" is the publisher, so a citation-toll
 * settles to a claimable publisher identity. Degrades to [] on any failure, so the
 * academic corpus remains the backbone — this is pure augmentation.
 */
export async function searchRSSHub(query: string, count = 3): Promise<Work[]> {
  if (count <= 0) return [];
  const kw = encodeURIComponent(sanitizeQuery(query).slice(0, 80));
  const url = RSSHUB_BASE
    ? `${RSSHUB_BASE}/google/news/${kw}/en`
    : `https://news.google.com/rss/search?q=${kw}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml",
        "user-agent": "Mozilla/5.0 (compatible; KuotResearchAgent/1.0; +https://kuot-azure.vercel.app)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split(/<item>/i).slice(1).map((s) => s.split(/<\/item>/i)[0]);
    // Parse first (no network), dedup, then resolve all publisher wallets in ONE
    // on-chain call (mirrors searchCorpus) — avoids an N+1 round-trip per article.
    type Parsed = { id: string; title: string; link: string; abstract: string; publisher: string; identity: string };
    const parsed: Parsed[] = [];
    const seen = new Set<string>();
    for (const block of items) {
      if (parsed.length >= count) break;
      const link = tag(block, "link");
      const title = tag(block, "title");
      if (!title || !link) continue;
      // The publisher comes ONLY from the <source> tag (Google News emits it).
      // We deliberately do NOT parse it out of "Headline - Publisher" titles —
      // a headline that merely contains " - " would mis-set the payee.
      const publisher = tag(block, "source") || "Publisher";
      const identity = publisherIdentity(publisher);
      const id = `rsshub:${link}`.slice(0, 256); // cap id length (flows into grounding)
      if (seen.has(id)) continue;
      seen.add(id);
      parsed.push({ id, title, link, abstract: (tag(block, "description") || title).slice(0, 1200), publisher, identity });
    }
    if (!parsed.length) return [];
    const wallets = await resolveAuthorWallets(parsed.map((p) => p.identity));
    return parsed.map((p, i): Work => {
      const r = wallets.get(p.identity) ?? { wallet: demoWallet(p.identity), claimed: false };
      return {
        id: p.id,
        title: p.title,
        url: p.link,
        abstract: p.abstract,
        rank: i,
        source: "rsshub",
        authors: [{ id: p.identity, name: p.publisher, orcid: undefined, wallet: r.wallet, claimed: r.claimed }],
      };
    });
  } catch {
    return []; // network/timeout/parse — academic corpus carries the run
  }
}

/** Search OpenAlex and return the top works with authors + abstracts. */
/**
 * Fetch OpenAlex with a timeout + one lighter retry. Their `search` (relevance)
 * engine 504s ("query_timeout") on broad queries; the retry drops the relevance
 * sort and shrinks the page — the slow parts — which usually clears the timeout.
 * ponytail: one retry; if OpenAlex is truly down, the caller degrades to no papers.
 */
async function fetchOpenAlexResilient(url: URL): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return res;
      if (res.status >= 500 && attempt === 0) {
        url.searchParams.set("per_page", "25"); // lighter page
        url.searchParams.delete("sort"); // the relevance sort is what times out
        continue;
      }
      throw new Error(`OpenAlex ${res.status}: ${await res.text()}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && /timeout|abort|fetch failed|network|ENOTFOUND|ECONNRESET/i.test(msg)) {
        url.searchParams.set("per_page", "25");
        url.searchParams.delete("sort");
        continue;
      }
      throw e;
    }
  }
  throw new Error("OpenAlex unreachable after retry");
}

export async function searchCorpus(query: string, opts: CorpusOptions = {}): Promise<Work[]> {
  const limit = opts.limit ?? 5;
  const exclude = new Set((opts.excludeIds ?? []).map((id) => id.toLowerCase()));
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", sanitizeQuery(query));
  // Over-fetch so we can drop already-seen papers and still return `limit` fresh ones.
  url.searchParams.set("per_page", String(Math.min(200, limit + exclude.size + 5)));
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set("mailto", "research@kuot.app");

  const filters: string[] = [];
  if (opts.fromYear) filters.push(`from_publication_date:${opts.fromYear}-01-01`);
  if (opts.toYear) filters.push(`to_publication_date:${opts.toYear}-12-31`);
  if (opts.language) filters.push(`language:${opts.language}`);
  if (filters.length) url.searchParams.set("filter", filters.join(","));

  const res = await fetchOpenAlexResilient(url);
  const json = (await res.json()) as { results?: OpenAlexWork[] };
  // Skip already-seen works (dedup across runs), then keep the top `limit`.
  const results = (json.results ?? []).filter((w) => !exclude.has((w.id ?? "").toLowerCase())).slice(0, limit);

  // Each author's identity = their ORCID (if OpenAlex has one) else OpenAlex id.
  // Resolve wallets from the on-chain NameRegistry (real claimed) with a labeled
  // demo fallback for unclaimed.
  const enriched = results.map((w) => ({
    w,
    authors: (w.authorships ?? [])
      .filter((a) => a?.author)
      .slice(0, 4)
      .map((a) => ({
        // OpenAlex occasionally omits author.id → fall back to orcid/name so the
        // identity is never undefined (demoWallet iterates it).
        id: a.author.id ?? a.author.orcid ?? a.author.display_name ?? "unknown-author",
        name: a.author.display_name ?? "Unknown author",
        orcid: a.author.orcid ? normalizeOrcid(a.author.orcid) : undefined,
      })),
  }));
  const identities = enriched.flatMap((e) => e.authors.map(identityOf));
  const wallets = await resolveAuthorWallets(identities);

  // Per-work transform is wrapped: one malformed paper is dropped, never fatal —
  // the run proceeds with whatever valid works remain.
  return enriched
    .map(({ w, authors }, rank): Work | null => {
      try {
        const url = w.primary_location?.landing_page_url ?? (w.doi ? `https://doi.org/${w.doi}` : w.id) ?? "";
        return {
          id: w.id ?? w.doi ?? url ?? `openalex-${rank}`,
          title: w.title ?? "(untitled)",
          year: w.publication_year,
          url,
          abstract: deinvert(w.abstract_inverted_index).slice(0, 1200),
          rank,
          source: "openalex",
          authors: authors.map((a) => {
            const r = wallets.get(identityOf(a)) ?? { wallet: demoWallet(identityOf(a)), claimed: false };
            return { id: a.id, name: a.name, orcid: a.orcid, wallet: r.wallet, claimed: r.claimed };
          }),
        };
      } catch {
        return null;
      }
    })
    .filter((w): w is Work => w !== null);
}
