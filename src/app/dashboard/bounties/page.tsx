"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { BOUNTY_MARKET, BOUNTY_ABI, ERC20_APPROVE_ABI, topicHash } from "@/lib/bounty";
import { USDC, PERMISSION_CHAIN } from "@/lib/chains";

type Bounty = {
  id: string;
  sponsor: string;
  topicHash: string;
  amount: string;
  expiresAt: number;
  settled: boolean;
  txHash: string;
  topic?: string | null;
};

export default function BountiesPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  // A wallet that granted the agent budget is upgraded to a 7702 smart account
  // (code prefixed 0xef0100). MetaMask routes such accounts differently and
  // rejects plain contract calls (approve/create) — warn before they try.
  const [delegated, setDelegated] = useState(false);
  useEffect(() => {
    if (!address || !publicClient) return setDelegated(false);
    publicClient
      .getCode({ address })
      .then((code) => setDelegated(Boolean(code && code.toLowerCase().startsWith("0xef0100"))))
      .catch(() => setDelegated(false));
  }, [address, publicClient]);
  const [topic, setTopic] = useState("");
  const [amount, setAmount] = useState(1);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const usdc = USDC[PERMISSION_CHAIN.id];

  async function load() {
    const d = await fetch("/api/bounties").then((r) => r.json());
    setBounties(d.bounties ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function createBounty() {
    if (!topic.trim() || !BOUNTY_MARKET) return;
    try {
      const amt = parseUnits(String(amount), 6);
      setStatus("Approving USDC… (confirm in wallet)");
      const approveTx = await writeContractAsync({
        address: usdc,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [BOUNTY_MARKET, amt],
      });
      // Wait for the approval to be mined before sending `create`. A 7702-delegated
      // wallet allows only ONE in-flight tx, so firing create while approve is still
      // pending throws "in-flight transaction limit reached for delegated accounts".
      setStatus("Waiting for approval to confirm on-chain…");
      await publicClient?.waitForTransactionReceipt({ hash: approveTx });
      setStatus("Creating bounty… (confirm in wallet)");
      const tx = await writeContractAsync({
        address: BOUNTY_MARKET,
        abi: BOUNTY_ABI,
        functionName: "create",
        args: [topicHash(topic), amt, 7n * 24n * 3600n],
      });
      // Keep the readable topic (only its hash is on-chain) so the list can show
      // it and offer a one-click "research this" action.
      fetch("/api/bounty-topic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicHash: topicHash(topic), topic: topic.trim() }),
      }).catch(() => {});
      setStatus(`✓ Created (${tx.slice(0, 10)}…). Refreshing…`);
      setTopic("");
      setTimeout(load, 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/in-flight transaction limit/i.test(msg)) {
        setStatus("⚠️ Your wallet still has a pending transaction. Wait a few seconds for it to confirm, then try again.");
      } else if (/unauthorized|json-rpc protocol is not supported|method not (found|supported)/i.test(msg)) {
        setStatus(
          "⚠️ Your wallet rejected the payment. This usually means its Sepolia RPC is misconfigured or rate-limited, " +
            "or the account is a delegated smart account (it granted the agent budget) that MetaMask routes differently. " +
            "Fix: in MetaMask → Networks → Sepolia, set RPC to https://ethereum-sepolia-rpc.publicnode.com, or sponsor from a fresh wallet that hasn't granted a budget.",
        );
      } else if (/user rejected|denied/i.test(msg)) {
        setStatus("You declined the request in your wallet.");
      } else {
        setStatus(`error: ${msg}`);
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--accent)]">Sponsored research</p>
      <h1 className="serif mt-1 text-3xl font-semibold tracking-tight">Bounties</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink)]/70">
        Fund research on a topic. When Kuot satisfies it, the deposited USDC is paid to the cited
        authors — no platform fee. Unsettled bounties are refundable after 7 days.
      </p>

      {/* Create */}
      <div data-tour="bounty-form" className="card mt-7 p-5">
        <h2 className="serif text-lg font-semibold">Sponsor a topic</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 text-xs">
            <span className="mb-1 block text-[var(--muted)]">Topic</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. perovskite solar cell stability"
              className="w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--muted)]">USDC</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-24 rounded-md border border-[var(--rule)] bg-transparent px-2 py-2 text-sm"
            />
          </label>
          <button
            onClick={createBounty}
            disabled={!isConnected || !topic.trim() || delegated}
            title={delegated ? "This delegated wallet can't sponsor — switch to a plain account" : undefined}
            className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {delegated ? "Can't sponsor (delegated wallet)" : "Fund bounty"}
          </button>
        </div>
        {!isConnected ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">Connect MetaMask (sidebar) to sponsor.</p>
        ) : null}
        {isConnected && delegated ? (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            ⚠️ This wallet is a <b>delegated smart account</b> (it granted the agent budget), so MetaMask
            may reject a direct bounty payment. To sponsor, switch to a MetaMask account that hasn&apos;t
            granted a budget, then come back here.
          </p>
        ) : null}
        {status ? <p className="mt-2 text-[11px] text-[var(--accent)]">{status}</p> : null}
      </div>

      {/* List */}
      <h2 data-tour="bounty-list" className="serif mt-9 text-lg font-semibold">Open & settled bounties</h2>
      <div className="mt-2 space-y-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)]">
        {bounties.length === 0 ? (
          <div className="bg-[var(--paper-2)] p-5 text-sm text-[var(--muted)]">
            No bounties yet — sponsor the first topic above.
          </div>
        ) : (
          bounties.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 bg-[var(--paper-2)] px-4 py-3 text-xs">
              <div className="min-w-0">
                <div className="truncate">
                  <span className="font-mono text-[var(--muted)]">#{b.id}</span>{" "}
                  {b.topic ? (
                    b.settled ? (
                      <span className="font-medium text-[var(--ink)]">{b.topic}</span>
                    ) : (
                      <Link
                        href={`/dashboard/research?q=${encodeURIComponent(b.topic)}`}
                        className="font-medium text-[var(--ink)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent)]"
                        title="Open this topic in Research"
                      >
                        {b.topic}
                      </Link>
                    )
                  ) : (
                    <span className="font-mono" title={b.topicHash}>{b.topicHash.slice(0, 12)}…</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  <span>by {b.sponsor.slice(0, 6)}…{b.sponsor.slice(-4)}</span>
                  {b.topic && !b.settled ? (
                    <Link href={`/dashboard/research?q=${encodeURIComponent(b.topic)}`} className="font-medium text-[var(--accent)] hover:underline">
                      Open in Research →
                    </Link>
                  ) : null}
                  <a
                    href={
                      b.txHash
                        ? `https://sepolia.etherscan.io/tx/${b.txHash}`
                        : `https://sepolia.etherscan.io/address/${BOUNTY_MARKET}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--accent)] hover:underline"
                  >
                    {b.txHash ? "tx ↗" : "contract ↗"}
                  </a>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="serif font-semibold text-[var(--accent)]">
                  {(Number(b.amount) / 1e6).toFixed(2)} USDC
                </span>
                {b.settled ? (
                  <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] text-[var(--accent)]">settled</span>
                ) : b.topic ? (
                  <Link
                    href={`/dashboard/research?q=${encodeURIComponent(b.topic)}`}
                    title="Open this topic in Research"
                    className="rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-500"
                  >
                    Open →
                  </Link>
                ) : (
                  <span className="rounded bg-[var(--paper)] px-2 py-0.5 text-[10px] text-[var(--muted)]">open</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
