"use client";

import { useEffect, useState } from "react";

type Activity = {
  events?: { total: string }[];
  leaderboard?: { author: string; earned: string }[];
  totals?: { attestations: number; authorsPaid: number };
};

/**
 * Live on-chain proof strip for the landing page — reads the same
 * AttributionLedger events the Activity page does, so the headline numbers are
 * real, not decoration. Renders nothing until loaded (no fake placeholders).
 */
export function LandingStats() {
  const [data, setData] = useState<Activity | null>(null);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const attestations = data?.totals?.attestations ?? 0;
  const authors = data?.leaderboard?.length ?? 0;
  const attributed = (data?.events ?? []).reduce((s, e) => s + Number(e.total ?? 0), 0) / 1e6;

  if (!data || attestations === 0) return null;

  const tiles = [
    { v: attestations, k: "on-chain attestations" },
    { v: `${attributed.toFixed(2)}`, k: "USDC attributed" },
    { v: authors, k: "authors cited" },
  ];

  return (
    <section className="mt-12 w-full max-w-2xl">
      <p className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
        Live on Arc — not a mockup
      </p>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--rule)]">
        {tiles.map((t) => (
          <div key={t.k} className="bg-[var(--paper-2)] p-4 text-center">
            <div className="serif text-2xl font-semibold text-[var(--accent)]">{t.v}</div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{t.k}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center">
        <a
          href="/dashboard/activity"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
        >
          See every payment on-chain →
        </a>
      </div>
    </section>
  );
}
