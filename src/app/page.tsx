import Link from "next/link";
import { LandingStats } from "@/components/LandingStats";
import { AgentTracePreview } from "@/components/AgentTracePreview";
import { ClosingBand } from "@/components/ClosingBand";
import { RoomHero } from "@/components/RoomHero";
import { RotatingQuery } from "@/components/RotatingQuery";
import { Reveal } from "@/components/Reveal";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center overflow-hidden px-6 py-20">
      <div className="paper-grid pointer-events-none absolute inset-0 -z-10" />
      <RoomHero />

      {/* Hero — copy over the anime study-room illustration */}
      <section className="w-full max-w-5xl">
        <div className="fade-up max-w-2xl text-center lg:mr-auto lg:max-w-xl lg:text-left">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Circle Agent Stack · Gateway · Arc
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              live on Arc
            </span>
          </div>

          <div className="relative mt-6 flex items-center justify-center gap-3 lg:justify-start">
            <div className="hero-glow pointer-events-none absolute -left-6 -top-4 h-28 w-44" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Kuot logo" width={48} height={48} className="relative" />
            <h1 className="serif relative text-6xl font-semibold tracking-tight sm:text-7xl">Kuot</h1>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-[var(--ink)]/85 lg:mx-0">
            The recursive citation economy{" "}
            <span className="serif italic text-[var(--accent)]">on Arc</span>. An AI agent pays for the
            papers it reads with x402 nanopayments, then splits USDC back to the authors whose work
            grounded the answer. Cite Kuot, and a fraction flows back again — depth after depth.
          </p>

          <RotatingQuery />

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link
              href="/dashboard"
              className="group rounded-md bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-95 hover:shadow-[0_10px_28px_-8px_color-mix(in_srgb,var(--gold)_70%,transparent)]"
            >
              Open the dashboard <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/dashboard/claim"
              className="rounded-md border border-[var(--rule)] px-6 py-3 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Claim your payouts (authors)
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-[var(--muted)] lg:justify-start">
            <span>New here?</span>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--rule)] px-3 py-1 font-medium text-[var(--ink)]/80 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              📖 Read the docs
            </Link>
          </div>
        </div>
      </section>

      <div className="fade-up" style={{ animationDelay: "0.2s" }}>
        <LandingStats />
      </div>

      {/* One run, end to end */}
      <Reveal className="mt-16 w-full max-w-4xl">
        <AgentTracePreview />
      </Reveal>

      <hr className="my-16 w-full max-w-2xl border-[var(--rule)]" />

      {/* How it works */}
      <section className="w-full max-w-4xl">
        <p className="mb-6 text-center text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">How it works</p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {[
            {
              icon: "🛰️",
              img: "/step-grant.webp",
              n: "I",
              t: "Pay the sources",
              d: "The agent buys each paper it needs with an x402 nanopayment, settled on Arc in USDC — gas-free and sub-cent via Circle Gateway. A budget cap it can never exceed.",
              tag: "x402 · Gateway",
            },
            {
              icon: "🧠",
              img: "/step-agents.webp",
              n: "II",
              t: "Ground the answer",
              d: "A Planner, parallel Readers and a Fact-checker reason over the papers. Proof-of-grounding commits a tamper-evident digest on-chain, so only authors whose work grounded the answer get paid.",
              tag: "proof-of-grounding",
            },
            {
              icon: "🔁",
              img: "/step-pay.webp",
              n: "III",
              t: "Authors paid — then paid again",
              d: "Every citation pays its author a nanopayment. Unclaimed shares earn real USYC yield until they claim with ORCID. When another agent cites Kuot, a fraction flows recursively back to the originals.",
              tag: "reverse-x402 · USYC",
            },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 0.12} className="flex flex-1 items-stretch">
              <div className="group flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--paper-2)] text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-[0_16px_40px_-16px_color-mix(in_srgb,var(--gold)_55%,transparent)]">
                <div className="relative h-28 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.img}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, var(--paper-2), transparent 55%)" }} />
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-[var(--paper-2)]/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)] backdrop-blur-sm">
                    Step {s.n}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5 pt-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg">{s.icon}</span>
                  <h3 className="serif text-lg font-semibold leading-tight">{s.t}</h3>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--ink)]/75">{s.d}</p>
                <div className="mt-3 inline-flex w-fit rounded-full bg-[var(--paper)] px-2.5 py-1 font-mono text-[10px] text-[var(--muted)]">
                  {s.tag}
                </div>
                </div>
              </div>
              {i < 2 ? (
                <div className="flex items-center justify-center px-1 text-[var(--accent)]/50">
                  <span className="hidden text-xl sm:inline">→</span>
                  <span className="text-xl sm:hidden">↓</span>
                </div>
              ) : null}
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why it's different */}
      <section className="mt-16 w-full max-w-4xl">
        <p className="mb-6 text-center text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Why it&apos;s different</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: "🔁", t: "Recursive reverse-x402", d: "Being cited earns money. When an agent grounds an answer in Kuot's work it pays Kuot, and a fraction flows back to the original authors — the citation graph pays itself, depth after depth." },
            { icon: "🧾", t: "Proof-of-grounding before pay", d: "A keccak256 digest of the answer is committed on-chain. Only authors whose work actually grounded it are paid — closing the x402 pay-then-maybe-delivered gap." },
            { icon: "🌱", t: "Real yield, real stakes", d: "Unclaimed rewards earn USYC treasury yield until the author claims. Reputation is USDC posted as collateral (ERC-8004), slashable on a false citation — not a number you ask to be trusted." },
          ].map((v, i) => (
            <Reveal key={v.t} delay={i * 0.1}>
              <div className="h-full rounded-xl border border-[var(--rule)] bg-[var(--paper-2)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-[0_16px_40px_-16px_color-mix(in_srgb,var(--gold)_55%,transparent)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-xl">{v.icon}</span>
                <h3 className="serif mt-3 text-base font-semibold">{v.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink)]/70">{v.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Proof line */}
      <section className="mt-12 w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center text-xs text-[var(--muted)]">
          {[
            "x402 nanopayments on Arc",
            "Circle Gateway batched",
            "proof-of-grounding on-chain",
            "USYC yield on unclaimed",
            "reverse-x402 recursive",
            "ERC-8004 · ORCID",
          ].map((p, i) => (
            <span key={p}>
              {i > 0 ? <span className="mr-5 text-[var(--accent)]">·</span> : null}
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Closing CTA band */}
      <Reveal className="mt-16 w-full max-w-5xl">
        <ClosingBand />
      </Reveal>

      <footer className="mt-16 text-xs text-[var(--muted)]">
        Built for the Lepton Agents Hackathon · Canteen × Circle × Arc ·{" "}
        <a href="https://github.com/PugarHuda/kuot" className="link-accent">
          GitHub
        </a>{" "}
        ·{" "}
        <Link href="/docs" className="link-accent">
          Docs
        </Link>{" "}
        ·{" "}
        <Link href="/slide" className="link-accent">
          Pitch deck
        </Link>
      </footer>
    </div>
  );
}
