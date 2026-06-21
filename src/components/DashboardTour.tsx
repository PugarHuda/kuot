"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

/** Pick the most natural English voice available. */
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

type Step = { href: string; selector: string; title: string; narration: string };

/** A detailed guided tour of EVERY sidebar section AND what's inside each page.
 *  It navigates page to page (interactive, like clicking the nav), spotlights the
 *  sidebar item, then walks the key parts of that page one by one with a visible
 *  pointer + spoken narration. Start it with
 *  `window.dispatchEvent(new Event("kuot:start-tour"))`. */
const STEPS: Step[] = [
  // ── Overview ──
  { href: "/dashboard", selector: 'aside a[href="/dashboard"]', title: "Overview", narration: "Welcome to Kuot — the research agent that cites and pays its sources. Let's walk the whole product. We start on Overview." },
  { href: "/dashboard", selector: '[data-tour="ov-stats"]', title: "Overview · live stats", narration: "These four tiles are live on-chain reads from Arc: how many attestations were recorded, how many author payouts went out, the total U.S.D.C. attributed to authors, and how many distinct authors have been cited. Nothing here is hard-coded." },
  { href: "/dashboard", selector: '[data-tour="ov-actions"]', title: "Overview · quick actions", narration: "Below that are quick actions — jump straight into running a query, viewing on-chain activity, or claiming rewards as an author." },
  { href: "/dashboard", selector: '[data-tour="ov-recent"]', title: "Overview · recent attestations", narration: "And the latest attestations, newest first. Each row links to the real transaction on Etherscan — the citation, and the payment, are the same on-chain record." },

  // ── Research ──
  { href: "/dashboard/research", selector: 'aside a[href="/dashboard/research"]', title: "Research", narration: "Research is the heart of it — where you grant a budget, ask a question, and the agents answer and pay. Let's look at the pieces." },
  { href: "/dashboard/research", selector: '[data-tour="stepper"]', title: "Research · the three steps", narration: "The flow is three steps: grant a budget, run the research, then settle and pay the authors. This stepper tracks where you are." },
  { href: "/dashboard/research", selector: '[data-tour="budget"]', title: "Research · grant a budget", narration: "Step one — you sign one E.R.C. seventy-seven-fifteen Advanced Permission: a scoped U.S.D.C. budget the agent can never exceed. Nothing leaves your wallet; it's a cap, with a live countdown until it expires. A custodial lock-upfront mode is offered as an opt-in." },
  { href: "/dashboard/research", selector: '[data-tour="mesh"]', title: "Research · the agent mesh", narration: "The Researcher then redelegates strictly narrower slices of that budget to each specialist — authority only ever shrinks. That's real agent-to-agent coordination over E.R.C. seventy-seven-ten." },
  { href: "/dashboard/research", selector: '[data-tour="ask"]', title: "Research · ask anything", narration: "Step two — ask your question. You pick how many papers, an optional year range, and the answer language. There's even auto-pay, which settles the authors on-chain the moment a run finishes. After a run, hit Explain this result for a deeper step-by-step tour of the answer." },

  // ── Library ──
  { href: "/dashboard/library", selector: 'aside a[href="/dashboard/library"]', title: "Library", narration: "Every finished run is saved in your Library." },
  { href: "/dashboard/library", selector: '[data-tour="lib-list"]', title: "Library · your runs", narration: "Each card keeps the full synthesis, the agent trace, the cited journals, and the payout plan — re-openable without re-paying. Use the search box and confidence filter at the top to find any past run instantly. The on-chain attestation stays the canonical paid record." },

  // ── Agents ──
  { href: "/dashboard/agents", selector: 'aside a[href="/dashboard/agents"]', title: "Agents", narration: "The Agents page shows the mesh itself." },
  { href: "/dashboard/agents", selector: '[data-tour="agents-list"]', title: "Agents · five specialists", narration: "Five specialists — Researcher, Planner, Reader, Fact-checker, and Summarizer. Each shows its maximum budget fraction, the Venice model it reasons with, and a live reputation score it earns on-chain in the E.R.C. eighty-oh-four registry as it works." },

  // ── Bounties ──
  { href: "/dashboard/bounties", selector: 'aside a[href="/dashboard/bounties"]', title: "Bounties", narration: "Bounties let anyone fund a research topic." },
  { href: "/dashboard/bounties", selector: '[data-tour="bounty-form"]', title: "Bounties · sponsor a topic", narration: "Type a topic, set a U.S.D.C. amount, and fund it. When Kuot satisfies it, that deposit is paid straight to the cited authors — with no platform fee." },
  { href: "/dashboard/bounties", selector: '[data-tour="bounty-list"]', title: "Bounties · open & settled", narration: "Here are the open and settled bounties, read from the BountyMarket contract. Anything still unsettled is refundable after seven days." },

  // ── Claim earnings ──
  { href: "/dashboard/claim", selector: 'aside a[href="/dashboard/claim"]', title: "Claim earnings", narration: "Claim earnings is where authors get paid." },
  { href: "/dashboard/claim", selector: '[data-tour="claim-card"]', title: "Claim · prove, bind, withdraw", narration: "An author connects their wallet, proves their ORCID by OAuth, and binds the two with a single signature — the operator relays the on-chain link. Their owed balance grows every time they're cited, and earns a twelve-percent citation-loyalty yield that ticks up live until they withdraw." },

  // ── Activity ──
  { href: "/dashboard/activity", selector: 'aside a[href="/dashboard/activity"]', title: "Activity", narration: "Finally, Activity — everything in the open." },
  { href: "/dashboard/activity", selector: '[data-tour="act-leaderboard"]', title: "Activity · leaderboard", narration: "A leaderboard of the most-cited authors, ranked by U.S.D.C. earned — each links to that author's profile." },
  { href: "/dashboard/activity", selector: '[data-tour="act-recent"]', title: "Activity · on-chain proof", narration: "And a live feed of every attestation on-chain. That's the whole loop: Kuot researches, cites, and pays — every citation a real payment. Thanks for taking the tour." },
];

export function DashboardTour() {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const advanceRef = useRef<() => void>(() => {});

  useEffect(() => {
    const start = () => {
      setIdx(0);
      setActive(true);
    };
    window.addEventListener("kuot:start-tour", start);
    return () => window.removeEventListener("kuot:start-tour", start);
  }, []);

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
    setActive(false);
    setRect(null);
  }, []);

  const advance = useCallback(() => {
    setIdx((x) => {
      if (x < STEPS.length - 1) return x + 1;
      close();
      return x;
    });
  }, [close]);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  // Navigate (if needed), then spotlight + narrate the current section.
  useEffect(() => {
    if (!active) return;
    const step = STEPS[idx];
    if (!step) return;
    if (pathname !== step.href) {
      router.push(step.href);
      return; // effect re-runs when pathname updates
    }
    const t = setTimeout(() => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (synth) {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(step.narration);
        u.rate = 0.98;
        if (voiceRef.current) u.voice = voiceRef.current;
        u.onend = () => advanceRef.current();
        synth.speak(u);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [active, idx, pathname, router]);

  // Track the highlighted element on scroll/resize.
  useEffect(() => {
    if (!active) return;
    const remeasure = () => {
      const el = document.querySelector(STEPS[idx]?.selector ?? "") as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [active, idx]);

  if (!active || typeof document === "undefined") return null;
  const step = STEPS[idx];
  const pad = 6;

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      {/* Dim + spotlight on the current nav item. */}
      {rect ? (
        <>
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-[var(--accent)] transition-all duration-300"
            style={{
              top: rect.top - pad,
              left: rect.left - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            }}
          />
          {/* Visible animated pointer: from the right for the narrow sidebar item,
              from the top-left corner for wider in-page content blocks. */}
          {rect.left < 248 ? (
            <div
              className="pointer-events-none absolute animate-bounce text-2xl"
              style={{ top: rect.top + rect.height / 2 - 14, left: rect.left + rect.width + 6 }}
            >
              👉
            </div>
          ) : (
            <div
              className="pointer-events-none absolute animate-bounce text-2xl"
              style={{ top: rect.top - 30, left: rect.left - 4 }}
            >
              👇
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-black/50" />
      )}

      {/* Caption + controls. */}
      <div className="absolute inset-x-0 bottom-0 z-[121] flex justify-center p-4">
        <div className="w-full max-w-2xl rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
              {step?.title} · {idx + 1}/{STEPS.length}
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
              {idx === STEPS.length - 1 ? "Finish" : "Next →"}
            </button>
            <span className="ml-auto text-[10px] text-[var(--muted)]">narrating… auto-advances</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
