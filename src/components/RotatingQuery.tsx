"use client";

import { useEffect, useState } from "react";

/**
 * A small "agent input" that types out example research questions, pauses, then
 * deletes and moves to the next — a live, dynamic hint of what you can ask.
 * Deterministic initial render (empty) so there is no hydration mismatch.
 */
const QUERIES = [
  "perovskite solar cell stability",
  "CRISPR off-target effects in vivo",
  "automation tools n8n for social media",
  "gut microbiome and immunotherapy",
  "LLM hallucination mitigation via retrieval",
];

export function RotatingQuery() {
  const [text, setText] = useState("");
  const [qi, setQi] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(QUERIES[0]);
      return;
    }
    const full = QUERIES[qi];
    let delay = deleting ? 35 : 70;
    if (!deleting && text === full) delay = 1500; // pause at full
    if (deleting && text === "") delay = 250;

    const t = setTimeout(() => {
      if (!deleting && text === full) {
        setDeleting(true);
      } else if (deleting && text === "") {
        setDeleting(false);
        setQi((i) => (i + 1) % QUERIES.length);
      } else {
        setText(full.slice(0, deleting ? text.length - 1 : text.length + 1));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [text, deleting, qi]);

  return (
    <div className="mt-6 inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--paper-2)]/85 px-3 py-2 shadow-sm backdrop-blur-sm">
      <span className="text-[var(--accent)]">❝</span>
      <span className="truncate font-mono text-sm text-[var(--ink)]/90">
        {text || " "}
        <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-[var(--accent)] align-middle" style={{ height: "1em" }} />
      </span>
    </div>
  );
}
