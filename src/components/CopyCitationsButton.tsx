"use client";

import { useState } from "react";
import type { ResearchResult } from "@/lib/agent";

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

/**
 * Copy the cited works as a plain-text reference list (numbered, matching the
 * [n] markers in the synthesis). Falls back to the unique papers in the payout
 * plan when the trimmed `works` list isn't present (e.g. on the shared page).
 */
export function CopyCitationsButton({ result }: { result: ResearchResult }) {
  const [copied, setCopied] = useState(false);

  function buildReferences(): string {
    const works = result.works ?? [];
    let lines: string[];
    if (works.length > 0) {
      lines = works.map((w, i) => `[${i + 1}] ${stripTags(w.title)}${w.year ? ` (${w.year})` : ""}. ${w.url}`);
    } else {
      // Derive unique papers from the payout plan (title + url).
      const seen = new Set<string>();
      lines = [];
      for (const p of result.payouts ?? []) {
        const key = p.workTitle.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`[${lines.length + 1}] ${stripTags(p.workTitle)}. ${p.url}`);
      }
    }
    return `Sources cited by Kuot — "${result.query}"\n\n${lines.join("\n")}`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildReferences());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const count = (result.works?.length ?? 0) || new Set((result.payouts ?? []).map((p) => p.workTitle.toLowerCase())).size;
  if (count === 0) return null;

  return (
    <button
      onClick={copy}
      className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {copied ? "✓ Copied" : `Copy citations (${count})`}
    </button>
  );
}
