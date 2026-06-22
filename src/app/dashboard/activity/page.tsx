"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Ev = {
  queryId: string;
  payer: string;
  total: string;
  citationCount: number;
  block: number;
  txHash: string;
};
type Board = { author: string; earned: string }[];
type Totals = { attestations: number; authorsPaid: number };

export default function ActivityPage() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [board, setBoard] = useState<Board>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setBoard(d.leaderboard ?? []);
        setTotals(d.totals ?? null);
        if (d.error) setError(d.error);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">On-chain</p>
      <h1 className="serif mt-2 text-4xl font-semibold tracking-tight">Attestation activity</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--ink)]/75">
        Every research query records a public attestation on AttributionLedger (Arc) of each
        author&apos;s owed share. This is a live read of those{" "}
        <span className="serif italic">QueryAttested</span> events. Payment is settled to authors
        gas-free via Circle Gateway (or atomically via <span className="serif italic">attestAndSplit</span>).
      </p>

      {/* Stat tiles */}
      {totals ? (
        <div className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--rule)]">
          {[
            { k: "Attestations", v: totals.attestations },
            { k: "Author payouts", v: totals.authorsPaid },
            { k: "Top authors", v: board.length },
          ].map((t) => (
            <div key={t.k} className="bg-[var(--paper-2)] p-4 text-center">
              <div className="serif text-2xl font-semibold text-[var(--accent)]">{t.v}</div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{t.k}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Leaderboard */}
      {board.length > 0 ? (
        <section data-tour="act-leaderboard" className="mt-8">
          <h2 className="serif text-lg font-semibold">Top cited authors</h2>
          <div className="mt-2 space-y-px overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--rule)]">
            {board.map((a, i) => (
              <Link
                key={a.author}
                href={`/dashboard/authors/${a.author}`}
                className="flex items-center justify-between bg-[var(--paper-2)] px-4 py-2.5 text-xs transition hover:bg-[var(--accent-soft)]"
              >
                <span className="flex items-center gap-3">
                  <span className="serif w-5 text-[var(--muted)]">{i + 1}</span>
                  <span className="font-mono">{a.author.slice(0, 8)}…{a.author.slice(-6)}</span>
                </span>
                <span className="serif font-semibold text-[var(--accent)]">
                  {(Number(a.earned) / 1e6).toFixed(2)} USDC →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <h2 data-tour="act-recent" className="serif mt-10 text-lg font-semibold">Recent attestations</h2>
      <div className="mt-2 space-y-px overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--rule)]">
        {events === null ? (
          <div className="bg-[var(--paper-2)] p-6 text-sm text-[var(--muted)]">Loading…</div>
        ) : events.length === 0 ? (
          <div className="bg-[var(--paper-2)] p-6 text-sm text-[var(--muted)]">
            No attestations yet{error ? ` (${error})` : ""}. Run a query and click “Record attestation”.
          </div>
        ) : (
          events.map((e) => (
            <a
              key={e.txHash + e.queryId}
              href={`https://testnet.arcscan.app/tx/${e.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 bg-[var(--paper-2)] p-4 transition hover:bg-[var(--accent-soft)]"
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-[var(--muted)]">
                  {e.queryId.slice(0, 18)}…
                </div>
                <div className="mt-0.5 text-xs">
                  <span className="font-medium">{e.citationCount}</span> authors cited · payer{" "}
                  <span className="font-mono">{e.payer.slice(0, 6)}…{e.payer.slice(-4)}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="serif text-sm font-semibold text-[var(--accent)]">
                  {(Number(e.total) / 1e6).toFixed(2)} USDC
                </div>
                <div className="text-[10px] text-[var(--muted)]">block {e.block} ↗</div>
              </div>
            </a>
          ))
        )}
      </div>
    </main>
  );
}
