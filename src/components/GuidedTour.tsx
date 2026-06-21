"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TourStep = { selector: string; title: string; narration: string };

/** Pick the most natural English voice available (Google/Neural > others). */
function pickVoice(): SpeechSynthesisVoice | null {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return null;
  const vs = synth.getVoices();
  if (!vs.length) return null;
  const rank = (v: SpeechSynthesisVoice) => {
    const nm = v.name.toLowerCase();
    let s = 0;
    if (/google/.test(nm)) s += 6;
    if (/natural|neural|premium|enhanced|online/.test(nm)) s += 5;
    if (/(aria|jenny|guy|sonia|ryan|libby|emma|ava|samantha|daniel)/.test(nm)) s += 3;
    if (/microsoft/.test(nm)) s += 2;
    if (/en[-_]us/i.test(v.lang)) s += 2;
    else if (/^en/i.test(v.lang)) s += 1;
    return s;
  };
  return [...vs].filter((v) => /^en/i.test(v.lang)).sort((a, b) => rank(b) - rank(a))[0] ?? vs[0] ?? null;
}

/**
 * A narrated, spotlight "guided tour" — points at each result section in turn
 * (a moving highlight + caption), speaks the explanation via natural TTS, and
 * auto-advances. Screen-record it for a demo video with a pointer + subtitles.
 */
export function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const advanceRef = useRef<() => void>(() => {});

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const load = () => (voiceRef.current = pickVoice());
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  const close = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    onClose();
  }, [onClose]);

  const advance = useCallback(() => {
    setIdx((x) => {
      if (x < steps.length - 1) return x + 1;
      close();
      return x;
    });
  }, [steps.length, close]);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  // Spotlight + narrate the current step.
  useEffect(() => {
    const step = steps[idx];
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      advanceRef.current();
      return;
    }
    // Expand any collapsed <details> (the target itself or an ancestor) so it shows.
    let d: HTMLElement | null = el;
    while (d) {
      if (d.tagName === "DETAILS") (d as HTMLDetailsElement).open = true;
      d = d.parentElement;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => {
      setRect(el.getBoundingClientRect());
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (synth) {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(step.narration);
        u.rate = 0.98;
        if (voiceRef.current) u.voice = voiceRef.current;
        u.onend = () => advanceRef.current();
        synth.speak(u);
      }
    }, 550);
    return () => clearTimeout(t);
  }, [idx, steps]);

  // Re-measure on resize/scroll so the spotlight tracks the element.
  useEffect(() => {
    const step = steps[idx];
    const remeasure = () => {
      const el = step ? (document.querySelector(step.selector) as HTMLElement | null) : null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [idx, steps]);

  if (!mounted) return null;
  const step = steps[idx];
  const pad = 8;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Spotlight: dim everything except a hole around the target element. */}
      {rect ? (
        <>
          <div
            className="pointer-events-none absolute rounded-xl ring-2 ring-[var(--accent)] transition-all duration-300"
            style={{
              top: rect.top - pad,
              left: rect.left - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
            }}
          />
          {/* Visible animated finger pointer at the top-left corner of the target. */}
          <div
            className="pointer-events-none absolute animate-bounce text-2xl"
            style={{ top: rect.top - pad - 24, left: rect.left - pad - 6 }}
          >
            👉
          </div>
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* Caption / subtitle + controls. */}
      <div className="absolute inset-x-0 bottom-0 z-[101] flex justify-center p-4">
        <div className="w-full max-w-2xl rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
              {step?.title} · {idx + 1}/{steps.length}
            </span>
            <button onClick={close} className="text-[11px] text-[var(--muted)] hover:text-red-600">
              ✕ end tour
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-snug text-[var(--ink)]">{step?.narration}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setIdx((x) => Math.max(0, x - 1))}
              disabled={idx === 0}
              className="rounded-md border border-[var(--rule)] px-2.5 py-1 text-[11px] disabled:opacity-40"
            >
              ← back
            </button>
            <button
              onClick={() => advanceRef.current()}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-white"
            >
              {idx === steps.length - 1 ? "Finish" : "Next →"}
            </button>
            <span className="ml-auto text-[10px] text-[var(--muted)]">narrating… auto-advances</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
