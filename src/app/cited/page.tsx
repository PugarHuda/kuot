"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Problem-first landing for the people whose work is read by AI for free.
// Leads with THEIR problem — not Arc, not x402, not "hackathon". The payment
// rail (USDC on Arc, gas-free) is mentioned only as reassurance at the bottom.

type Owed = { identity: string; owedUSDC6?: string } | null;
type Stats = { authorsOnboarded: number; authorPayouts: number; citedAuthors: number; attributedUSDC: number } | null;

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;

export default function Cited() {
  const [orcid, setOrcid] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "done" | "bad">("idle");
  const [owed, setOwed] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>(null);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => setStats(null));
  }, []);

  async function check() {
    const id = orcid.trim();
    if (!ORCID_RE.test(id)) {
      setState("bad");
      return;
    }
    setState("checking");
    try {
      const r: Owed = await fetch(`/api/owed?identity=${encodeURIComponent(id)}`).then((x) => x.json());
      setOwed(Number(r?.owedUSDC6 ?? 0) / 1e6);
      setState("done");
    } catch {
      setOwed(0);
      setState("done");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      {/* Hero — the problem, in their words */}
      <h1 className="serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Your work trains AI.{" "}
        <span className="text-[var(--accent)]">Get paid when it&apos;s cited.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--ink)]/80">
        AI assistants read your papers and articles, answer with them, and send you nothing. We change
        that: when an AI answer is grounded in your work, you get paid for it — automatically, with no
        fees and no account to manage. You keep writing; the citations pay you.
      </p>

      {/* The useful bit: am I owed anything? */}
      <div className="mt-9 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-6">
        <p className="text-sm font-semibold">Check what your work has already earned</p>
        <p className="mt-1 text-sm text-[var(--ink)]/65">
          Enter your ORCID iD (the 16-digit researcher ID on your papers). We&apos;ll show what&apos;s waiting for you.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={orcid}
            onChange={(e) => {
              setOrcid(e.target.value);
              if (state !== "idle") setState("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="0000-0002-1825-0097"
            className="min-w-[220px] flex-1 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={check}
            disabled={state === "checking"}
            className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {state === "checking" ? "Checking…" : "Check my earnings"}
          </button>
        </div>

        {state === "bad" ? (
          <p className="mt-3 text-sm text-amber-600">That doesn&apos;t look like an ORCID iD. It looks like 0000-0002-1825-0097.</p>
        ) : null}

        {state === "done" ? (
          owed && owed > 0 ? (
            <div className="mt-4 rounded-lg border border-[var(--accent)]/40 bg-[var(--paper-2)] p-4">
              <p className="text-sm">
                <span className="serif text-2xl font-semibold text-[var(--accent)]">${owed.toFixed(6)}</span>{" "}
                is waiting for you from citations of your work.
              </p>
              <Link
                href={`/dashboard/claim?orcid=${encodeURIComponent(orcid.trim())}`}
                className="mt-3 inline-block rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-95"
              >
                Claim it (2 minutes, no fees) →
              </Link>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4 text-sm text-[var(--ink)]/75">
              No citations of your work yet — but the moment an AI answer is grounded in it, your share
              starts accruing here.{" "}
              <Link href={`/dashboard/claim?orcid=${encodeURIComponent(orcid.trim())}`} className="font-medium text-[var(--accent)] underline">
                Set up your wallet now
              </Link>{" "}
              so you&apos;re paid automatically.
            </div>
          )
        ) : null}
      </div>

      {/* How it works — plain language, zero jargon */}
      <section className="mt-12">
        <h2 className="serif text-xl font-semibold">How it works</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { n: "1", t: "AI cites your work", d: "When an assistant answers using your paper or article, that citation is recorded and priced — even a fraction of a cent." },
            { n: "2", t: "Your share is set aside", d: "Only the sources an answer actually relied on get paid, by how much they contributed. Your share waits for you, and even earns yield until you collect it." },
            { n: "3", t: "You claim, you keep it", d: "Verify your ORCID and link a wallet once. From then on every citation pays you directly. No fees, no gas, nothing to install." },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-[var(--rule)] bg-[var(--paper-2)] p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">{s.n}</span>
              <h3 className="serif mt-3 text-base font-semibold">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink)]/70">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quiet social proof from real on-chain numbers */}
      {stats ? (
        <section className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-[var(--rule)] bg-[var(--paper-2)] px-6 py-4 text-sm">
          <div><span className="serif text-xl font-semibold text-[var(--accent)]">{stats.citedAuthors}</span> <span className="text-[var(--ink)]/60">authors paid</span></div>
          <div><span className="serif text-xl font-semibold text-[var(--accent)]">{stats.authorPayouts}</span> <span className="text-[var(--ink)]/60">citation payouts</span></div>
          <div><span className="serif text-xl font-semibold text-[var(--accent)]">${stats.attributedUSDC.toFixed(2)}</span> <span className="text-[var(--ink)]/60">paid to sources</span></div>
        </section>
      ) : null}

      {/* The reassurance line — payment rail mentioned last, as trust, not pitch */}
      <p className="mt-10 text-xs leading-relaxed text-[var(--muted)]">
        Payments settle instantly in US-dollar stablecoin (USDC) — you can hold them or cash out. You
        never pay a fee or a gas cost; you don&apos;t need a crypto wallet to start, and you don&apos;t need to
        understand any of the plumbing. If you&apos;re a publisher or community and want every contributor
        paid this way, <Link href="/docs" className="link-accent">see how to integrate</Link>.
      </p>

      <footer className="mt-10 border-t border-[var(--rule)] pt-5 text-xs text-[var(--muted)]">
        Built by the Kuot team. <Link href="/" className="link-accent">What is this?</Link>
      </footer>
    </main>
  );
}
