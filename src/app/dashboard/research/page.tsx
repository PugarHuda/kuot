"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";
import { PERMISSION_CHAIN, USDC } from "@/lib/chains";
import { ATTRIBUTION_LEDGER_ABI, queryIdOf } from "@/lib/settlement";
import type { ResearchResult } from "@/lib/agent";
import Link from "next/link";
import { AGENT_MESH, narrowedFor } from "@/lib/agents";
import { loadHistory, saveToHistory, removeFromHistory, type HistoryEntry } from "@/lib/history";
import { pickFlaskConnector } from "@/lib/wagmi";
import { DownloadableReceipt } from "@/components/DownloadableReceipt";
import { CitedText } from "@/components/ResultView";
import { GuidedTour, type TourStep } from "@/components/GuidedTour";
import { sanitizeDecimal } from "@/lib/format";
import { createWalletClient, custom, erc20Abi, type Chain, type WalletClient } from "viem";

type ResearchState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ResearchResult }
  | { status: "error"; message: string };

type SettleState =
  | { status: "idle" }
  | { status: "settling" }
  | { status: "done"; result: unknown }
  | { status: "error"; message: string };

type ReceiptState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; image?: string; audioBase64?: string; degraded?: string }
  | { status: "error"; message: string };

type FeedbackState =
  | { status: "idle" }
  | { status: "recording" }
  | { status: "done"; results: { agent: string; txHash?: string; error?: string }[] }
  | { status: "error"; message: string };

type ShareState =
  | { status: "idle" }
  | { status: "sharing" }
  | { status: "done"; url: string }
  | { status: "error"; message: string };

const SESSION_ACCOUNT =
  (process.env.NEXT_PUBLIC_SESSION_ACCOUNT as `0x${string}`) ??
  "0x000000000000000000000000000000000000dEaD";

/** Operator that settles a prefunded (Lock-upfront upfront) pool to authors. */
// Where a custodial "Lock upfront" budget is sent (the operator that auto-splits it
// to authors). Falls back to the session account — NOT a hardcoded address, which
// previously made the lock a no-op self-transfer if the user shared that address.
const OPERATOR_ADDRESS = (process.env.NEXT_PUBLIC_OPERATOR_ADDRESS ??
  process.env.NEXT_PUBLIC_SESSION_ACCOUNT ??
  "0x000000000000000000000000000000000000dEaD") as `0x${string}`;

/** Narrated full-flow walkthrough — spotlights each part of the run in turn. */
const TOUR_STEPS: TourStep[] = [
  { selector: "[data-tour=stepper]", title: "The flow", narration: "Kuot works in three steps — ask, the agents research and pay the sources, then settle to the authors. Let me walk you through a completed run." },
  { selector: "[data-tour=budget]", title: "One spending budget", narration: "First, the user signed a single E.R.C. seventy-seven-fifteen permission — a scoped U.S.D.C. budget. It's a hard cap with a live countdown, and nothing was charged up front. The funds stay in your wallet." },
  { selector: "[data-tour=mesh]", title: "A2A redelegation", narration: "The Researcher then redelegates strictly narrower budgets to specialist agents. Authority only ever shrinks — that's the agent-to-agent coordination model." },
  { selector: "[data-tour=ask]", title: "Ask a question", narration: "The user asks a question. The agent searches a real two-hundred-fifty-million-paper index, then reasons with Venice — private and uncensored." },
  { selector: "[data-tour=synthesis]", title: "The grounded answer", narration: "This is the grounded synthesis the agent produced — with clickable citations that link straight to each cited paper." },
  { selector: "[data-tour=summary]", title: "TL;DR", narration: "A short summary from the Summarizer agent, keeping its inline citations." },
  { selector: "[data-tour=trace]", title: "Multi-agent trace", narration: "Here is how it actually ran. The Researcher redelegated narrower budgets to a Planner, parallel Readers, a Fact-checker that can force a revision, and a Summarizer — each a real on-chain agent that earns reputation." },
  { selector: "[data-tour=payout]", title: "Author payout plan", narration: "Every cited author gets a U.S.D.C. share, weighted by Venice embeddings. Demo wallets are shown until the real author claims with their ORCID." },
  { selector: "[data-tour=settle]", title: "Settle on-chain", narration: "One click here records the attestation and pays every author in a single transaction — no settlement fee, and the contract blocks double payment." },
  { selector: "[data-tour=receipt]", title: "Citation receipt", narration: "Finally, an on-brand citation receipt you can download, plus a Venice-generated image and a spoken briefing. That's Kuot — the recursive citation economy on Arc." },
];

const RESEARCH_STEPS = [
  "Search corpus",
  "Purchase via x402",
  "Read with Venice",
  "Fact-check (Venice)",
  "Attribute authors",
  "Ready to settle",
];

export default function ResearchPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain, switchChainAsync } = useSwitchChain();

  // String-backed numeric inputs: a controlled <input type="number"> in React
  // keeps stale leading zeros ("000.1") because the parsed value doesn't change.
  // We sanitize the raw string and derive the number from it.
  // Default to the smallest preset (0.1) — it matches a budget chip, keeps the
  // custodial "Lock budget" transfer small/safe by default, and is the typical run.
  const [perDayInput, setPerDayInput] = useState("0.1");
  const perDay = Number(perDayInput) || 0;
  // Sub-budget windows in the A2A mesh visualization narrow from this base.
  const expiryHours = 24;

  const [excludeSeen, setExcludeSeen] = useState(true);
  const [autoPay, setAutoPay] = useState(false);
  const [prefund, setPrefund] = useState(false);
  const [prefundState, setPrefundState] = useState<{
    status: "idle" | "locking" | "locked" | "splitting" | "done" | "error";
    lockTx?: string;
    splitTx?: string;
    amount6?: bigint;
    message?: string;
  }>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState(5);
  const [fromYear, setFromYear] = useState<number | "">("");
  const [toYear, setToYear] = useState<number | "">("");
  const [language, setLanguage] = useState("auto");
  const [research, setResearch] = useState<ResearchState>({ status: "idle" });
  const [settle, setSettle] = useState<SettleState>({ status: "idle" });
  const [payDirect, setPayDirect] = useState<{ status: "idle" | "approving" | "paying" | "done" | "error"; tx?: string; message?: string }>({
    status: "idle",
  });
  const [alreadyAttested, setAlreadyAttested] = useState(false);
  const [tour, setTour] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState>({ status: "idle" });
  const [feedback, setFeedback] = useState<FeedbackState>({ status: "idle" });
  const [share, setShare] = useState<ShareState>({ status: "idle" });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tick, setTick] = useState(0);

  async function handleShare() {
    if (research.status !== "done" || share.status === "sharing") return;
    setShare({ status: "sharing" });
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result: research.result }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const url = `${window.location.origin}${json.path}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard may be blocked — the URL is shown regardless */
      }
      setShare({ status: "done", url });
    } catch (e) {
      setShare({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Load this device's saved research history once on mount.
  useEffect(() => {
    const hist = loadHistory();
    setHistory(hist);
    const params = new URLSearchParams(window.location.search);
    // ?run=<id> — re-open a saved run (e.g. opened from the Library page).
    const runId = params.get("run");
    if (runId) {
      const entry = hist.find((e) => e.id === runId);
      if (entry) {
        setResearch({ status: "done", result: entry.result });
        setQuery(entry.query);
        return;
      }
    }
    // ?q= — pre-fill the query (e.g. a "Research this" link from a bounty).
    const q = params.get("q");
    if (q) setQuery(q);
  }, []);

  async function handleReceipt() {
    if (research.status !== "done") return;
    setReceipt({ status: "generating" });
    try {
      const authors = research.result.payouts.map((p) => p.authorName);
      const total =
        typeof research.result.recommendedSettleUSDC === "number"
          ? `${research.result.recommendedSettleUSDC.toFixed(2)} USDC`
          : "0.50 USDC";
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // summary = the Summarizer's TL;DR (in the question's language) → the spoken
        // briefing matches the answer's language; falls back to English server-side.
        body: JSON.stringify({
          query: research.result.query,
          authors,
          totalUSDC: total,
          summary: research.result.summary,
          language, // picks a native Venice TTS voice for the spoken briefing
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setReceipt({ status: "done", ...json });
    } catch (e) {
      setReceipt({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Auto-switch to the permission chain (Arc) once connected on the wrong one.
  useEffect(() => {
    if (isConnected && chainId !== undefined && chainId !== PERMISSION_CHAIN.id) {
      switchChain?.({ chainId: PERMISSION_CHAIN.id });
    }
  }, [isConnected, chainId, switchChain]);

  // Live agent ticker while a research request is in flight.
  useEffect(() => {
    if (research.status !== "running") return;
    setTick(0);
    const id = setInterval(() => setTick((t) => Math.min(t + 1, RESEARCH_STEPS.length - 1)), 900);
    return () => clearInterval(id);
  }, [research.status]);

  // Venice multimodal in the main flow: auto-generate the receipt (image + TTS)
  // as soon as a research run finishes — no extra click.
  useEffect(() => {
    if (research.status === "done" && receipt.status === "idle") {
      handleReceipt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [research.status]);

  // Auto-pay: when enabled, settle authors directly the moment research finishes —
  // attestAndSplit from your wallet, no fee (opt-in, off by default).
  useEffect(() => {
    if (research.status === "done" && autoPay && !prefund && payDirect.status === "idle") {
      handlePayDirect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [research.status, autoPay]);

  // Prefund (Lock-upfront): the locked pool auto-splits to authors when the run ends.
  useEffect(() => {
    if (research.status === "done" && prefund && prefundState.status === "locked") {
      handlePrefundSplit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [research.status, prefundState.status]);

  // Surface whether this query was already settled on-chain (re-settle is blocked
  // to prevent double-paying authors) — so the Settle buttons can say so upfront.
  useEffect(() => {
    if (research.status !== "done") {
      setAlreadyAttested(false);
      return;
    }
    // Just settled this session → reflect immediately (no need to wait for a read).
    if (settle.status === "done" || payDirect.status === "done" || prefundState.status === "done") {
      setAlreadyAttested(true);
      return;
    }
    if (!publicClient) return;
    const ledger = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as `0x${string}` | undefined;
    if (!ledger) return;
    publicClient
      .readContract({
        address: ledger,
        abi: [{ type: "function", name: "attested", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ type: "bool" }] }],
        functionName: "attested",
        args: [queryIdOf(research.result.query)],
      })
      .then((v) => setAlreadyAttested(Boolean(v)))
      .catch(() => setAlreadyAttested(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [research.status, publicClient, settle.status, payDirect.status, prefundState.status]);

  /**
   * Pay authors DIRECTLY on-chain (no Circle Gateway): approve USDC, then call
   * AttributionLedger.attestAndSplit — one tx that records the attestation AND
   * transfers each author their weighted USDC share, straight from the user's
   * wallet. Simpler demo path with no settlement fee (user pays gas in ETH).
   */
  async function handlePayDirect() {
    if (research.status !== "done") return;
    if (payDirect.status === "approving" || payDirect.status === "paying") return;
    const ledger = process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as `0x${string}` | undefined;
    if (!ledger) {
      setPayDirect({ status: "error", message: "Attribution ledger not configured." });
      return;
    }
    const wc = await resolveWalletClient();
    if (!wc || !wc.account) {
      setPayDirect({ status: "error", message: "Wallet not ready — reconnect your wallet." });
      return;
    }
    try {
      const amount = BigInt(Math.round((research.result.recommendedSettleUSDC ?? 0.5) * 1e6));
      const usdcAddr = USDC[PERMISSION_CHAIN.id];
      const cites = research.result.payouts.map((p) => ({ author: p.author as `0x${string}`, weightBps: p.weightBps }));

      setPayDirect({ status: "approving" });
      const approveTx = await wc.writeContract({
        address: usdcAddr,
        abi: erc20Abi,
        functionName: "approve",
        args: [ledger, amount],
        account: wc.account,
        chain: wc.chain,
      });
      // Wait for approval before the split (one in-flight tx for 7702 wallets).
      await publicClient?.waitForTransactionReceipt({ hash: approveTx });

      setPayDirect({ status: "paying" });
      const tx = await wc.writeContract({
        address: ledger,
        abi: ATTRIBUTION_LEDGER_ABI,
        functionName: "attestAndSplit",
        args: [queryIdOf(research.result.query), amount, cites],
        account: wc.account,
        chain: wc.chain,
      });
      setPayDirect({ status: "done", tx });
      recordAgentFeedback();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const friendly = /0x35d90805|alreadyattested/i.test(raw)
        ? "This query was already settled on-chain — its authors were already paid. Re-settling is blocked to prevent paying them twice. Ask a new question to settle again."
        : /unauthorized|json-rpc protocol|in-flight transaction limit/i.test(raw)
          ? "Your wallet rejected the payment (a 7702-delegated account or rate-limited RPC). Try a fresh wallet, or use the gas-free Gateway button."
          : /insufficient|exceeds balance/i.test(raw)
            ? "Not enough USDC in your wallet to settle. Fund it with test USDC and retry."
            : raw;
      setPayDirect({ status: "error", message: friendly });
    }
  }

  async function handleSettle() {
    if (research.status !== "done") return;
    setSettle({ status: "settling" });
    try {
      const ledger =
        (process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as string) ??
        "0x0000000000000000000000000000000000000000";
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: research.result.query,
          // Settle the agent-recommended amount the UI shows (scaled by the
          // fact-checker's confidence), not a fixed number.
          amountUSDC6: String(Math.round((research.result.recommendedSettleUSDC ?? 0.5) * 1e6)),
          payouts: research.result.payouts,
          ledger,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSettle({ status: "done", result: json });
      // Reputation feedback loop (E): reward the agents that contributed.
      recordAgentFeedback();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const friendly = /0x35d90805|alreadyattested/i.test(raw)
        ? "This query was already attested on-chain — there is one canonical record per query (re-attesting is blocked). Ask a new question to record a fresh attestation."
        : raw;
      setSettle({ status: "error", message: friendly });
    }
  }

  async function recordAgentFeedback() {
    if (research.status !== "done") return;
    const agents = (research.result.reputation ?? []).map((r) => r.agent);
    if (!agents.length) return;
    setFeedback({ status: "recording" });
    try {
      const res = await fetch("/api/agents/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agents }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setFeedback({ status: "done", results: json.results ?? [] });
    } catch (e) {
      setFeedback({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleResearch() {
    if (!query.trim()) return;
    setResearch({ status: "running" });
    setSettle({ status: "idle" });
    setFeedback({ status: "idle" });
    setShare({ status: "idle" });
    // Skip papers already cited in this device's past runs so each query surfaces
    // FRESH journals (dedup across runs).
    const seenIds = excludeSeen
      ? Array.from(new Set(history.flatMap((h) => (h.result.works ?? []).map((w) => w.id)).filter(Boolean)))
      : undefined;
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          papers,
          fromYear: fromYear || undefined,
          toYear: toYear || undefined,
          language,
          rootBudgetUSDC: perDay, // scales the Planner/Reader fan-out depth
          excludeIds: seenIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResearch({ status: "done", result: json as ResearchResult });
      // Persist to this device's history so it can be re-opened after a refresh.
      setHistory(saveToHistory(json as ResearchResult));
    } catch (e) {
      setResearch({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const onWrongChain = isConnected && chainId !== PERMISSION_CHAIN.id;

  async function resolveWalletClient(chain: Chain = PERMISSION_CHAIN): Promise<WalletClient | null> {
    // When a specific chain is requested (e.g. Base Arc relay), always build a
    // client bound to it; otherwise reuse the connected wagmi client.
    if (chain.id === PERMISSION_CHAIN.id && walletClient) return walletClient;
    // Use the already-connected account (no eth_requestAccounts → no extra popup).
    const eth = (globalThis as { ethereum?: unknown }).ethereum;
    if (!eth || !address) return null;
    try {
      return createWalletClient({
        account: address,
        chain,
        transport: custom(eth as Parameters<typeof custom>[0]),
      });
    } catch {
      return null;
    }
  }

  // Custodial "Lock upfront": commit the budget with a plain USDC transfer to the
  // operator. No ERC-7715 — so this works on ANY wallet (Rabby, Coinbase, normal
  // MetaMask), not just Flask. The operator auto-splits it to authors when a run
  // finishes. Returns true once the lock tx is confirmed.
  async function lockBudget(): Promise<boolean> {
    if (prefundState.status === "locked" || prefundState.status === "done") return true;
    const wc = await resolveWalletClient();
    if (!wc || !wc.account) {
      setPrefundState({ status: "error", message: "Wallet not ready — reconnect your wallet." });
      return false;
    }
    const amount6 = BigInt(Math.round(perDay * 1e6));
    setPrefundState({ status: "locking", amount6 });
    try {
      const lockTx = await wc.writeContract({
        address: USDC[PERMISSION_CHAIN.id],
        abi: erc20Abi,
        functionName: "transfer",
        args: [OPERATOR_ADDRESS, amount6],
        account: wc.account,
        chain: wc.chain,
      });
      await publicClient?.waitForTransactionReceipt({ hash: lockTx });
      setPrefundState({ status: "locked", lockTx, amount6 });
      setPrefund(true); // only NOW does research use the locked pool
      return true;
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Lock failed/declined → don't trap the user in "lock & research" mode; they
      // can still just research (operator-funded, no balance needed).
      setPrefund(false);
      setPrefundState({
        status: "error",
        message: /user rejected|denied|user cancel/i.test(raw)
          ? "Lock cancelled — no problem, you don’t need it. Just click “Research” below (no balance required)."
          : /insufficient|exceeds balance|transfer amount exceeds/i.test(raw)
            ? "Not enough USDC to lock — you don’t need to. Just click “Research” below; the agent runs on its own budget (no balance required)."
            : /unauthorized|json-rpc protocol|in-flight/i.test(raw)
              ? "Your wallet rejected the lock (delegated account / RPC). You can just research instead — no lock needed."
              : raw,
      });
      return false;
    }
  }

  /**
   * Run the query. Research needs no budget and no signature — the agent settles
   * server-side under its own operator budget (works on any wallet). If the user
   * chose to lock a budget upfront (custodial, any wallet), lock it first, then run.
   */
  async function handleAsk() {
    if (!query.trim()) return;
    // Research runs server-side (the agent pays via its own Circle Agent Wallet),
    // so anyone can run a query immediately — no wallet connect or budget needed.
    // The optional lock-upfront path below only applies when a wallet is connected.
    if (!isConnected) {
      await handleResearch();
      return;
    }
    if (prefund) {
      const ok = await lockBudget(); // any-wallet custodial lock (no ERC-7715)
      if (!ok) return;
    }
    // No budget-grant gate: the agent settles server-side, so research always runs.
    await handleResearch();
  }

  /** Operator splits the prefunded pool to authors (auto-fires after a prefunded run). */
  async function handlePrefundSplit() {
    if (research.status !== "done" || !prefundState.amount6) return;
    setPrefundState((s) => ({ ...s, status: "splitting" }));
    try {
      const ledger =
        (process.env.NEXT_PUBLIC_ATTRIBUTION_LEDGER as string) ?? "0x0000000000000000000000000000000000000000";
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: research.result.query,
          amountUSDC6: prefundState.amount6.toString(),
          payouts: research.result.payouts,
          ledger,
          mode: "split",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPrefundState((s) => ({ ...s, status: "done", splitTx: json.txHash }));
      recordAgentFeedback();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setPrefundState((s) => ({
        ...s,
        status: "error",
        message: /0x35d90805|alreadyattested/i.test(raw) ? "This query was already settled on-chain." : raw,
      }));
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Agent</p>
        <h1 className="serif mt-1 text-3xl font-semibold tracking-tight">Research</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink)]/70">
          The agent buys papers, reads with Venice, and splits USDC back to every author it cites —
          gas-free. Set an optional budget, or just ask a question.
        </p>
      </header>

      {/* Progress stepper */}
      {(() => {
        // The budget step is optional, so progress is driven by research/lock state.
        const phase =
          research.status === "done" ? 2 : research.status === "running" || prefundState.status === "locked" ? 1 : 0;
        const steps = ["Budget · optional", "Research", "Settle & pay"];
        return (
          <div data-tour="stepper" className="mb-8 flex flex-wrap items-center gap-1.5 text-[11px]">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                    i < phase
                      ? "bg-emerald-500 text-white"
                      : i === phase
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--rule)] text-[var(--muted)]"
                  }`}
                >
                  {i < phase ? "✓" : i + 1}
                </span>
                <span className={i === phase ? "font-medium text-[var(--ink)]" : "text-[var(--muted)]"}>{s}</span>
                {i < 2 ? <span className="mx-1 text-[var(--muted)]">→</span> : null}
              </div>
            ))}
          </div>
        );
      })()}

      {/* 1. Connect */}
      <Card>
        <StepHead n={1} title="Connect wallet">
          {isConnected ? (
            <span className="flex items-center gap-2 text-[11px] text-emerald-600">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> connected
              </span>
              <button
                onClick={() => disconnect()}
                className="rounded-md border border-[var(--rule)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)]/70 transition hover:border-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              >
                Disconnect
              </button>
            </span>
          ) : null}
        </StepHead>
        {isConnected ? (
          <p className="mt-3 font-mono text-xs text-[var(--muted)]">{address}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {(() => {
              const flask = pickFlaskConnector(connectors);
              return flask ? (
                <button
                  onClick={() => connect({ connector: flask })}
                  disabled={connecting}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Connect wallet
                </button>
              ) : (
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-[var(--rule)] px-4 py-2 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Install your wallet →
                </a>
              );
            })()}
          </div>
        )}
        {onWrongChain ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => switchChain?.({ chainId: PERMISSION_CHAIN.id })}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-400"
            >
              Switch to {PERMISSION_CHAIN.name}
            </button>
            <span className="text-[11px] text-amber-600">Agent Wallet policy lives on {PERMISSION_CHAIN.name}.</span>
          </div>
        ) : null}
      </Card>

      {/* 2. Budget (optional · any wallet) */}
      <Card>
        <StepHead n={2} title="Set a budget (optional)" />
        <p className="mt-2 rounded-md border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2 text-[11px] text-[var(--ink)]/75">
          <b>Research is free for you</b> — the <b>agent pays the cited authors</b> from its own budget (that’s
          the whole idea: an autonomous paying agent). You don’t need to lock or hold anything. The amount below
          just tunes how <b>deep</b> each run goes.<br />
          <b>Why fund it yourself (optional)?</b> Lock a budget and the cited authors are paid from <b>your</b>
          pool — auto-settled the moment a run finishes (no “Settle” click each time), so you support the
          researchers <b>directly</b> and every payment is on-chain from your wallet. The paper-read and
          research depth are identical either way; funding only changes <i>who</i> pays the authors (you vs the agent).
        </p>
        <p className="mt-2 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-[11px] text-[var(--ink)]/75">
          💡 A bigger budget buys <b>deeper research</b>: it scales the agent fan-out
          ({perDay >= 16 ? 5 : perDay >= 8 ? 3 : 2} parallel Readers at {perDay} USDC) and pays cited
          authors a larger share — so more budget = more thorough answers + more generous payouts.
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            Budget per run
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {[0.1, 0.5, 1, 2].map((v) => (
              <button
                key={v}
                onClick={() => setPerDayInput(String(v))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  perDay === v
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--rule)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
              >
                {v} USDC
              </button>
            ))}
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-[var(--muted)]">
              or
              <input
                type="text"
                inputMode="decimal"
                value={perDayInput}
                onChange={(e) => setPerDayInput(sanitizeDecimal(e.target.value))}
                aria-label="Custom USDC budget"
                className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-700"
              />
              USDC
            </span>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Funds ≈ <b className="text-[var(--ink)]">{papers} papers/run</b> ·{" "}
            <b className="text-[var(--ink)]">{perDay >= 16 ? 5 : perDay >= 8 ? 3 : 2} parallel Readers</b> · pays cited
            authors each run.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* PRIMARY: the default, free path — the agent pays, no balance/signature needed. */}
          <button
            onClick={() => {
              setPrefund(false); // research without locking — no balance needed
              const box = document.querySelector('[data-tour="ask"]');
              box?.scrollIntoView({ behavior: "smooth", block: "center" });
              (box?.querySelector("input") as HTMLInputElement | null)?.focus();
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            Continue — the agent pays (free) ↓
          </button>
          {/* OPTIONAL: fund the run yourself instead of the agent's budget. */}
          <button
            onClick={() => void lockBudget()}
            disabled={!isConnected || onWrongChain || prefundState.status === "locking" || prefundState.status === "locked"}
            className="rounded-lg border border-[var(--rule)] px-4 py-2.5 text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
          >
            {prefundState.status === "locking"
              ? "Locking budget…"
              : prefundState.status === "locked"
                ? "✓ Budget locked"
                : `Optional: fund it yourself — lock ${perDay} USDC`}
          </button>
        </div>
        {prefundState.status === "error" ? (
          <div className="mt-3">
            <ErrorBox>{prefundState.message}</ErrorBox>
          </div>
        ) : null}
      </Card>

      {/* A2A tree — collapsed by default to keep the page focused. */}
      <Card>
        <details data-tour="mesh">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <StepHead title="Agent mesh — redelegation (A2A)" />
            <span className="text-[11px] text-[var(--muted)]">show ▾</span>
          </summary>
          <p className="mt-1 text-xs text-neutral-500">
            The Researcher subcontracts the Summarizer by redelegating a strictly narrower slice.
            Authority only narrows — caveats tighten, never loosen.
          </p>
          <ol className="mt-4 space-y-1.5">
          {AGENT_MESH.map((role) => {
            const now = Math.floor(Date.now() / 1000);
            const { budgetUSDC, expiryUnix } = narrowedFor(role, perDay, now + expiryHours * 3600, now);
            const hours = Math.max(0, Math.round((expiryUnix - now) / 3600));
            return (
              <li
                key={role.id}
                className="rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3"
                style={{ marginLeft: `${role.depth * 22}px` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {role.depth > 0 ? <span className="text-[var(--accent)]">↳ </span> : null}
                    {role.label}
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    ≤ {budgetUSDC.toFixed(2)} USDC · {hours}h
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">{role.blurb}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {role.caveats.map((c) => (
                    <span key={c} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-900">
                      {c}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
          </ol>
        </details>
      </Card>

      {/* 3. Research */}
      <Card>
        <StepHead n={3} title="Ask a research question" />
        <p className="mt-1 text-xs text-neutral-500">
          The agent searches the corpus, reads with Venice (chat + web search), and computes who gets paid.
        </p>
        <div data-tour="ask" className="mt-4 flex gap-2 rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-2 focus-within:border-[var(--accent)]/60">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResearch()}
            placeholder="e.g. What are the most effective carbon capture methods?"
            className="flex-1 rounded-lg border-0 bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-[var(--muted)]"
          />
          <button
            onClick={handleAsk}
            disabled={
              research.status === "running" ||
              prefundState.status === "locking" ||
              !query.trim()
            }
            className="shrink-0 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {research.status === "running"
              ? "Researching…"
              : prefundState.status === "locking"
                ? "Locking…"
                : prefund
                  ? prefundState.status === "locked" || prefundState.status === "done"
                    ? "❝ Research"
                    : `🔒 Lock ${perDay} USDC & research`
                  : "❝ Research"}
          </button>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Papers">
            <input
              type="number"
              min={1}
              max={10}
              value={papers}
              onChange={(e) => setPapers(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-16 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
            />
          </Field>
          <Field label="Year from">
            <input
              type="number"
              placeholder="any"
              value={fromYear}
              onChange={(e) => setFromYear(e.target.value ? Number(e.target.value) : "")}
              className="w-20 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
            />
          </Field>
          <Field label="Year to">
            <input
              type="number"
              placeholder="any"
              value={toYear}
              onChange={(e) => setToYear(e.target.value ? Number(e.target.value) : "")}
              className="w-20 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
            />
          </Field>
          <Field label="Answer language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
            >
              <option value="auto">Auto (match question)</option>
              <option value="English">English</option>
              <option value="Indonesian">Indonesian</option>
              <option value="Spanish">Spanish</option>
              <option value="Arabic">Arabic</option>
              <option value="Chinese">Chinese</option>
              <option value="French">French</option>
              <option value="Japanese">Japanese</option>
            </select>
          </Field>
        </div>

        {/* Run options */}
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Options</p>

          <label className="flex cursor-pointer items-start gap-2.5 text-[11px] text-[var(--ink)]/80">
            <input
              type="checkbox"
              checked={excludeSeen}
              onChange={(e) => setExcludeSeen(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">Skip papers I&apos;ve already researched</span>
              {(() => {
                const n = new Set(history.flatMap((h) => (h.result.works ?? []).map((w) => w.id)).filter(Boolean)).size;
                return (
                  <span className="block text-[10px] text-[var(--muted)]">
                    {n > 0 ? `${n} known paper${n === 1 ? "" : "s"} skipped — each run finds fresh journals` : "Surfaces fresh journals once you have past runs"}
                  </span>
                );
              })()}
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-[11px] text-[var(--ink)]/80">
            <input
              type="checkbox"
              checked={autoPay}
              disabled={prefund}
              onChange={(e) => setAutoPay(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">Auto-pay authors when research finishes</span>{" "}
              <span className="block text-[10px] text-[var(--muted)]">
                Settles directly on-chain (attestAndSplit, no settlement fee) right after each run —
                straight from your wallet.
              </span>
            </span>
          </label>
        </div>

        {research.status === "running" ? (
          <ol className="mt-5 space-y-2">
            {RESEARCH_STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2.5 text-xs">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                    i < tick
                      ? "bg-emerald-500 text-white"
                      : i === tick
                        ? "animate-pulse bg-emerald-200 text-emerald-700 dark:bg-emerald-900"
                        : "bg-neutral-200 text-neutral-400 dark:bg-neutral-800"
                  }`}
                >
                  {i < tick ? "✓" : i + 1}
                </span>
                <span className={i <= tick ? "text-neutral-700 dark:text-neutral-200" : "text-neutral-400"}>{s}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {research.status === "error" ? <ErrorBox>{research.message}</ErrorBox> : null}

        {research.status === "done" ? (
          <div className="mt-5 space-y-5">
            <div className="flex items-center justify-end">
              <button
                onClick={() => setTour(true)}
                title="A narrated, spotlight walkthrough of this result — great for screen-recording a demo"
                className="rounded-full border border-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
              >
                ▶ Explain this result (guided tour)
              </button>
            </div>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                research.result.venice === "live"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {research.result.venice === "live" ? "● Venice live" : "● Venice fallback (dev)"}
            </span>
            {research.result.x402?.paid ? (
              <a
                href={`https://testnet.arcscan.app/tx/${research.result.x402.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-medium text-blue-700 underline dark:bg-blue-950 dark:text-blue-300"
              >
                ● x402 paid {research.result.x402.amountUSDC} USDC ↗
              </a>
            ) : (
              <span
                className="ml-2 inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-medium text-neutral-400 dark:bg-neutral-800"
                title={research.result.x402?.reason}
              >
                ○ x402 skipped (agent unfunded)
              </span>
            )}
            {/* Budget CAP (locked ceiling) vs USED (this run's x402 micropayment). */}
            {(() => {
              const used = research.result.x402?.paid ? Number(research.result.x402.amountUSDC) : 0;
              const cap =
                prefundState.status === "locked" && prefundState.amount6 ? Number(prefundState.amount6) / 1e6 : null;
              return (
                <div className="rounded-md border border-[var(--rule)] bg-[var(--paper)] p-2.5 text-[11px]">
                  {cap !== null ? (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                      <span>
                        💰 Budget cap:{" "}
                        <b className="text-[var(--ink)]">{cap.toFixed(2)} USDC</b>{" "}
                        <span className="text-[var(--muted)]">(locked for this run)</span>
                      </span>
                      <span>
                        💸 Used this run:{" "}
                        <b className="text-[var(--ink)]">{used.toFixed(2)} USDC</b>{" "}
                        <span className="text-[var(--muted)]">
                          {research.result.x402?.paid ? "(x402 paper)" : "(agent unfunded — x402 skipped)"}
                        </span>
                      </span>
                      <span className="text-[var(--muted)]">≈ {Math.max(0, Math.floor(cap / 0.01))} runs from the locked pool</span>
                    </div>
                  ) : research.result.x402?.paid ? (
                    <span className="text-[var(--muted)]">
                      💸 The agent paid <b className="text-[var(--ink)]">{used.toFixed(5)} USDC</b> from its <b>own budget</b> to
                      unlock the top paper via x402 — <b>free for you</b>. Optional: <b>lock a budget above</b> and the cited
                      authors get paid automatically from <b>your</b> pool when a run finishes (you support them directly,
                      no Settle click). The paper-read + research depth are the same either way.
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">
                      💸 <b className="text-[var(--ink)]">Ran unfunded</b> — the agent had no test USDC, so it skipped the x402
                      paper unlock (read free metadata only). It still cited + can pay the authors on-chain below.
                    </span>
                  )}
                </div>
              );
            })()}
            {prefund && prefundState.status !== "idle" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                🔒 <b>Upfront pool (Lock-upfront):</b>{" "}
                {prefundState.status === "locking"
                  ? "locking USDC…"
                  : prefundState.status === "locked"
                    ? `${prefundState.amount6 ? (Number(prefundState.amount6) / 1e6).toFixed(2) : ""} USDC locked — splitting to authors…`
                    : prefundState.status === "splitting"
                      ? "splitting the locked pool to authors…"
                      : prefundState.status === "done"
                        ? "✓ split to cited authors"
                        : prefundState.message ?? "error"}
                {prefundState.lockTx ? (
                  <>
                    {" · "}
                    <a href={`https://testnet.arcscan.app/tx/${prefundState.lockTx}`} target="_blank" rel="noreferrer" className="underline">lock tx</a>
                  </>
                ) : null}
                {prefundState.splitTx ? (
                  <>
                    {" · "}
                    <a href={`https://testnet.arcscan.app/tx/${prefundState.splitTx}`} target="_blank" rel="noreferrer" className="underline">split tx</a>
                  </>
                ) : null}
              </p>
            ) : null}
            {research.result.searchTerms && research.result.searchTerms.toLowerCase() !== research.result.query.trim().toLowerCase() ? (
              <p className="text-[11px] text-[var(--muted)]">
                🔎 Searched OpenAlex (real 250M-paper index) for:{" "}
                <span className="font-medium text-[var(--accent)]">{research.result.searchTerms}</span>{" "}
                <span className="text-[var(--muted)]">— cleaned from your query (typos fixed, translated)</span>
              </p>
            ) : null}
            <article data-tour="synthesis" className="whitespace-pre-wrap rounded-md bg-[var(--paper)] p-4 text-sm leading-relaxed text-[var(--ink)]/90">
              <CitedText text={research.result.synthesis} works={research.result.works} />
            </article>

            {research.result.summary ? (
              <div data-tour="summary" className="rounded-md bg-[var(--paper)] p-3">
                <h3 className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Summarizer agent · TL;DR
                </h3>
                <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--ink)]/90">
                  <CitedText text={research.result.summary} works={research.result.works} />
                </p>
              </div>
            ) : null}

            {research.result.agentTrace?.length ? (
              <div data-tour="trace" className="rounded-md border border-[var(--rule)] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="serif text-sm font-semibold">Multi-agent trace</h3>
                  <div className="flex items-center gap-2 text-[10px]">
                    {research.result.confidence ? (
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          research.result.confidence === "high"
                            ? "bg-emerald-100 text-emerald-700"
                            : research.result.confidence === "medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        confidence: {research.result.confidence}
                      </span>
                    ) : null}
                    {research.result.rounds && research.result.rounds > 1 ? (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700">
                        ↻ {research.result.rounds} rounds (revised)
                      </span>
                    ) : null}
                  </div>
                </div>
                <ol className="mt-3 space-y-1.5">
                  {research.result.agentTrace.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-[11px]"
                      style={{ marginLeft: s.redelegation ? "16px" : "0" }}
                    >
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
                        {s.redelegation ? (
                          <span className="ml-1 text-[var(--accent)]">↳ redelegated</span>
                        ) : null}
                        {typeof s.budgetUSDC === "number" ? (
                          <span className="ml-1 font-mono text-[10px] text-emerald-600">
                            ≤ {s.budgetUSDC.toFixed(2)} USDC
                          </span>
                        ) : null}
                        <p className="text-[var(--ink)]/70">{s.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {research.result.verification ? (
              <div className="rounded-md border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] p-4">
                <h3 className="serif text-sm font-semibold text-[var(--accent)]">
                  ❝ Fact-checker agent {research.result.confidence ? `· ${research.result.confidence} confidence` : ""}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink)]/80">
                  <CitedText text={research.result.verification} works={research.result.works} />
                </p>
              </div>
            ) : null}

            {research.result.webCitations.length > 0 ? (
              <div>
                <h3 className="text-xs font-medium text-neutral-500">Web sources (Venice)</h3>
                <ul className="mt-1 list-inside list-disc text-xs text-blue-600">
                  {research.result.webCitations.slice(0, 6).map((c, i) => (
                    <li key={i}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                        {c.title ?? c.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div data-tour="payout">
              <h3 className="text-xs font-medium text-neutral-500">
                Author payout plan — every citation pays its author
              </h3>
              {typeof research.result.recommendedSettleUSDC === "number" ? (
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  Weighted by the Citation-Matcher’s Venice embeddings · agent-recommended settle:{" "}
                  <span className="font-medium text-[var(--accent)]">
                    {research.result.recommendedSettleUSDC.toFixed(2)} USDC
                  </span>{" "}
                  (scaled by {research.result.confidence ?? "—"} confidence)
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
                  {research.result.payouts.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                          {p.authorName}
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] ${
                              p.claimed
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                            }`}
                            title={p.claimed ? "Real wallet (NameRegistry)" : "Unclaimed — demo wallet. Claim at /claim"}
                          >
                            {p.claimed ? "claimed" : "demo"}
                          </span>
                        </div>
                        <Link
                          href={`/dashboard/authors/${p.author}`}
                          className="font-mono text-[10px] text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
                        >
                          {p.author}
                        </Link>
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

              {research.result.payouts.length === 0 ? (
                <p className="mt-4 text-xs text-neutral-400">No authors to pay for this query.</p>
              ) : (
                <>
                  {(() => {
                    const paid = payDirect.status === "done";
                    const locked = alreadyAttested || paid;
                    return (
                      <>
                        <div data-tour="settle" className="mt-5 flex items-center gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            Settle — pay the cited authors
                          </p>
                          {locked ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              ✓ settled on-chain
                            </span>
                          ) : null}
                        </div>

                        {/* PRIMARY: one click — records the attestation AND pays each author (no settlement fee). */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                          <button
                            onClick={handlePayDirect}
                            disabled={payDirect.status === "approving" || payDirect.status === "paying" || locked}
                            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                          >
                            {payDirect.status === "approving"
                              ? "Approving USDC…"
                              : payDirect.status === "paying"
                                ? "Paying authors…"
                                : locked
                                  ? "✓ Authors settled"
                                  : "Pay authors — settle on-chain"}
                          </button>
                          <span className="text-[11px] text-[var(--muted)]">records + pays in one tx · no settlement fee · you pay gas in ETH</span>
                        </div>
                        {payDirect.status === "done" ? (
                          <p className="mt-2 text-[11px] text-emerald-600">
                            ✓ Authors paid on-chain —{" "}
                            <a href={`https://testnet.arcscan.app/tx/${payDirect.tx}`} target="_blank" rel="noreferrer" className="underline">
                              view tx
                            </a>
                            .
                          </p>
                        ) : null}
                        {payDirect.status === "error" ? <p className="mt-2 text-[11px] text-red-600">{payDirect.message}</p> : null}

                        {/* ADVANCED: record-only attestation, tucked away to keep the main path clear. */}
                        <details className="mt-2 text-[11px]">
                          <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--accent)]">Advanced settlement options</summary>
                          <div className="mt-2 space-y-2 rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={handleSettle}
                                disabled={settle.status === "settling" || locked}
                                className="rounded-md border border-[var(--rule)] px-3 py-1.5 text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                              >
                                {settle.status === "settling" ? "Recording…" : locked ? "✓ Attested" : "Record-only attestation"}
                              </button>
                            </div>
                            <p className="text-[10px] leading-relaxed text-[var(--muted)]">
                              <b>Record-only</b> writes the on-chain attestation without transferring — the authors’
                              shares are logged and can be paid/claimed later.
                              {settle.status === "error" ? <span className="block text-red-600">⚠ {settle.message}</span> : null}
                            </p>
                          </div>
                        </details>

                        <p className="mt-2 rounded-md bg-[var(--paper)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink)]/70">
                          ℹ️ <b>No double payment.</b> The primary button records the on-chain attestation <i>and</i> pays
                          each author in a single transaction. Authors without a wallet yet have their share escrowed to{" "}
                          <b>claim</b> later with ORCID — each author is settled <b>once</b>.
                        </p>
                      </>
                    );
                  })()}

                  {/* Export: optional Venice + sharing extras. */}
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Export (optional)</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleReceipt}
                      disabled={receipt.status === "generating"}
                      className="rounded-lg border border-neutral-300 px-4 py-2.5 text-xs font-medium transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                      {receipt.status === "generating" ? "Generating…" : "Venice receipt (image + audio)"}
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={share.status === "sharing"}
                      className="rounded-lg border border-[var(--accent)] px-4 py-2.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-40"
                    >
                      {share.status === "sharing" ? "Creating link…" : "Share public link ↗"}
                    </button>
                  </div>

                  {share.status === "done" ? (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--rule)] p-2 text-[11px]">
                      <span className="text-emerald-600">✓ link copied</span>
                      <a href={share.url} target="_blank" rel="noreferrer" className="link-accent flex-1 truncate font-mono underline">
                        {share.url}
                      </a>
                    </div>
                  ) : null}
                  {share.status === "error" ? (
                    <p className="mt-2 text-[11px] text-amber-600">
                      Share unavailable: {share.message}
                    </p>
                  ) : null}
                </>
              )}

              {settle.status === "done" && isAttested(settle.result) ? (
                <div className="mt-3 rounded-md bg-emerald-50 p-3 text-[11px] dark:bg-emerald-950/40">
                  ✓ Attested on-chain ·{" "}
                  <a href={attestedExplorer(settle.result)} target="_blank" rel="noreferrer" className="underline">
                    view tx on Etherscan
                  </a>
                </div>
              ) : null}

              {feedback.status === "recording" ? (
                <p className="mt-2 text-[11px] text-[var(--muted)]">⟳ Recording agent reputation on-chain (ERC-8004)…</p>
              ) : null}
              {feedback.status === "done" ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-medium text-[var(--accent)]">ERC-8004 reputation +1:</span>
                  {feedback.results.map((r) =>
                    r.txHash ? (
                      <a
                        key={r.agent}
                        href={`https://testnet.arcscan.app/tx/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`${r.agent} +1 rep — view tx`}
                        className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium capitalize text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                      >
                        {r.agent} ↗
                      </a>
                    ) : (
                      <span key={r.agent} className="rounded-full bg-neutral-100 px-2 py-0.5 capitalize text-[var(--muted)] dark:bg-neutral-800">
                        {r.agent} ✕
                      </span>
                    ),
                  )}
                </div>
              ) : null}
              {feedback.status === "error" ? (
                <p className="mt-2 text-[11px] text-amber-600">Reputation update skipped: {feedback.message}</p>
              ) : null}

              {/* THE receipt = the on-brand card. The Venice image/audio are small,
                  clearly-secondary "extras" so it doesn't read as a second receipt. */}
              <div data-tour="receipt" className="mt-4">
                <DownloadableReceipt
                  result={research.result}
                  // "Paid" only after an actual PAYMENT (direct, Gateway, or prefund
                  // split) — the record-only attestation (①) doesn't move money.
                  settled={payDirect.status === "done" || prefundState.status === "done"}
                />
                {receipt.status === "generating" ||
                (receipt.status === "done" && (receipt.image || receipt.audioBase64)) ? (
                  <div className="mt-3 max-w-sm rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      ✦ Venice multimodal extras
                    </p>
                    {receipt.status === "generating" ? (
                      <p className="mt-1 text-[11px] text-[var(--muted)]">Generating image + audio…</p>
                    ) : (
                      <div className="mt-2 flex items-start gap-3">
                        {receipt.image ? (
                          <a
                            href={receipt.image.startsWith("data:") ? receipt.image : `data:image/webp;base64,${receipt.image}`}
                            target="_blank"
                            rel="noreferrer"
                            title="z-image-turbo art — click to enlarge"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={receipt.image.startsWith("data:") ? receipt.image : `data:image/webp;base64,${receipt.image}`}
                              alt="Venice citation art"
                              className="h-24 w-24 rounded-md border border-neutral-200 object-cover dark:border-neutral-800"
                            />
                          </a>
                        ) : null}
                        {receipt.audioBase64 ? (
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-[var(--muted)]">🔊 Spoken briefing (TTS · answer’s language)</p>
                            <audio controls src={`data:audio/mp3;base64,${receipt.audioBase64}`} className="mt-1 w-full" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
                {receipt.status === "done" && receipt.degraded && !receipt.audioBase64 && !receipt.image ? (
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Venice extras unavailable (no credit) — the receipt above is always available.
                  </p>
                ) : null}
              </div>
              {receipt.status === "error" ? <ErrorBox>{receipt.message}</ErrorBox> : null}
              {settle.status === "error" ? <ErrorBox>{settle.message}</ErrorBox> : null}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Saved research — last few; full list lives on the Library page. */}
      {history.length > 0 ? (
        <Card>
          <div className="flex items-center justify-between">
            <StepHead title="Recent research" />
            <Link href="/dashboard/library" className="text-[11px] font-medium text-[var(--accent)] hover:underline">
              View all ({history.length}) in Library →
            </Link>
          </div>
          <ul className="mt-3 space-y-px overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--rule)]">
            {history.slice(0, 3).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 bg-[var(--paper-2)] px-3 py-2.5">
                <Link href={`/dashboard/result/${encodeURIComponent(h.id)}`} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-xs font-medium text-[var(--ink)]" title={h.query}>
                    {h.query}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                    <span>{new Date(h.savedAt).toLocaleString()}</span>
                    <span>· {h.result.payouts?.length ?? 0} authors</span>
                    <span
                      className={`rounded px-1 py-0.5 ${
                        h.venice === "live"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {h.venice === "live" ? "live" : "fallback"}
                    </span>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/dashboard/result/${encodeURIComponent(h.id)}`}
                    className="rounded-md border border-[var(--rule)] px-2.5 py-1 text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => setHistory(removeFromHistory(h.id))}
                    className="text-[11px] text-[var(--muted)] hover:text-red-600"
                    aria-label="delete"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tour ? <GuidedTour steps={TOUR_STEPS} onClose={() => setTour(false)} /> : null}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="card mb-6 p-6">{children}</section>;
}

function StepHead({ n, title, children }: { n?: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="serif flex items-center gap-2.5 text-base font-semibold">
        {n ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--accent)] text-[11px] font-semibold text-[var(--accent)]">
            {n}
          </span>
        ) : null}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40">{children}</p>;
}

function isAttested(r: unknown): boolean {
  return typeof r === "object" && r !== null && (r as { mode?: string }).mode === "attested";
}
function attestedExplorer(r: unknown): string {
  return (r as { explorer?: string })?.explorer ?? "#";
}
