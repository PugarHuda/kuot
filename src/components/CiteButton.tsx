"use client";

import { useState } from "react";
import { useAccount, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { erc20Abi, getAddress } from "viem";
import { pickFlaskConnector } from "@/lib/wagmi";
import { arcTestnet } from "@/lib/chains";

/**
 * Cite-from-wallet — the honest external-traction primitive.
 *
 * A reader (a judge, another agent's human) pays Kuot's reverse-x402 toll from
 * THEIR OWN wallet: one real USDC transfer on Arc to the collector, then we unlock
 * the synthesis via the existing on-chain tx-hash acceptor (/api/summaries — it
 * verifies a fresh, single-use USDC Transfer ≥ price). Every payment is a real,
 * non-operator Transfer on Arcscan, so it's verifiable external traction, not a
 * self-seeded number. The recursive split shown is the plan that flows back to the
 * cited authors.
 */
type Quote = { payTo: `0x${string}` | null; asset: `0x${string}`; priceUsdc6: string; priceUSDC: number };
type Unlocked = {
  synthesis: string;
  settlement?: { onchain?: string; via?: string };
  recursive?: { authors?: { author: string; amountUSDC: number }[] };
};
type Phase = "idle" | "quoting" | "paying" | "confirming" | "done" | "error";

const ARCSCAN = "https://testnet.arcscan.app/tx/";

export function CiteButton({ queryId }: { queryId: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);

  // Hand the tx hash to the reverse-x402 endpoint; it verifies the on-chain
  // transfer (fresh, single-use, ≥ price) and unlocks. Arc finality is sub-second;
  // retry a few times in case the receipt isn't indexed yet.
  async function confirm(hash: string) {
    setPhase("confirming");
    let res: Response | null = null;
    for (let i = 0; i < 8; i++) {
      res = await fetch(`/api/summaries/${queryId}`, { headers: { "Payment-Signature": hash } });
      if (res.ok) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!res || !res.ok) throw new Error("Payment sent, but not confirmed yet — use the Arcscan link below or click again to retry confirming (you won't be charged twice).");
    setUnlocked(await res.json());
    setPhase("done");
  }

  async function pay() {
    setErr(null);
    try {
      // Already paid (a prior attempt timed out)? NEVER transfer again — just resume
      // confirming with the existing tx hash. Prevents an accidental double-pay.
      if (txHash) {
        await confirm(txHash);
        return;
      }

      // 1) connect any injected wallet + ensure we're on Arc testnet.
      if (!isConnected) {
        const c = pickFlaskConnector(connectors);
        if (!c) throw new Error("No wallet detected — install MetaMask/Rabby/Coinbase Wallet.");
        await connectAsync({ connector: c });
      }
      if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });

      // 2) quote the agent's self-price + payTo (public).
      setPhase("quoting");
      const q: Quote = await fetch(`/api/summaries/${queryId}?quote=1`).then((r) => r.json());
      if (!q.payTo) throw new Error("This deployment has no collector configured.");

      // 3) one real USDC transfer to the collector on Arc. Pin chainId so wagmi
      //    throws (rather than paying on the wrong chain) if we're somehow not on Arc.
      setPhase("paying");
      const hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: getAddress(q.asset),
        abi: erc20Abi,
        functionName: "transfer",
        args: [getAddress(q.payTo), BigInt(q.priceUsdc6)],
      });
      setTxHash(hash);

      // 4) confirm + unlock.
      await confirm(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  if (phase === "done" && unlocked) {
    const paid = unlocked.recursive?.authors ?? [];
    return (
      <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 text-sm">
        <p className="font-semibold text-[var(--accent)]">✓ You paid Kuot on-chain — real, external, verifiable.</p>
        {txHash && (
          <p className="mt-1 text-[12px]">
            <a href={`${ARCSCAN}${txHash}`} target="_blank" rel="noreferrer" className="link-accent underline">
              your payment on Arcscan ↗
            </a>{" "}
            <span className="text-[var(--muted)]">— from {address?.slice(0, 6)}…{address?.slice(-4)}, not the operator.</span>
          </p>
        )}
        {paid.length > 0 && (
          <p className="mt-2 text-[12px] text-[var(--ink)]/75">
            Recursive split → {paid.length} cited author{paid.length === 1 ? "" : "s"} (
            {paid.map((a) => `${a.author.slice(0, 6)}… $${a.amountUSDC.toFixed(4)}`).join(", ")}).
          </p>
        )}
      </div>
    );
  }

  const busy = phase === "quoting" || phase === "paying" || phase === "confirming";
  const label =
    phase === "quoting"
      ? "Quoting…"
      : phase === "paying"
        ? "Confirm in wallet…"
        : phase === "confirming"
          ? "Confirming on Arc…"
          : txHash
            ? "Retry confirmation (already paid — no second charge)"
            : "Cite this answer — pay from your wallet";

  return (
    <div className="rounded-lg border border-[var(--rule)] p-4">
      <p className="text-[13px] text-[var(--ink)]/80">
        Citing this answer pays its sources. Pay the agent’s nanopayment toll from <strong>your own wallet</strong> on
        Arc — a fraction flows recursively back to the cited authors. You become a verifiable external payer on-chain.
      </p>
      <button
        onClick={pay}
        disabled={busy}
        className="mt-3 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {label}
      </button>
      {err && <p className="mt-2 text-[12px] text-red-600">{err}</p>}
      {err && txHash && (
        <p className="mt-1 text-[12px]">
          <a href={`${ARCSCAN}${txHash}`} target="_blank" rel="noreferrer" className="link-accent underline">
            your payment on Arcscan ↗
          </a>{" "}
          <span className="text-[var(--muted)]">— it’s on-chain; retry confirmation above, you won’t be charged again.</span>
        </p>
      )}
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Needs a little Arc testnet USDC (it’s also the gas token).{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="link-accent underline">faucet ↗</a>
      </p>
    </div>
  );
}
