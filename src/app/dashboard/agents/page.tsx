"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AGENT_MESH } from "@/lib/agents";

type Rep = Record<string, { address: string; reputation: number; trustMethod: string }>;

export default function AgentsPage() {
  const agents = AGENT_MESH.filter((a) => a.id !== "user");
  const [rep, setRep] = useState<Rep>({});
  const [registry, setRegistry] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setRep(d.agents ?? {});
        setRegistry(d.registry ?? null);
      })
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Multi-agent system</p>
      <h1 className="serif mt-1 text-3xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink)]/70">
        Kuot is a mesh of specialized agents. The Researcher holds the agent-wallet budget and
        <span className="serif italic"> redelegates</span> strictly narrower budgets to each
        specialist — authority only ever shrinks . Each is a real on-chain principal in the{" "}
        <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noreferrer" className="link-accent">
          ERC-8004
        </a>{" "}
        registry.
      </p>

      <div data-tour="agents-list" className="mt-7 space-y-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)]">
        {agents.map((a) => {
          const r = rep[a.id];
          return (
            <div key={a.id} className="bg-[var(--paper-2)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="serif text-lg font-semibold">{a.label}</h2>
                <div className="flex items-center gap-2">
                  {r ? (
                    <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]">
                      ★ reputation {r.reputation}
                    </span>
                  ) : null}
                  <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)]">
                    ≤ {(a.budgetFraction * 100).toFixed(0)}% budget
                  </span>
                  {a.model ? (
                    <span className="rounded bg-[var(--paper)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink)]/70" title="Venice model this agent reasons with">
                      🧠 {a.model}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-sm text-[var(--ink)]/70">{a.blurb}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {a.caveats.map((c) => (
                  <span key={c} className="rounded border border-[var(--rule)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    {c}
                  </span>
                ))}
              </div>
              {r ? (
                <div className="mt-2 font-mono text-[10px] text-[var(--muted)]">
                  {r.address} · trust: {r.trustMethod}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {registry ? (
        <p className="mt-6 text-xs text-[var(--muted)]">
          On-chain registry:{" "}
          <a
            href={`https://testnet.arcscan.app/address/${registry}`}
            target="_blank"
            rel="noreferrer"
            className="link-accent"
          >
            {registry.slice(0, 10)}…
          </a>{" "}
          · See the live delegation chain in{" "}
          <Link href="/dashboard/research" className="link-accent">
            Research
          </Link>
          .
        </p>
      ) : null}
    </main>
  );
}
