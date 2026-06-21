import Link from "next/link";

/**
 * Closing call-to-action band — a Venice-generated anime desk scene (papers with
 * golden coins spilling onto them: "cite AND pay") with a slow Ken Burns drift,
 * a warm scrim for legibility, and the final CTAs. Ties the room theme together.
 */
export function ClosingBand() {
  return (
    <section className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--rule)]">
      {/* moving illustration */}
      <div
        aria-hidden
        className="ken-burns absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/band-1.webp')" }}
      />
      {/* warm scrim: readable on the left, image breathes through on the right */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(20,17,12,0.86) 0%, rgba(20,17,12,0.66) 38%, rgba(20,17,12,0.18) 66%, transparent 100%)",
        }}
      />

      <div className="relative px-7 py-12 sm:px-12 sm:py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f3d9a4]">
          Cite it. Pay it.
        </p>
        <h2 className="serif mt-2 max-w-xl text-3xl font-semibold text-[#fdfbf4] sm:text-4xl">
          Every citation, a real payment.
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[#f1ede2]/85">
          Grant one scoped budget and let the agent research, cite, and pay the humans behind the
          work — on-chain, non-custodial. The papers, and the coins, are real.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/dashboard/research"
            className="group rounded-md bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-95 hover:shadow-[0_10px_28px_-8px_rgba(255,205,120,0.8)]"
          >
            Run a query <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link
            href="/dashboard/claim"
            className="rounded-md border border-[#fdfbf4]/40 px-6 py-3 text-sm font-medium text-[#fdfbf4] transition hover:border-[#fdfbf4] hover:bg-[#fdfbf4]/10"
          >
            Claim your wallet (authors)
          </Link>
        </div>
      </div>
    </section>
  );
}
