"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { loadHistory, type HistoryEntry } from "@/lib/history";
import { ResultView } from "@/components/ResultView";

type ShareState =
  | { status: "idle" }
  | { status: "sharing" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

export default function ResultDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined); // undefined = loading
  const [share, setShare] = useState<ShareState>({ status: "idle" });

  useEffect(() => {
    const found = loadHistory().find((e) => e.id === id);
    setEntry(found ?? null);
  }, [id]);

  async function handleShare() {
    if (!entry) return;
    setShare({ status: "sharing" });
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result: entry.result }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const url = `${window.location.origin}${json.path}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be blocked — the link is still shown below */
      }
      setShare({ status: "done", url });
    } catch (e) {
      setShare({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (entry === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  if (entry === null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="serif text-2xl font-semibold">Result not found</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This run isn’t saved on this device (history lives in your browser).{" "}
          <Link href="/dashboard/library" className="link-accent underline">
            Back to Library →
          </Link>
        </p>
      </main>
    );
  }

  const result = entry.result;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/dashboard/library" className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)]">
        ← Library
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Saved research</p>
          <h1 className="serif mt-1 text-3xl font-semibold tracking-tight">{result.query}</h1>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {new Date(entry.savedAt).toLocaleString()} · {result.works?.length ?? 0} journals ·{" "}
            {result.payouts?.length ?? 0} authors
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={handleShare}
          disabled={share.status === "sharing"}
          className="rounded-lg border border-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-40"
        >
          {share.status === "sharing" ? "Creating link…" : "Share public link ↗"}
        </button>
        <Link
          href={`/dashboard/research?q=${encodeURIComponent(result.query)}`}
          className="rounded-lg border border-[var(--rule)] px-4 py-2 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Re-run on workbench
        </Link>
      </div>

      {share.status === "done" ? (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--rule)] p-2 text-[11px]">
          <span className="text-emerald-600">✓ link copied</span>
          <a href={share.url} target="_blank" rel="noreferrer" className="link-accent flex-1 truncate font-mono underline">
            {share.url}
          </a>
        </div>
      ) : null}
      {share.status === "error" ? (
        <p className="mt-2 text-[11px] text-red-600">
          {/not configured/i.test(share.message)
            ? "Public sharing isn’t configured on this deployment. The run is still saved locally and re-openable here."
            : share.message}
        </p>
      ) : null}

      <div className="mt-6">
        <ResultView result={result} />
      </div>
    </main>
  );
}
