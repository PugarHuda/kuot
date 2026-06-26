/**
 * UnclaimedEscrow client — Kuot
 *
 * Unclaimed authors' shares are held on-chain in the escrow (keyed by identity
 * hash). The operator funds the escrow and batch-records the owed amounts; the
 * author withdraws after binding their ORCID→wallet in NameRegistry.
 */
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, USDC } from "./chains";
import { authorHash } from "./registry";
import { accrueYield } from "./yield";
import { isValidOrcidFormat } from "./orcid";
import type { CitationPayout } from "./agent";

const ESCROW = process.env.NEXT_PUBLIC_UNCLAIMED_ESCROW as Address | undefined;

export const ESCROW_ABI = [
  {
    type: "function",
    name: "recordMany",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hashes", type: "bytes32[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "owed",
    stateMutability: "view",
    inputs: [{ name: "authorHash", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "authorHash", type: "bytes32" }],
    outputs: [],
  },
] as const;

function rpc() {
  return process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0];
}
const pub = () => createPublicClient({ chain: arcTestnet, transport: http(rpc()) });

/** USDC owed to an identity (ORCID/OpenAlex id) — 0 if none. */
export async function owedFor(identity: string): Promise<bigint> {
  if (!ESCROW) return 0n;
  try {
    return (await pub().readContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: "owed",
      args: [authorHash(identity)],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Operator funds the escrow and records the unclaimed authors' shares.
 * `totalUSDC6` is the full split; each unclaimed author gets total*weightBps/10000.
 * Returns the escrow tx hashes (fund + recordMany), or null if nothing unclaimed.
 */
export async function escrowUnclaimed(args: {
  payouts: CitationPayout[];
  totalUSDC6: bigint;
}): Promise<{ fundTx: `0x${string}`; recordTx: `0x${string}`; total: string } | null> {
  if (!ESCROW) throw new Error("NEXT_PUBLIC_UNCLAIMED_ESCROW not configured");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");

  // Only escrow identities that can actually be CLAIMED later. The bind path
  // (/api/claim) binds an ORCID hash, so escrowing a bare OpenAlex id would strand
  // the USDC forever (no producible binding). Require a valid ORCID identity.
  const unclaimed = args.payouts.filter((p) => !p.claimed && p.identity && isValidOrcidFormat(p.identity));
  if (unclaimed.length === 0) return null;

  // Guard: never send USDC to the escrow address unless the contract is actually
  // deployed there (otherwise funds would arrive with no `owed` recorded).
  const code = await pub().getCode({ address: ESCROW });
  if (!code || code === "0x") throw new Error("UnclaimedEscrow not deployed yet");

  const hashes = unclaimed.map((p) => authorHash(p.identity));
  const amounts = unclaimed.map((p) => (args.totalUSDC6 * BigInt(p.weightBps)) / 10_000n);
  const sum = amounts.reduce((s, x) => s + x, 0n);

  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc()) });

  // 1) fund the escrow with the unclaimed total
  const fundTx = await wallet.writeContract({
    address: USDC[arcTestnet.id],
    abi: erc20Abi,
    functionName: "transfer",
    args: [ESCROW, sum],
  });
  await pub().waitForTransactionReceipt({ hash: fundTx });

  // 2) record the per-author owed amounts in one tx
  const recordTx = await wallet.writeContract({
    address: ESCROW,
    abi: ESCROW_ABI,
    functionName: "recordMany",
    args: [hashes, amounts],
  });

  // 3) mirror into CitationYield so the citation-loyalty bonus accrues (best-effort).
  try {
    await accrueYield(unclaimed.map((p) => p.identity), amounts);
  } catch {
    /* yield is a bonus layer — never block escrow */
  }

  return { fundTx, recordTx, total: sum.toString() };
}
