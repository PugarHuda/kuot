/**
 * Settlement — Kuot
 *
 * Turns a research result's payout plan into the on-chain `attestAndSplit` call,
 * and packages it as an Execution that a session account redeems under its
 * ERC-7710 delegation — gas-free on Arc via the Circle Gateway.
 */
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, keccak256, toHex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { CitationPayout } from "./agent";
import type { Execution7710 } from "./oneshot";
import { arcTestnet, USDC } from "./chains";

const CITES_COMPONENT = {
  name: "cites",
  type: "tuple[]",
  components: [
    { name: "author", type: "address" },
    { name: "weightBps", type: "uint16" },
  ],
} as const;

/** Minimal ABI for AttributionLedger (attestAndSplit + record-only attest). */
export const ATTRIBUTION_LEDGER_ABI = [
  {
    type: "function",
    name: "attestAndSplit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "queryId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      CITES_COMPONENT,
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "queryId", type: "bytes32" },
      { name: "total", type: "uint256" },
      CITES_COMPONENT,
    ],
    outputs: [],
  },
] as const;

/** Deterministic on-chain id for a query string. */
export function queryIdOf(query: string): `0x${string}` {
  return keccak256(toHex(query));
}

/** Build the attestAndSplit calldata for a payout plan. */
export function encodeAttestAndSplit(args: {
  query: string;
  amount: bigint;
  payouts: CitationPayout[];
}): `0x${string}` {
  const cites = args.payouts.map((p) => ({
    author: p.author as Address,
    weightBps: p.weightBps,
  }));
  return encodeFunctionData({
    abi: ATTRIBUTION_LEDGER_ABI,
    functionName: "attestAndSplit",
    args: [queryIdOf(args.query), args.amount, cites],
  });
}

/** Package the settlement as a single Execution7710 for the Circle Gateway / redeem. */
export function buildSettlementExecution(args: {
  ledger: `0x${string}`;
  query: string;
  amount: bigint;
  payouts: CitationPayout[];
}): Execution7710 {
  return {
    target: args.ledger,
    value: "0",
    data: encodeAttestAndSplit(args),
  };
}

/**
 * Operator-relayed on-chain attestation. Records the citation on AttributionLedger
 * (record-only `attest`, no funds moved) so there is a real, auditable on-chain
 * receipt of who was cited and their share. The payout itself is the separate
 * gasless Gateway transfer path. Returns the tx hash.
 */
export async function operatorAttest(args: {
  ledger: `0x${string}`;
  query: string;
  total: bigint;
  payouts: CitationPayout[];
}): Promise<`0x${string}`> {
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0];
  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) });
  const cites = args.payouts.map((p) => ({ author: p.author as Address, weightBps: p.weightBps }));
  return wallet.writeContract({
    address: args.ledger,
    abi: ATTRIBUTION_LEDGER_ABI,
    functionName: "attest",
    args: [queryIdOf(args.query), args.total, cites],
  });
}

/**
 * Operator splits a PRE-FUNDED pool to the cited authors (Kutip-style upfront).
 * The user locked USDC by transferring it to the operator at the start; here the
 * operator approves the ledger and calls `attestAndSplit`, which records the
 * attestation AND transfers each author their weighted share — from the operator's
 * (now prefunded) balance. Gasless for the user (operator pays gas). Returns tx.
 */
export async function operatorAttestAndSplit(args: {
  ledger: `0x${string}`;
  query: string;
  amount: bigint;
  payouts: CitationPayout[];
}): Promise<`0x${string}`> {
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0];
  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) });
  const pub = createPublicClient({ chain: arcTestnet, transport: http(rpc) });
  const usdcAddr = USDC[arcTestnet.id];

  // The operator must hold the prefunded amount + approve the ledger to pull it.
  const bal = (await pub.readContract({ address: usdcAddr, abi: erc20Abi, functionName: "balanceOf", args: [account.address] })) as bigint;
  if (bal < args.amount) throw new Error(`operator prefund balance ${bal} < ${args.amount} — was the lock transfer confirmed?`);
  const allowance = (await pub.readContract({ address: usdcAddr, abi: erc20Abi, functionName: "allowance", args: [account.address, args.ledger] })) as bigint;
  if (allowance < args.amount) {
    const apTx = await wallet.writeContract({ address: usdcAddr, abi: erc20Abi, functionName: "approve", args: [args.ledger, args.amount] });
    await pub.waitForTransactionReceipt({ hash: apTx });
  }

  const cites = args.payouts.map((p) => ({ author: p.author as Address, weightBps: p.weightBps }));
  return wallet.writeContract({
    address: args.ledger,
    abi: ATTRIBUTION_LEDGER_ABI,
    functionName: "attestAndSplit",
    args: [queryIdOf(args.query), args.amount, cites],
  });
}

/** ERC-20 transfer calldata (for the fee execution to the relayer's feeCollector). */
export function encodeErc20Transfer(to: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "transfer",
    args: [to, amount],
  });
}
