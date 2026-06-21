"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadHistory, removeFromHistory, clearHistory, type HistoryEntry } from "@/lib/history";

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

type ConfFilter = "all" | "high" | "medium" | "low";

export default function LibraryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [conf, setConf] = useState<ConfFilter>("all");

  useEffect(() => {
    setHistory(loadHistory());
    setReady(true);
  }, []);

  // Aggregate stats across every saved run.
  const totalRuns = history.length;
  const totalJournals = history.reduce((n, h) => n + (h.result.works?.length ?? 0), 0);
  const uniqueAuthors = new Set<string>();
  history.forEach((h) => h.result.payouts?.forEach((p) => uniqueAuthors.add(p.identity || p.authorName)));

  // Search (query + answer text + cited journal titles) and confidence filter.
  const q = search.trim().toLowerCase();
  const filtered = history.filter((h) => {
    if (conf !== "all" && (h.result.confidence ?? "").toLowerCase() !== conf) return false;
    if (!q) return true;
    const hay = [
      h.query,
      h.result.summary,
      h.result.synthesis,
      ...(h.result.works?.map((w) => w.title) ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Your research</p>
          <h1 className="serif mt-2 text-4xl font-semibold tracking-tight">Library</h1>
        </div>
        {totalRuns > 0 ? (
          <button
            onClick={() => setHistory(clearHistory())}
            className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-[11px] text-[var(--muted)] hover:border-red-300 hover:text-red-600"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--ink)]/75">
        Every research run you finish is kept in <span className="italic">this browser</span> — full
        synthesis, agent trace, cited journals, and payout plan. Re-open any of them without
        re-paying. The on-chain attestation remains the canonical paid record.
      </p>

      {/* Stat tiles */}
      {totalRuns > 0 ? (
        <div className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--rule)]">
          {[
            { k: "Saved runs", v: totalRuns },
            { k: "Journals cited", v: totalJournals },
            { k: "Authors reached", v: uniqueAuthors.size },
          ].map((t) => (
            <div key={t.k} className="bg-[var(--paper-2)] p-4 text-center">
              <div className="serif text-2xl font-semibold text-[var(--accent)]">{t.v}</div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{t.k}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Search + confidence filter */}
      {totalRuns > 0 ? (
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">🔎</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search query, answer, or cited journal…"
              className="w-full rounded-md border border-[var(--rule)] bg-transparent py-2 pl-9 pr-8 text-sm outline-none focus:border-[var(--accent)]"
            />
            {search ? (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
              >
                ✕
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-[var(--rule)] p-0.5">
            {(["all", "high", "medium", "low"] as ConfFilter[]).map((c) => (
              <button
                key={c}
                onClick={() => setConf(c)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                  conf === c ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Entries */}
      <div data-tour="lib-list" className="mt-4 space-y-3">
        {!ready ? (
          <div className="card p-6 text-sm text-[var(--muted)]">Loading…</div>
        ) : totalRuns === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-[var(--muted)]">No saved research yet.</p>
            <Link
              href="/dashboard/research"
              className="mt-3 inline-block rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white"
            >
              Run your first query →
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--muted)]">
            No runs match “{search}”{conf !== "all" ? ` · ${conf} confidence` : ""}.
          </div>
        ) : (
          filtered.map((h) => {
            const works = h.result.works ?? [];
            const authors = h.result.payouts?.length ?? 0;
            const snippet = stripTags(h.result.summary || h.result.synthesis || "").slice(0, 200);
            return (
              <article key={h.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="serif text-lg font-semibold leading-snug">{h.query}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span>{new Date(h.savedAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>{works.length} journals</span>
                      <span>·</span>
                      <span>{authors} authors</span>
                      {h.result.confidence ? (
                        <>
                          <span>·</span>
                          <span>confidence: {h.result.confidence}</span>
                        </>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          h.venice === "live"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {h.venice === "live" ? "Venice live" : "fallback"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setHistory(removeFromHistory(h.id))}
                    title="Delete this saved run"
                    className="shrink-0 rounded p-1 text-[var(--muted)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    ✕
                  </button>
                </div>

                {snippet ? (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/80">
                    {snippet}
                    {snippet.length >= 200 ? "…" : ""}
                  </p>
                ) : null}

                {/* Cited journals (clickable to the source) */}
                {works.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {works.slice(0, 3).map((w, i) => (
                      <a
                        key={`${h.id}-${i}`}
                        href={w.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-500"
                        title={stripTags(w.title)}
                      >
                        [{i + 1}] {stripTags(w.title)}
                      </a>
                    ))}
                    {works.length > 3 ? (
                      <p className="text-[11px] text-[var(--muted)]">+ {works.length - 3} more</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/dashboard/result/${encodeURIComponent(h.id)}`}
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white"
                  >
                    Open full result →
                  </Link>
                  <Link
                    href={`/dashboard/research?q=${encodeURIComponent(h.query)}`}
                    className="rounded-md border border-[var(--rule)] px-4 py-2 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    Re-run
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
