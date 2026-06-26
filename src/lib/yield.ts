/**
 * CitationYieldUSYC — Kuot
 *
 * Reads/credits the citation-loyalty yield held in a real ERC-4626 vault
 * (`CitationYieldUSYC` over a MockUSYC stand-in on testnet; see DEPLOYED.md for the
 * honest note on USYC). Unclaimed author rewards are deposited as vault shares and
 * earn the vault's yield until the author binds + redeems. The ABI here matches the
 * DEPLOYED contract: pendingYield/currentValue/claim (NOT the legacy linear-APR
 * pendingBonus/claimBonus — calling those reverts).
 */
import { createPublicClient, createWalletClient, http, keccak256, encodePacked, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN } from "./chains";

export const CITATION_YIELD = process.env.NEXT_PUBLIC_CITATION_YIELD as Address | undefined;
const rpcUrl = () => process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";

export const YIELD_ABI = [
  { type: "function", name: "pendingYield", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentValue", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "principal", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "since", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "accrueMany", stateMutability: "nonpayable", inputs: [{ name: "ids", type: "bytes32[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
] as const;

/** identity → bytes32 id (same hashing as NameRegistry/UnclaimedEscrow). */
export function identityId(identity: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [identity]));
}

export type BonusInfo = { principalUSDC6: string; pendingUSDC6: string; apyBps: number; sinceUnix: number; claimed: boolean };

const SECONDS_PER_YEAR = 31_536_000;

/**
 * Read the citation-loyalty yield state for an identity from the deployed vault.
 * `apyBps` is the EFFECTIVE realized rate (pendingYield/principal annualized over
 * the elapsed time), capped to a sane display band — the vault's yield is lumpy, so
 * this is an honest estimate of the realized rate, not a promised APR. Resilient:
 * returns null on any read failure rather than throwing (no 502).
 */
export async function bonusFor(identity: string): Promise<BonusInfo | null> {
  if (!CITATION_YIELD) return null;
  try {
    const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
    const id = identityId(identity);
    const [pending, principal, since, claimed] = await Promise.all([
      client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "pendingYield", args: [id] }) as Promise<bigint>,
      client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "principal", args: [id] }) as Promise<bigint>,
      client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "since", args: [id] }) as Promise<bigint>,
      client.readContract({ address: CITATION_YIELD, abi: YIELD_ABI, functionName: "claimed", args: [id] }) as Promise<boolean>,
    ]);
    const elapsed = since > 0n ? Math.max(0, Math.floor(Date.now() / 1000) - Number(since)) : 0;
    let apyBps = 0;
    if (principal > 0n && elapsed > 0) {
      const rate = (Number(pending) / Number(principal)) * (SECONDS_PER_YEAR / elapsed);
      apyBps = Math.max(0, Math.min(2000, Math.round(rate * 10_000))); // honest realized rate, capped 0–20% for display
    }
    return { principalUSDC6: principal.toString(), pendingUSDC6: pending.toString(), apyBps, sinceUnix: Number(since), claimed };
  } catch {
    return null; // un-accrued / network / interface mismatch → no bonus shown, never a 502
  }
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
