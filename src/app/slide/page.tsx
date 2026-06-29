"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pitch deck — Kuot (/slide)
 * Keyboard (← → / Space), click (right half = next, left = prev), or the dots.
 * Editorial theme, full-bleed slides. Press F for fullscreen.
 */

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--accent)]">{children}</p>;
}
function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-md border border-[var(--rule)] bg-[var(--paper-2)] px-5 py-4 text-center">
      <div className="serif text-3xl font-semibold text-[var(--accent)]">{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">{k}</div>
    </div>
  );
}

const SLIDES: { id: string; render: React.ReactNode }[] = [
  {
    id: "title",
    render: (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={64} height={64} className="mx-auto" />
        <h1 className="serif mt-6 text-6xl font-semibold tracking-tight sm:text-7xl">Kuot</h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-xl leading-relaxed text-[var(--ink)]/85">
          The recursive citation economy <span className="serif italic text-[var(--accent)]">on Arc</span>.
        </p>
        <p className="mt-8 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Lepton Agents Hackathon · Canteen × Circle × Arc
        </p>
      </div>
    ),
  },
  {
    id: "problem",
    render: (
      <div className="max-w-2xl">
        <Kicker>The problem</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
          AI scrapes humanity&apos;s research and pays the authors{" "}
          <span className="text-[var(--accent)]">nothing</span>.
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-[var(--ink)]/75">
          Every model is built on papers, datasets, and writing by real people who are never cited,
          never credited, and never paid. The incentive to share knowledge quietly erodes.
        </p>
      </div>
    ),
  },
  {
    id: "solution",
    render: (
      <div className="max-w-2xl">
        <Kicker>The solution</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
          An agent that cites <span className="text-[var(--accent)]">and pays</span>.
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-[var(--ink)]/75">
          The agent runs under a strict spending cap. Kuot buys the papers it needs, reads them with Venice,
          and splits USDC back to <b>every author it cites</b> — gas-free, non-custodial, and recorded
          on-chain. Every citation becomes a payment.
        </p>
      </div>
    ),
  },
  {
    id: "permission",
    render: (
      <div className="max-w-2xl">
        <Kicker>One signature · the UX</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">
          Sign once. The agent can never overspend.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-[var(--ink)]/75">
          A single <b>Circle Agent Wallet spending policy</b> (Circle Agent Stack):
          <span className="text-[var(--accent)]"> &ldquo;up to 10 USDC per day — a cap it can never exceed.&rdquo;</span>{" "}
          The cap and the window are one number — the agent draws ~0.01 USDC per paper and never exceeds it.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {["Hard cap", "Auto-expiry", "Full custody", "No blanket approval", "No per-action popups"].map((t) => (
            <span key={t} className="rounded-md border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-1.5">
              {t}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "mesh",
    render: (
      <div className="w-full max-w-2xl">
        <Kicker>A2A coordination</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">A mesh, not a script.</h2>
        <p className="mt-4 text-base text-[var(--ink)]/75">
          The Researcher redelegates strictly narrower budgets to each specialist. Authority only ever shrinks.
        </p>
        <ol className="mt-5 space-y-1.5 text-sm">
          {[
            ["You → Researcher", "full budget · Agent Wallet policy"],
            ["↳ Planner", "splits the question into sub-questions"],
            ["↳ Reader fan-out", "one parallel agent per sub-question (budget-scaled)"],
            ["↳ Citation-Matcher", "Venice embeddings → relevance-weighted payouts"],
            ["↳ Fact-checker", "can REJECT → forces a Researcher revision"],
            ["↳ Summarizer", "smallest, shortest-lived sub-budget"],
          ].map(([a, b], i) => (
            <li key={a} className="flex items-baseline gap-3 rounded-md bg-[var(--paper-2)] px-3 py-2" style={{ marginLeft: `${Math.min(i, 4) * 14}px` }}>
              <span className="font-medium text-[var(--ink)]">{a}</span>
              <span className="text-[var(--muted)]">— {b}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-[var(--muted)]">5 real on-chain principals (ERC-8004) that earn reputation as they work.</p>
      </div>
    ),
  },
  {
    id: "venice",
    render: (
      <div className="max-w-2xl">
        <Kicker>Venice AI · the brain</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">The agents&apos; brain — private &amp; uncensored.</h2>
        <p className="mt-5 text-lg leading-relaxed text-[var(--ink)]/75">
          Five Venice endpoints, in the main flow:
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {["chat", "web search", "embeddings", "image", "text-to-speech"].map((t) => (
            <span key={t} className="rounded-md border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2 text-center">
              {t}
            </span>
          ))}
        </div>
        <p className="mt-5 text-base text-[var(--ink)]/75">
          Embeddings don&apos;t just dedup — they <b>weight who gets paid</b>. Uncensored = research anything.
        </p>
      </div>
    ),
  },
  {
    id: "pay",
    render: (
      <div className="max-w-2xl">
        <Kicker>x402 + Circle Gateway · the rails</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">Authors get paid — gas-free, on mainnet.</h2>
        <ul className="mt-5 space-y-3 text-base text-[var(--ink)]/80">
          <li>💸 <b>x402</b> — the agent pays a real USDC micropayment to unlock papers, verified on-chain.</li>
          <li>⛽ <b>Circle Gateway</b> — payouts settled gas-free, batched on <b>Arc</b> . Gas paid in USDC.</li>
          <li>📜 <b>On-chain attestation</b> — <i>attestAndSplit</i> records who&apos;s owed <b>and</b> pays them in one tx. The contract blocks re-attesting, so each author is paid <b>once</b>.</li>
          <li>🪪 <b>ORCID claim</b> — unclaimed shares wait in escrow until the author binds their wallet. Zero gas for them.</li>
        </ul>
      </div>
    ),
  },
  {
    id: "settlement",
    render: (
      <div className="w-full max-w-2xl">
        <Kicker>Four ways to settle · one product</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">Non-custodial by default. Pay your way.</h2>
        <p className="mt-4 text-base text-[var(--ink)]/75">
          Authors are paid on Arc — pick the settlement path:
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {[
            ["Direct (primary)", "attestAndSplit — records + pays in one tx, atomic"],
            ["Circle Gateway relay", "gas-free, gas paid in USDC (Arc or Base Arc)"],
            ["Escrow → ORCID", "hold unclaimed shares for authors to claim later"],
            ["Auto-pay / Upfront", "settle on finish, or lock the pool first (lock-upfront)"],
          ].map(([t, d]) => (
            <li key={t} className="flex items-baseline justify-between gap-3 rounded-md bg-[var(--paper-2)] px-4 py-2.5">
              <span className="font-medium text-[var(--accent)]">{t}</span>
              <span className="text-right text-[var(--muted)]">{d}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: "proof",
    render: (
      <div className="w-full max-w-3xl">
        <Kicker>It&apos;s all real</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">No mocks in the critical path.</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat v="8" k="contracts live" />
          <Stat v="131" k="tests green" />
          <Stat v="5" k="on-chain agents" />
          <Stat v="19" k="author payouts" />
        </div>
        <p className="mt-6 text-sm text-[var(--ink)]/75">
          Circle Gateway Gateway-batched relay on Base:{" "}
          <span className="font-mono text-[var(--accent)]">0x6f4c8d53…8480c</span> (type 0x4, gas in USDC).
          x402 nanopayments on Arc · proof-of-grounding · USYC yield · ERC-8004 reputation · ORCID.
        </p>
      </div>
    ),
  },
  {
    id: "tracks",
    render: (
      <div className="w-full max-w-2xl">
        <Kicker>Track coverage</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">One product. Every track.</h2>
        <ul className="mt-5 space-y-2 text-sm">
          {[
            ["Autonomous Paying Agents (RFB-1)", "agent pays papers via x402 on Arc"],
            ["Agent-to-Agent (RFB-3)", "recursive reverse-x402 + reject/revise loop"],
            ["Creator Monetization (RFB-6)", "per-citation payouts + USYC yield"],
            ["Proof-of-grounding", "only grounding authors are paid"],
            ["Circle Gateway", "batched nanopayments, settled on Arc ✓"],
          ].map(([t, d]) => (
            <li key={t} className="flex items-baseline justify-between gap-3 rounded-md bg-[var(--paper-2)] px-4 py-2.5">
              <span className="font-medium text-[var(--accent)]">{t}</span>
              <span className="text-right text-[var(--muted)]">{d}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: "demo",
    render: (
      <div className="max-w-2xl">
        <Kicker>See it yourself</Kicker>
        <h2 className="serif mt-4 text-4xl font-semibold leading-tight">A live app that explains itself.</h2>
        <p className="mt-5 text-lg leading-relaxed text-[var(--ink)]/75">
          Open the dashboard and hit <b>&ldquo;Take the guided tour&rdquo;</b> — an interactive, narrated walkthrough
          that <b>points at and explains every feature</b>, navigating section to section on its own. Each research
          run also has an <b>&ldquo;Explain this result&rdquo;</b> deep-dive. Cozy, anime-styled, and fully on-chain.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {["Interactive guided tour", "Pointer + natural voice", "Live on-chain stats", "Searchable library", "Self-narrating"].map((t) => (
            <span key={t} className="rounded-md border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-1.5">
              {t}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "close",
    render: (
      <div className="max-w-2xl text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={52} height={52} className="mx-auto" />
        <h2 className="serif mt-6 text-5xl font-semibold leading-tight">
          An agent that pays the people it learns from.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link href="/dashboard" className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium text-white">
            Open the live app →
          </Link>
          <a href="https://github.com/PugarHuda/kuot" className="rounded-md border border-[var(--rule)] px-5 py-2.5 font-medium">
            GitHub
          </a>
        </div>
        <p className="mt-6 font-mono text-xs text-[var(--muted)]">kuot.vercel.app</p>
      </div>
    ),
  },
];

/** Voiceover narration per slide (also rendered as on-screen subtitles). */
const NARRATION: Record<string, string> = {
  title:
    "Kuot — the recursive citation economy on Arc. Built for the Lepton Agents Hackathon — Canteen, Circle, and Arc.",
  problem:
    "Here's the problem. A.I. scrapes humanity's research and pays the authors nothing. Every model is built on papers by real people who are never cited, credited, or paid. The incentive to share knowledge quietly erodes.",
  solution:
    "Our solution: an agent that pays its sources. Kuot buys the papers it needs with x-four-oh-two nanopayments on Arc, reads them with Venice, and splits U.S.D.C. back to every author whose work grounded the answer — gas-free and batched via Circle Gateway. Every citation becomes a payment.",
  permission:
    "And it has real agency. The agent runs from its own Circle Agent Wallet, under a spending cap it can never exceed. It decides which papers are worth buying, at sub-cent prices, thousands of times an hour. A budget it controls — not a script.",
  mesh:
    "Under the hood it's a mesh, not a script. A Planner splits the question, parallel Readers answer their slices, a Citation-Matcher weights who gets paid, and a Fact-checker can reject and force a revision. Five real on-chain agents that earn reputation.",
  venice:
    "The agents' brain is Venice — private and uncensored. Five Venice endpoints in the main flow: chat, web search, embeddings, image, and text-to-speech. The embeddings don't just deduplicate — they weight who gets paid.",
  pay:
    "Then the authors get paid, on Arc. The agent settles with attest-and-split — recording who's owed and paying them in one transaction, gas in U.S.D.C., in under a second. And proof-of-grounding commits a digest of the answer, so only the authors who actually grounded it are paid.",
  settlement:
    "Unclaimed shares aren't idle — they earn real treasury yield in a U.S.Y.C. vault until the author claims with their ORCID. And reputation is staked as collateral, slashable on a false citation. Real stakes, not a number you ask to be trusted.",
  proof:
    "And it's all real. No mocks in the critical path. Ten contracts live on Arc, a hundred and sixty-one tests green, real U.S.D.C. flowing, and a real Circle Gateway batched settlement on chain.",
  tracks:
    "And here's the headline. Kuot's own answers are a paid resource. When another agent cites Kuot, a fraction of that nanopayment flows recursively back to the original authors — the citation graph pays itself, depth after depth. It spans Autonomous Paying Agents, Creator Monetization, and Agent-to-Agent networks.",
  demo:
    "And you can see it all yourself. The live app has an interactive guided tour that narrates and points at every feature, navigating section to section on its own — and each research run explains itself, step by step.",
  close:
    "Kuot — an agent that pays the people it learns from. Try it live at kuot dash azure dot vercel dot app. Thank you.",
};

export default function SlideDeck() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const n = SLIDES.length;

  // Load voices and auto-pick the most natural English one (Google/Neural > others).
  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const load = () => {
      const vs = synth.getVoices();
      if (!vs.length) return;
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
      const en = vs.filter((v) => /^en/i.test(v.lang)).sort((a, b) => rank(b) - rank(a));
      const list = en.length ? en : vs;
      setVoiceList(list);
      const best = list[0];
      if (best && !voiceRef.current) {
        voiceRef.current = best;
        setVoiceURI(best.voiceURI);
      }
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d))), [n]);

  // Narrated playback: speak each slide's narration (browser TTS) + auto-advance.
  // A ref breaks the recursive self-reference (avoids a TDZ on `playFrom`).
  const playFromRef = useRef<(idx: number) => void>(() => {});
  const playFrom = useCallback(
    (idx: number) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(NARRATION[SLIDES[idx].id] ?? "");
      u.rate = 0.98;
      u.pitch = 1.0;
      if (voiceRef.current) u.voice = voiceRef.current;
      u.onend = () => {
        if (idx < n - 1) {
          setI(idx + 1);
          setTimeout(() => playFromRef.current(idx + 1), 450);
        } else {
          setPlaying(false);
        }
      };
      synth.speak(u);
    },
    [n],
  );
  useEffect(() => {
    playFromRef.current = playFrom;
  }, [playFrom]);
  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);
  const togglePlay = useCallback(() => {
    if (playing) {
      stopPlay();
    } else {
      setPlaying(true);
      playFrom(i);
    }
  }, [playing, stopPlay, playFrom, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); stopPlay(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); stopPlay(); go(-1); }
      else if (e.key === "Home") { stopPlay(); setI(0); }
      else if (e.key === "End") { stopPlay(); setI(n - 1); }
      else if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
      else if (e.key.toLowerCase() === "p") { e.preventDefault(); togglePlay(); }
      else if (e.key.toLowerCase() === "c") setCaptions((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, n, stopPlay, togglePlay]);

  // Stop any speech when leaving the deck.
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[var(--paper)]">
      <div className="paper-grid pointer-events-none absolute inset-0 -z-10" />

      {/* Click zones */}
      <button aria-label="previous" onClick={() => go(-1)} className="absolute left-0 top-0 z-10 h-full w-1/3 cursor-w-resize" />
      <button aria-label="next" onClick={() => go(1)} className="absolute right-0 top-0 z-10 h-full w-1/3 cursor-e-resize" />

      {/* Slide */}
      <section className="flex flex-1 items-center justify-center px-8 py-16 sm:px-16">
        <div key={SLIDES[i].id} className="slide-in w-full max-w-4xl">{SLIDES[i].render}</div>
      </section>

      {/* Caption / subtitle bar */}
      {captions ? (
        <div className="relative z-20 mx-auto mb-2 w-full max-w-3xl px-6">
          <p
            key={`cap-${i}`}
            className={`slide-in rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm leading-snug text-white shadow-lg ${
              playing ? "ring-1 ring-[var(--accent)]/60" : ""
            }`}
          >
            {NARRATION[SLIDES[i].id]}
          </p>
        </div>
      ) : null}

      {/* Footer / nav */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-6 py-4 text-xs text-[var(--muted)]">
        <div className="flex items-center gap-3">
          <Link href="/" className="link-accent hover:text-[var(--accent)]">← exit</Link>
          <button
            onClick={togglePlay}
            className={`rounded-full px-3 py-1 font-medium transition ${
              playing ? "bg-red-500 text-white" : "bg-[var(--accent)] text-white"
            }`}
          >
            {playing ? "⏸ Stop narration" : "▶ Play narrated"}
          </button>
          <button onClick={() => setCaptions((v) => !v)} className="hover:text-[var(--accent)]">
            {captions ? "CC on" : "CC off"}
          </button>
          {voiceList.length > 0 ? (
            <select
              value={voiceURI}
              onChange={(e) => {
                setVoiceURI(e.target.value);
                voiceRef.current = voiceList.find((v) => v.voiceURI === e.target.value) ?? null;
              }}
              title="Pick the most natural voice your browser has"
              className="max-w-[140px] rounded-md border border-[var(--rule)] bg-transparent px-1.5 py-0.5 text-[10px]"
            >
              {voiceList.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  🔊 {v.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {SLIDES.map((s, idx) => (
            <button
              key={s.id}
              aria-label={`slide ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-[var(--accent)]" : "w-1.5 bg-[var(--rule)]"}`}
            />
          ))}
        </div>
        <span className="font-mono tabular-nums">
          {String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")} · ←/→ · P play · C cc · F full
        </span>
      </div>

      <style>{`
        .slide-in { animation: slidein .35s ease both; }
        @keyframes slidein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>
    </main>
  );
}
