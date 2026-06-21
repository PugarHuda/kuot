/**
 * Proof-of-grounding — Kuot (Lepton · Arc)
 *
 * Before an author is paid for a citation, we prove their work actually grounded
 * the answer. The Citation-Matcher (Venice embeddings) already weights each
 * author by how much their work was used (weightBps); proof-of-grounding turns
 * that into a settlement rule: only authors above a grounding floor are paid, and
 * the answer's keccak256 digest + the grounded author set are committed on-chain
 * (GroundingRegistry) as tamper-evidence. This closes the x402
 * "pay-then-maybe-delivered" gap and makes every payout auditable.
 */
import {
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  toHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./chains";
import type { CitationPayout } from "./agent";

/** identity (ORCID/OpenAlex id) → bytes32, matching NameRegistry/escrow hashing. */
export function identityHash(identity: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [identity]));
}

/** keccak256 digest of the synthesis text — tamper-evidence committed on-chain. */
export function synthesisDigest(synthesis: string): `0x${string}` {
  return keccak256(toHex(synthesis));
}

/** queryId hashing, matching settlement.queryIdOf. */
export function queryIdOf(query: string): `0x${string}` {
  return keccak256(toHex(query));
}

/** Authors below this weight (bps) are treated as not having grounded the answer. */
const GROUNDING_MIN_BPS = Number(process.env.KUOT_GROUNDING_MIN_BPS ?? 100); // 1%

export type GroundingProof = {
  queryId: `0x${string}`;
  digest: `0x${string}`;
  /** Grounded payouts, weights renormalized to sum 10_000 (settlement-ready). */
  grounded: CitationPayout[];
  /** Cited but below the grounding floor → not paid (logged for transparency). */
  dropped: CitationPayout[];
  /** bytes32 identity hashes of the grounded authors (for GroundingRegistry.commit). */
  groundedHashes: `0x${string}`[];
};

/** Renormalize a payout subset so weightBps sums to exactly 10_000. */
function renormalize(payouts: CitationPayout[]): CitationPayout[] {
  const total = payouts.reduce((s, p) => s + p.weightBps, 0) || 1;
  let distributed = 0;
  return payouts.map((p, i) => {
    const isLast = i === payouts.length - 1;
    const bps = isLast ? 10_000 - distributed : Math.floor((p.weightBps / total) * 10_000);
    distributed += bps;
    return { ...p, weightBps: bps };
  });
}

/**
 * Produce the grounding proof for a settled answer: drop sub-floor citations,
 * renormalize the rest, and hash the synthesis + grounded identities.
 */
export function proveGrounding(args: {
  query: string;
  synthesis: string;
  payouts: CitationPayout[];
}): GroundingProof {
  const grounded0 = args.payouts.filter((p) => p.weightBps >= GROUNDING_MIN_BPS);
  // If everything is below the floor (tiny answer), keep the single top citation.
  const kept = grounded0.length > 0 ? grounded0 : args.payouts.slice(0, 1);
  const dropped = args.payouts.filter((p) => !kept.includes(p));
  const grounded = renormalize(kept);
  return {
    queryId: queryIdOf(args.query),
    digest: synthesisDigest(args.synthesis),
    grounded,
    dropped,
    groundedHashes: grounded.map((p) => identityHash(p.identity)),
  };
}

export const GROUNDING_REGISTRY_ABI = [
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "queryId", type: "bytes32" },
      { name: "digest", type: "bytes32" },
      { name: "groundedHashes", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isGrounded",
    stateMutability: "view",
    inputs: [
      { name: "queryId", type: "bytes32" },
      { name: "authorHash", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Commit the grounding proof on-chain (operator). Returns tx hash, or null if unconfigured. */
export async function commitGrounding(proof: GroundingProof): Promise<`0x${string}` | null> {
  const registry = process.env.NEXT_PUBLIC_GROUNDING_REGISTRY as Address | undefined;
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!registry || !opKey) return null;
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0];
  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) });
  return wallet.writeContract({
    address: registry,
    abi: GROUNDING_REGISTRY_ABI,
    functionName: "commit",
    args: [proof.queryId, proof.digest, proof.groundedHashes],
  });
}
