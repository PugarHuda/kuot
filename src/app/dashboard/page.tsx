"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Data = {
  totals?: { attestations: number; authorsPaid: number };
  leaderboard?: { author: string; earned: string }[];
  events?: { queryId: string; total: string; citationCount: number; txHash: string }[];
};

export default function Overview() {
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    fetch("/api/activity").then((r) => r.json()).then(setD).catch(() => setD({}));
  }, []);

  const totalPaid =
    d?.leaderboard?.reduce((s, a) => s + Number(a.earned), 0) ?? 0;

  const stats = [
    { k: "Attestations", v: d?.totals?.attestations ?? "—" },
    { k: "Author payouts", v: d?.totals?.authorsPaid ?? "—" },
    { k: "USDC attributed", v: d ? `${(totalPaid / 1e6).toFixed(2)}` : "—" },
    { k: "Cited authors", v: d?.leaderboard?.length ?? "—" },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl px-8 py-10">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Dashboard</p>
      <h1 className="serif mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-2 max-w-xl text-sm text-[var(--ink)]/70">
        An autonomous research agent operating under your scoped permission — citing, paying, and
        attesting on-chain.
      </p>

      {/* Stat tiles */}
      <div data-tour="ov-stats" className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="bg-[var(--paper-2)] p-5">
            <div className="serif text-3xl font-semibold text-[var(--accent)]">{s.v}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--muted)]">{s.k}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div data-tour="ov-actions" className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { href: "/dashboard/research", t: "Run a query", d: "Grant a budget, research, and pay authors.", g: "❝" },
          { href: "/dashboard/activity", t: "View activity", d: "On-chain attestations + author leaderboard.", g: "≣" },
          { href: "/dashboard/claim", t: "Claim rewards", d: "Authors: bind ORCID, withdraw earnings.", g: "◉" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-5 transition hover:border-[var(--accent)]"
          >
            <div className="text-2xl text-[var(--accent)]">{a.g}</div>
            <div className="serif mt-2 text-lg font-semibold group-hover:text-[var(--accent)]">{a.t}</div>
            <p className="mt-1 text-xs text-[var(--ink)]/65">{a.d}</p>
          </Link>
        ))}
      </div>

      {/* Recent attestations */}
      <div data-tour="ov-recent" className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="serif text-lg font-semibold">Recent attestations</h2>
          <Link href="/dashboard/activity" className="text-xs text-[var(--accent)] hover:underline">
            View all →
          </Link>
        </div>
        <div className="mt-2 space-y-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)]">
          {!d?.events?.length ? (
            <div className="bg-[var(--paper-2)] p-5 text-sm text-[var(--muted)]">
              No attestations yet — run a query and record one.
            </div>
          ) : (
            d.events.slice(0, 5).map((e) => (
              <a
                key={e.txHash}
                href={`https://sepolia.etherscan.io/tx/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between bg-[var(--paper-2)] px-4 py-3 text-xs transition hover:bg-[var(--accent-soft)]"
              >
                <span className="font-mono text-[var(--muted)]">{e.queryId.slice(0, 16)}…</span>
                <span>{e.citationCount} authors</span>
                <span className="serif font-semibold text-[var(--accent)]">
                  {(Number(e.total) / 1e6).toFixed(2)} USDC ↗
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
