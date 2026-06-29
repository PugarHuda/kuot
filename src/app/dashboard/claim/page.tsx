"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useSignMessage, useWriteContract } from "wagmi";
import { pickFlaskConnector } from "@/lib/wagmi";
import { keccak256, encodePacked, getAddress } from "viem";
import { ESCROW_ABI } from "@/lib/escrow";
import { CITATION_YIELD, YIELD_ABI, identityId } from "@/lib/yield";

type Bonus = { principalUSDC6: string; pendingUSDC6: string; apyBps: number; sinceUnix: number; claimed: boolean } | null;

type Status = {
  enabled: boolean;
  demoVerifyAvailable: boolean;
  verifiedOrcid?: string | null;
  verifiedViaDemo?: boolean;
};
type ClaimState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "binding" }
  | { status: "done"; txHash: string }
  | { status: "error"; message: string };

export default function ClaimPage() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [orcid, setOrcid] = useState("0000-0002-1825-0097"); // ORCID test record
  const [status, setStatus] = useState<Status | null>(null);
  const [claim, setClaim] = useState<ClaimState>({ status: "idle" });
  const [owed, setOwed] = useState<bigint>(0n);
  const [bonus, setBonus] = useState<Bonus>(null);
  const [bonusTx, setBonusTx] = useState<string | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    fetch("/api/auth/orcid/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // Referral pre-fill: a shareable claim link like /dashboard/claim?orcid=0000-0001-...
  // lands the author with their ORCID already filled in — frictionless onboarding.
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get("orcid");
    if (o && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(o.trim())) setOrcid(o.trim());
    // Honest dead-end messaging so a real researcher who hit "Demo verify" (which
    // only accepts the ORCID test record / non-real iDs) isn't silently bounced.
    const errMap: Record<string, string> = {
      demo_real_orcid:
        "That's a real ORCID iD — for your security it can only be verified by signing in with ORCID itself, not the demo path. The official “Verify with ORCID” sign-in is being switched on; check back shortly or email us and we'll bind it for you.",
      demo_bad_orcid: "That doesn't look like a valid ORCID iD (format 0000-0002-1825-0097).",
      oauth_disabled: "ORCID sign-in isn't switched on yet. It's being enabled — check back shortly.",
      oauth_state: "Your ORCID sign-in session expired. Please try “Verify with ORCID” again.",
      oauth_orcid_mismatch: `The ORCID you signed in with (${q.get("got") ?? "?"}) doesn't match the one entered.`,
      oauth_exchange: "ORCID sign-in failed to complete. Please try again.",
      demo_disabled: "Demo verification is disabled in this environment.",
    };
    const e = q.get("err");
    if (e && errMap[e]) setVerifyErr(errMap[e]);
  }, []);

  // Live onboarding/traction counter for the campaign.
  const [stats, setStats] = useState<{ authorsOnboarded: number; attributedUSDC: number; citedAuthors: number } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => setStats(null));
  }, []);
  const copyClaimLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard/claim?orcid=${encodeURIComponent(orcid)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }, [orcid]);

  const verifiedOrcid = status?.verifiedOrcid ?? null;
  const escrowAddress = process.env.NEXT_PUBLIC_UNCLAIMED_ESCROW as `0x${string}` | undefined;

  const refreshOwed = useCallback(async () => {
    if (!verifiedOrcid) return;
    try {
      const r = await fetch(`/api/owed?identity=${encodeURIComponent(verifiedOrcid)}`).then((x) => x.json());
      setOwed(BigInt(r.owedUSDC6 ?? "0"));
    } catch {
      setOwed(0n);
    }
    try {
      const b = await fetch(`/api/bonus?identity=${encodeURIComponent(verifiedOrcid)}`).then((x) => x.json());
      setBonus(b?.configured ? { principalUSDC6: b.principalUSDC6, pendingUSDC6: b.pendingUSDC6, apyBps: b.apyBps, sinceUnix: b.sinceUnix, claimed: b.claimed } : null);
    } catch {
      setBonus(null);
    }
  }, [verifiedOrcid]);

  async function handleClaimBonus() {
    if (!verifiedOrcid || !CITATION_YIELD) return;
    try {
      const tx = await writeContractAsync({
        address: CITATION_YIELD,
        abi: YIELD_ABI,
        functionName: "claim",
        args: [identityId(verifiedOrcid)],
      });
      setBonusTx(tx);
      setTimeout(refreshOwed, 4000);
    } catch (e) {
      setBonusTx(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    refreshOwed();
  }, [refreshOwed, claim.status]);

  async function handleWithdraw() {
    if (!verifiedOrcid || !escrowAddress) return;
    try {
      const tx = await writeContractAsync({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: "withdraw",
        args: [keccak256(encodePacked(["string"], [verifiedOrcid]))],
      });
      setWithdrawTx(tx);
      setTimeout(refreshOwed, 4000);
    } catch (e) {
      setWithdrawTx(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleBind() {
    if (!address || !verifiedOrcid) return;
    setClaim({ status: "signing" });
    try {
      const message = keccak256(encodePacked(["string", "address"], [verifiedOrcid, getAddress(address)]));
      const signature = await signMessageAsync({ message: { raw: message } });
      setClaim({ status: "binding" });
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address, signature }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setClaim({ status: "done", txHash: json.txHash });
    } catch (e) {
      setClaim({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-14">
      <span className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">For authors</span>
      <h1 className="serif mt-2 text-4xl font-semibold tracking-tight">Claim your author wallet</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/75">
        Prove you own your <strong>ORCID</strong> (OAuth) and your wallet (one signature). The
        operator relays an on-chain binding — every Kuot citation of your work then pays
        <span className="italic"> your real wallet</span>. You pay no gas.
      </p>

      {/* Campaign banner: your work is already earning — claim it, and share the link. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
        <div className="text-sm">
          <span className="font-semibold text-[var(--accent)]">Your work is already earning.</span>{" "}
          {stats ? (
            <span className="text-[var(--ink)]/75">
              {stats.authorsOnboarded} author{stats.authorsOnboarded === 1 ? "" : "s"} onboarded ·{" "}
              {stats.citedAuthors} cited · ${stats.attributedUSDC.toFixed(4)} attributed on-chain.
            </span>
          ) : (
            <span className="text-[var(--ink)]/60">Bind your ORCID + wallet to collect what your citations have earned.</span>
          )}
        </div>
        <button
          onClick={copyClaimLink}
          className="shrink-0 rounded-md border border-[var(--accent)]/40 px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
        >
          {copied ? "✓ Link copied" : "Copy your claim link"}
        </button>
      </div>

      <div data-tour="claim-card" className="card mt-8 space-y-5 p-6">
        {/* 1. connect wallet */}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">1 · Connect wallet</p>
        {!isConnected ? (
          <div className="flex flex-wrap gap-2">
            {(() => {
              const flask = pickFlaskConnector(connectors);
              return flask ? (
                <button
                  onClick={() => connect({ connector: flask })}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white"
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
        ) : (
          <p className="font-mono text-xs text-[var(--muted)]">{address}</p>
        )}

        {/* 2. verify ORCID */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">2 · Verify your ORCID</p>
          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">Your ORCID iD</span>
            <input
              value={orcid}
              onChange={(e) => setOrcid(e.target.value)}
              placeholder="0000-0000-0000-0000"
              className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-neutral-700"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {status?.enabled ? (
              <a
                href={`/api/auth/orcid/authorize?orcid=${encodeURIComponent(orcid)}`}
                className="rounded-lg bg-[#A6CE39] px-3.5 py-2 text-xs font-medium text-black"
              >
                Verify with ORCID ↗
              </a>
            ) : (
              <span className="text-[11px] text-neutral-400">ORCID OAuth not configured</span>
            )}
            {status?.demoVerifyAvailable ? (
              <a
                href={`/api/auth/orcid/demo-verify?orcid=${encodeURIComponent(orcid)}`}
                className="rounded-lg border border-neutral-300 px-3.5 py-2 text-xs font-medium dark:border-neutral-700"
              >
                Demo verify (test ORCID)
              </a>
            ) : null}
            {verifiedOrcid ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                ✓ ORCID verified: {verifiedOrcid}
                {status?.verifiedViaDemo ? " (demo)" : ""}
              </span>
            ) : null}
          </div>
          {verifyErr ? (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {verifyErr}
            </p>
          ) : null}
        </div>

        {/* 3. sign + bind */}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">3 · Bind wallet (one signature)</p>
        <button
          onClick={handleBind}
          disabled={!isConnected || !verifiedOrcid || claim.status === "signing" || claim.status === "binding"}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {claim.status === "signing"
            ? "Sign in wallet…"
            : claim.status === "binding"
              ? "Binding on-chain…"
              : "Sign & bind wallet"}
        </button>

        {claim.status === "done" ? (
          <p className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/40">
            ✓ Bound on-chain.{" "}
            <a href={`https://testnet.arcscan.app/tx/${claim.txHash}`} target="_blank" rel="noreferrer" className="underline">
              View transaction
            </a>
          </p>
        ) : null}
        {claim.status === "error" ? (
          <p className="rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40">{claim.message}</p>
        ) : null}

        {/* Your rewards (UnclaimedEscrow principal + CitationYield bonus) */}
        {verifiedOrcid ? (
          <div className="mt-2 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <h3 className="serif text-sm font-semibold">Your earnings</h3>

            {/* Principal — accumulates as you're cited more */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Cited &amp; owed (accumulating)</span>
                <span className="font-mono text-sm font-semibold text-emerald-600">
                  {(Number(owed) / 1e6).toFixed(2)} USDC
                </span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                Held on-chain in UnclaimedEscrow. This <b>grows automatically</b> every time Kuot
                cites your work again — even before you claim. Nothing expires.
              </p>
              <button
                onClick={handleWithdraw}
                disabled={owed === 0n || !isConnected}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Withdraw {(Number(owed) / 1e6).toFixed(2)} USDC
              </button>
              {withdrawTx && !withdrawTx.startsWith("error") ? (
                <p className="mt-2 text-[11px] text-emerald-700">
                  ✓{" "}
                  <a href={`https://testnet.arcscan.app/tx/${withdrawTx}`} target="_blank" rel="noreferrer" className="underline">
                    withdrawal tx
                  </a>
                </p>
              ) : null}
              {withdrawTx?.startsWith("error") ? <p className="mt-2 text-[11px] text-red-600">{withdrawTx}</p> : null}
            </div>

            {/* Citation-loyalty yield (CitationYield) */}
            {bonus ? (
              <div className="rounded-md border border-[var(--rule)] bg-[var(--paper)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    ⏳ Citation-loyalty yield{" "}
                    <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                      USYC-style vault · testnet
                    </span>
                  </span>
                  <LiveYield
                    principalUSDC6={bonus.principalUSDC6}
                    pendingUSDC6={bonus.pendingUSDC6}
                    apyBps={bonus.apyBps}
                    sinceUnix={bonus.sinceUnix}
                    claimed={bonus.claimed}
                  />
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Your unclaimed share sits in a real ERC-4626 vault and earns the vault&apos;s yield until
                  you claim. On testnet this is a USYC-style stand-in (real USYC is institution-gated), so
                  the yield is modeled, not a promised APR — but the deposit/redeem path is real on-chain.
                  {" "}{bonus.claimed ? "Already claimed." : "Claim it any time."}
                </p>
                <button
                  onClick={handleClaimBonus}
                  disabled={bonus.claimed || Number(bonus.pendingUSDC6) === 0 || !isConnected}
                  className="mt-2 rounded-lg border border-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40"
                >
                  Claim bonus
                </button>
                {bonusTx && !bonusTx.startsWith("error") ? (
                  <p className="mt-2 text-[11px] text-emerald-700">
                    ✓{" "}
                    <a href={`https://testnet.arcscan.app/tx/${bonusTx}`} target="_blank" rel="noreferrer" className="underline">
                      bonus tx
                    </a>
                  </p>
                ) : null}
                {bonusTx?.startsWith("error") ? <p className="mt-2 text-[11px] text-red-600">{bonusTx}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

/**
 * Live citation-loyalty yield counter. Recomputes pendingBonus client-side every
 * ~150ms using the EXACT same linear-APR formula the contract uses
 * (principal · apyBps · elapsed / (365d · 10000), capped at 50% of principal), so
 * the number visibly ticks up between blocks. Honest, not faked: it only
 * extrapolates the on-chain state to the current second — the value the contract
 * would return right now — and never drops below the last confirmed on-chain value.
 */
function LiveYield({
  principalUSDC6,
  pendingUSDC6,
  apyBps,
  sinceUnix,
  claimed,
}: {
  principalUSDC6: string;
  pendingUSDC6: string;
  apyBps: number;
  sinceUnix: number;
  claimed: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (claimed) return;
    const t = setInterval(() => setNowMs(Date.now()), 150);
    return () => clearInterval(t);
  }, [claimed]);

  const principal = Number(principalUSDC6) / 1e6;
  const onchainPending = Number(pendingUSDC6) / 1e6;
  if (claimed || principal === 0 || !sinceUnix) {
    return (
      <span className="font-mono text-sm font-semibold text-[var(--accent)]">
        +{onchainPending.toFixed(4)} USDC
      </span>
    );
  }
  const elapsed = Math.max(0, nowMs / 1000 - sinceUnix);
  const perYear = principal * (apyBps / 10_000);
  let pending = (perYear * elapsed) / (365 * 24 * 3600);
  const cap = principal * 0.5;
  if (pending > cap) pending = cap;
  if (pending < onchainPending) pending = onchainPending; // never below confirmed chain value
  return (
    <span
      className="font-mono text-sm font-semibold tabular-nums text-[var(--accent)]"
      title="Accruing live — the same linear-APR formula CitationYield pays out, extrapolated to this second"
    >
      +{pending.toFixed(8)} USDC
    </span>
  );
}
