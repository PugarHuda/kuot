/**
 * On-chain log pagination for Arc.
 *
 * Arc's RPC caps `eth_getLogs` at a 100,000-block range (error -32602
 * "query exceeds max block range 100000"). Arc also produces blocks very fast,
 * so a head-relative lookback ("latest - N") silently drops early events once
 * the chain grows past the window — e.g. the first attestations age out and the
 * activity feed reads empty even though the data is on-chain.
 *
 * Anchoring every range scan at the ledger's deploy block (KUOT_LEDGER_FROM_BLOCK)
 * fixes both: chunks stay under the 100k cap, and old events never fall off.
 */
export const LEDGER_FROM_BLOCK = (): bigint =>
  BigInt(process.env.KUOT_LEDGER_FROM_BLOCK ?? "47802000");

const STEP = 90_000n; // under Arc's 100k getLogs cap, with headroom
const MAX_CHUNKS = 80; // safety bound on RPC fan-out (~7.2M blocks from deploy)

/** Block ranges from the ledger deploy era up to `latest`, each ≤ the RPC cap. */
export function ledgerRanges(
  latest: bigint,
  start: bigint = LEDGER_FROM_BLOCK(),
): { lo: bigint; hi: bigint }[] {
  const ranges: { lo: bigint; hi: bigint }[] = [];
  for (let lo = start; lo <= latest; lo += STEP + 1n) {
    ranges.push({ lo, hi: lo + STEP > latest ? latest : lo + STEP });
  }
  // Attestations cluster near the deploy block, so keep the oldest ranges if we
  // ever exceed the fan-out cap (only after ~7M blocks past deploy).
  return ranges.length > MAX_CHUNKS ? ranges.slice(0, MAX_CHUNKS) : ranges;
}
