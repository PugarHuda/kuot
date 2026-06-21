import type { ResearchResult } from "@/lib/agent";

/**
 * On-brand "Citations Paid" receipt — a deterministic HTML/CSS card rendered from
 * the saved run (query, author count, settled amount, top authors). Unlike the
 * Venice-generated image (which varies), this ALWAYS matches the app design and
 * is reproducible from stored data, so it shows identically on the workbench, the
 * saved-result page, and the public share page. No network, no hooks.
 */
export function ReceiptCard({ result, settled = false }: { result: ResearchResult; settled?: boolean }) {
  const settle = typeof result.recommendedSettleUSDC === "number" ? result.recommendedSettleUSDC : 0.5;
  const authors = result.payouts ?? [];
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl border border-emerald-300/70 bg-gradient-to-b from-[var(--paper)] to-[var(--paper-2)] shadow-sm dark:border-emerald-900">
      <div className="flex items-center justify-between border-b border-emerald-200/70 px-5 py-3 dark:border-emerald-900">
        <div>
          <p className="text-[9px] uppercase tracking-[0.25em] text-[var(--muted)]">Kuot</p>
          {/* Honest wording: only say "Paid" once a settlement actually happened. */}
          <h4 className="serif text-xl font-semibold text-[var(--accent)]">
            {settled ? "Citations Paid" : "Citation Receipt"}
          </h4>
        </div>
        <span className="serif text-2xl text-[var(--accent)]/40">❝</span>
      </div>
      <div className="space-y-3 px-5 py-4 text-xs">
        <p className="line-clamp-2 italic text-[var(--ink)]/80">“{result.query}”</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-[var(--paper)] p-2 text-center">
            <div className="serif text-lg font-semibold">{authors.length}</div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">authors cited</div>
          </div>
          <div className="rounded-md bg-[var(--paper)] p-2 text-center">
            <div className="serif text-lg font-semibold text-emerald-600">{settle.toFixed(2)}</div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
              {settled ? "USDC settled" : "USDC to settle"}
            </div>
          </div>
        </div>
        {authors.length > 0 ? (
          <ul className="space-y-0.5">
            {authors.slice(0, 3).map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate text-[var(--ink)]/80">{p.authorName}</span>
                <span className="font-mono text-emerald-600">{(p.weightBps / 100).toFixed(1)}%</span>
              </li>
            ))}
            {authors.length > 3 ? (
              <li className="text-[10px] text-[var(--muted)]">+ {authors.length - 3} more</li>
            ) : null}
          </ul>
        ) : null}
        <p className="border-t border-[var(--rule)] pt-2 text-[10px] text-[var(--muted)]">
          {settled
            ? `Every citation paid its source${result.confidence ? ` · ${result.confidence} confidence` : ""}.`
            : `Settle to pay each cited source${result.confidence ? ` · ${result.confidence} confidence` : ""}.`}
        </p>
      </div>
    </div>
  );
}
