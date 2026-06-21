/**
 * CitationYield — Kuot
 *
 * Reads/credits the protocol-funded "citation-loyalty" yield: rewards that sit
 * unclaimed accrue a transparent linear APR, paid from the contract reserve.
 * Real on-chain incentive (not a DeFi-yield mock — our test-USDC isn't an Aave
 * asset, so we fund the bonus ourselves, transparently).
 */
import { createPublicClient, createWalletClient, http, keccak256, encodePacked, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN } from "./chains";

export const CITATION_YIELD = process.env.NEXT_PUBLIC_CITATION_YIELD as Address | undefined;
const rpcUrl = () => process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";

export const YIELD_ABI = [
  { type: "function", name: "pendingBonus", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "principal", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "since", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "apyBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "claimBonus", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
  { type: "function", name: "accrueMany", stateMutability: "nonpayable", inputs: [{ name: "ids", type: "bytes32[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
] as const;

/** identity → bytes32 id (same hashing as NameRegistry/UnclaimedEscrow). */
export function identityId(identity: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [identity]));
}

export type BonusInfo = { principalUSDC6: string; pendingUSDC6: string; apyBps: number; sinceUnix: number; claimed: boolean };

/** Read the citation-loyalty bonus state for an identity. */
export async function bonusFor(identity: string): Promise<BonusInfo | null> {
  if (!CITATION_YIELD) return null;
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  const id = identityId(identity);
  const [pending, principal, since, apy, claimed] = await Promise.all([
    client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "pendingBonus", args: [id] }) as Promise<bigint>,
    client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "principal", args: [id] }) as Promise<bigint>,
    client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "since", args: [id] }) as Promise<bigint>,
    client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "apyBps", args: [] }) as Promise<number>,
    client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "claimed", args: [id] }) as Promise<boolean>,
  ]);
  return { principalUSDC6: principal.toString(), pendingUSDC6: pending.toString(), apyBps: Number(apy), sinceUnix: Number(since), claimed };
}

/** Operator: mirror an unclaimed payout into the yield contract (sets the loyalty clock). */
export async function accrueYield(identities: string[], amounts6: bigint[]): Promise<`0x${string}` | null> {
  if (!CITATION_YIELD || !identities.length) return null;
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) return null;
  const wallet = createWalletClient({ account: privateKeyToAccount(opKey), chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  return wallet.writeContract({
    address: CITATION_YIELD,
    abi: YIELD_ABI,
    functionName: "accrueMany",
    args: [identities.map(identityId), amounts6],
  });
}
