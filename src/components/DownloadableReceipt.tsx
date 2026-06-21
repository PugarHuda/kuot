"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { ResearchResult } from "@/lib/agent";
import { ReceiptCard } from "./ReceiptCard";

/**
 * The on-brand ReceiptCard plus a "Download PNG" action. The image is rendered
 * deterministically from the DOM (html-to-image), so it ALWAYS matches the app
 * design — unlike the Venice-generated art, which is non-deterministic. Gives a
 * shareable receipt image without depending on Venice credit.
 */
export function DownloadableReceipt({ result, settled = false }: { result: ResearchResult; settled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        pixelRatio: 2,
        // Capture the card's own paper background (the node is transparent otherwise).
        backgroundColor: getComputedStyle(document.body).getPropertyValue("--paper")?.trim() || "#faf8f3",
      });
      const a = document.createElement("a");
      a.download = `kuot-receipt-${result.query.slice(0, 24).replace(/\W+/g, "-").toLowerCase()}.png`;
      a.href = dataUrl;
      a.click();
    } catch {
      /* rendering blocked — no-op */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div ref={ref} className="w-fit">
        <ReceiptCard result={result} settled={settled} />
      </div>
      <button
        onClick={download}
        disabled={busy}
        className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy ? "Rendering…" : "⬇ Download receipt (PNG)"}
      </button>
    </div>
  );
}
