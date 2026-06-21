import Link from "next/link";
import type { ResearchResult } from "@/lib/agent";
import { DownloadableReceipt } from "./DownloadableReceipt";
import { CopyCitationsButton } from "./CopyCitationsButton";

/**
 * Render text with clickable citations. Handles single AND grouped markers in
 * either bracket or caret form: [1], [4,9], ^1^, ^2,3,7^ → each number links to
 * its cited paper. Normalizes display to [n] / [n, m].
 */
export function CitedText({ text, works }: { text: string; works: { url: string; title: string }[] }) {
  const parts = (text ?? "").split(/(\[[\d,\s]+\]|\^[\d,\s]+\^)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^[[^]([\d,\s]+)[\]^]$/);
        if (m) {
          const nums = m[1].split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
          if (nums.length) {
            return (
              <span key={i}>
                [
                {nums.map((nStr, j) => {
                  const n = Number(nStr);
                  const w = works[n - 1];
                  return (
                    <span key={j}>
                      {j > 0 ? ", " : ""}
                      {w?.url ? (
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noreferrer"
                          title={(w.title ?? "").replace(/<[^>]+>/g, "")}
                          className="font-medium text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-500"
                        >
                          {n}
                        </a>
                      ) : (
                        n
                      )}
                    </span>
                  );
                })}
                ]
              </span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Read-only renderer for a finished research run — synthesis (clickable
 * citations), TL;DR, multi-agent trace, fact-check, web sources, and the author
 * payout plan. Shared by the dedicated result page and the public share page;
 * carries NO action buttons (settle/redeem/receipt live only on the workbench).
 */
export function ResultView({ result }: { result: ResearchResult }) {
  const works = result.works ?? [];
  return (
    <div className="space-y-5">
      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            result.venice === "live"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {result.venice === "live" ? "● Venice live" : "● Venice fallback (dev)"}
        </span>
        {result.x402?.paid ? (
          <a
            href={`https://testnet.arcscan.app/tx/${result.x402.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-medium text-blue-700 underline dark:bg-blue-950 dark:text-blue-300"
          >
            ● x402 paid {result.x402.amountUSDC} USDC ↗
          </a>
        ) : null}
        {result.searchTerms && result.searchTerms.toLowerCase() !== result.query.trim().toLowerCase() ? (
          <span className="text-[11px] text-[var(--muted)]">
            🔎 OpenAlex: <span className="font-medium text-[var(--accent)]">{result.searchTerms}</span>
          </span>
        ) : null}
      </div>

      {/* Synthesis */}
      <article className="whitespace-pre-wrap rounded-md bg-[var(--paper)] p-4 text-sm leading-relaxed text-[var(--ink)]/90">
        <CitedText text={result.synthesis} works={works} />
      </article>

      {/* TL;DR */}
      {result.summary ? (
        <div className="rounded-md bg-[var(--paper)] p-3">
          <h3 className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            Summarizer agent · TL;DR
          </h3>
          <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--ink)]/90">
            <CitedText text={result.summary} works={works} />
          </p>
        </div>
      ) : null}

      {/* Multi-agent trace */}
      {result.agentTrace?.length ? (
        <div className="rounded-md border border-[var(--rule)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="serif text-sm font-semibold">Multi-agent trace</h3>
            <div className="flex items-center gap-2 text-[10px]">
              {result.confidence ? (
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    result.confidence === "high"
                      ? "bg-emerald-100 text-emerald-700"
                      : result.confidence === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  confidence: {result.confidence}
                </span>
              ) : null}
              {result.rounds && result.rounds > 1 ? (
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700">
                  ↻ {result.rounds} rounds (revised)
                </span>
              ) : null}
            </div>
          </div>
          <ol className="mt-3 space-y-1.5">
            {result.agentTrace.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[11px]" style={{ marginLeft: s.redelegation ? "16px" : "0" }}>
                <span
                  className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.status === "rejected"
                      ? "bg-red-500"
                      : s.status === "revised"
                        ? "bg-indigo-500"
                        : s.status === "skipped"
                          ? "bg-neutral-300"
                          : "bg-emerald-500"
                  }`}
                />
                <div>
                  <span className="font-medium text-[var(--ink)]">{s.label}</span>{" "}
                  <span className="text-[var(--muted)]">· {s.action}</span>
                  {s.redelegation ? <span className="ml-1 text-[var(--accent)]">↳ redelegated</span> : null}
                  {typeof s.budgetUSDC === "number" ? (
                    <span className="ml-1 font-mono text-[10px] text-emerald-600">≤ {s.budgetUSDC.toFixed(2)} USDC</span>
                  ) : null}
                  <p className="text-[var(--ink)]/70">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Fact-checker */}
      {result.verification ? (
        <div className="rounded-md border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] p-4">
          <h3 className="serif text-sm font-semibold text-[var(--accent)]">
            ❝ Fact-checker agent {result.confidence ? `· ${result.confidence} confidence` : ""}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink)]/80">
            <CitedText text={result.verification} works={works} />
          </p>
        </div>
      ) : null}

      {/* Web sources */}
      {result.webCitations?.length ? (
        <div>
          <h3 className="text-xs font-medium text-neutral-500">Web sources (Venice)</h3>
          <ul className="mt-1 list-inside list-disc text-xs text-blue-600">
            {result.webCitations.slice(0, 6).map((c, i) => (
              <li key={i}>
                <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                  {c.title ?? c.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Author payout plan (read-only) */}
      <div>
        <h3 className="text-xs font-medium text-neutral-500">Author payout plan — every citation pays its author</h3>
        {typeof result.recommendedSettleUSDC === "number" ? (
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Weighted by the Citation-Matcher’s Venice embeddings · agent-recommended settle:{" "}
            <span className="font-medium text-[var(--accent)]">{result.recommendedSettleUSDC.toFixed(2)} USDC</span>{" "}
            (scaled by {result.confidence ?? "—"} confidence)
          </p>
        ) : null}
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-neutral-400">
            <tr>
              <th className="py-1 font-normal">Author</th>
              <th className="font-normal">Paper</th>
              <th className="text-right font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {result.payouts.map((p, i) => (
              <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                    {p.authorName}
                    {p.author && p.author !== "0x0000000000000000000000000000000000000000" ? (
                      <span
                        className={`rounded px-1 py-0.5 text-[9px] ${
                          p.claimed
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                        }`}
                      >
                        {p.claimed ? "claimed" : "demo"}
                      </span>
                    ) : null}
                  </div>
                  {p.author && p.author !== "0x0000000000000000000000000000000000000000" ? (
                    <Link
                      href={`/dashboard/authors/${p.author}`}
                      className="font-mono text-[10px] text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
                    >
                      {p.author}
                    </Link>
                  ) : null}
                </td>
                <td className="max-w-[180px] truncate pr-2" title={p.workTitle}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-500"
                  >
                    {p.workTitle}
                  </a>
                </td>
                <td className="text-right font-mono font-medium text-emerald-600">{(p.weightBps / 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.payouts.length === 0 ? <p className="mt-4 text-xs text-neutral-400">No authors to pay for this query.</p> : null}
      </div>

      {/* On-brand citation receipt (reproducible from saved data) + export */}
      {result.payouts.length > 0 ? (
        <div className="space-y-3 border-t border-[var(--rule)] pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-medium text-neutral-500">Citation receipt</h3>
            <CopyCitationsButton result={result} />
          </div>
          <DownloadableReceipt result={result} />
        </div>
      ) : null}
    </div>
  );
}
