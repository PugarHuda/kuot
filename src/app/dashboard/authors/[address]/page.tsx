"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Payment = { queryId: string; amount: string; weightBps: number; txHash: string; block: number };
type Data = { address: string; earned: string; payments: Payment[]; error?: string };

export default function AuthorProfile({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    fetch(`/api/author?address=${address}`).then((r) => r.json()).then(setD).catch(() => setD(null));
  }, [address]);

  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <Link href="/dashboard/activity" className="text-xs text-[var(--accent)] hover:underline">
        ← Activity
      </Link>
      <p className="mt-4 text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Author</p>
      <h1 className="serif mt-1 break-all text-2xl font-semibold tracking-tight">{address}</h1>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)]">
        <div className="bg-[var(--paper-2)] p-5">
          <div className="serif text-3xl font-semibold text-[var(--accent)]">
            {d ? `${(Number(d.earned) / 1e6).toFixed(2)}` : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">USDC earned (lifetime)</div>
        </div>
        <div className="bg-[var(--paper-2)] p-5">
          <div className="serif text-3xl font-semibold text-[var(--accent)]">{d?.payments.length ?? "—"}</div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Citations paid</div>
        </div>
      </div>

      <h2 className="serif mt-9 text-lg font-semibold">Payments</h2>
      <div className="mt-2 space-y-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)]">
        {!d?.payments?.length ? (
          <div className="bg-[var(--paper-2)] p-5 text-sm text-[var(--muted)]">
            No payments recorded yet for this author.
          </div>
        ) : (
          d.payments.map((p) => (
            <a
              key={p.txHash + p.queryId}
              href={`https://testnet.arcscan.app/tx/${p.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between bg-[var(--paper-2)] px-4 py-3 text-xs transition hover:bg-[var(--accent-soft)]"
            >
              <span className="font-mono text-[var(--muted)]">{p.queryId.slice(0, 16)}…</span>
              <span>{(p.weightBps / 100).toFixed(1)}% share</span>
              <span className="serif font-semibold text-[var(--accent)]">
                {(Number(p.amount) / 1e6).toFixed(3)} USDC ↗
              </span>
            </a>
          ))
        )}
      </div>
    </main>
  );
}
