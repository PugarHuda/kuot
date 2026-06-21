/**
 * On-chain key→JSON store — Kuot
 *
 * A zero-infra persistent store backed by ShareRegistry (operator-controlled), so
 * serverless features that need cross-instance state (agent memory, webhook
 * status) work WITHOUT provisioning external KV. Writes submit a tx and return on
 * broadcast (we don't block on confirmation); reads are a single view call.
 *
 * Trade-off vs KV: each write costs a little Sepolia gas + ~1s, and concurrent
 * writers can race (fine for the sequential demo flow). Used only as the fallback
 * when KV is not configured.
 */
import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN } from "./chains";

const REGISTRY = process.env.NEXT_PUBLIC_SHARE_REGISTRY as Address | undefined;
const rpcUrl = () => process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";

const ABI = [
  { type: "function", name: "publish", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes8" }, { name: "json", type: "string" }], outputs: [] },
  { type: "function", name: "content", stateMutability: "view", inputs: [{ name: "id", type: "bytes8" }], outputs: [{ type: "string" }] },
] as const;

/** Stable bytes8 id for a string key. */
function id8(key: string): `0x${string}` {
  return `0x${keccak256(toBytes(key)).slice(2, 18)}`;
}

export function canUseOnchainStore(): boolean {
  return Boolean(REGISTRY && process.env.OPERATOR_PRIVATE_KEY);
}

/** Persist a JSON string under `key` on-chain. Awaits broadcast, not confirmation. */
export async function putOnchain(key: string, json: string): Promise<void> {
  if (!REGISTRY) throw new Error("SHARE_REGISTRY not configured");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");
  const wallet = createWalletClient({ account: privateKeyToAccount(opKey), chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  await wallet.writeContract({ address: REGISTRY, abi: ABI, functionName: "publish", args: [id8(key), json] });
}

/** Read the JSON string under `key` (empty → null). */
export async function getOnchain(key: string): Promise<string | null> {
  if (!REGISTRY) return null;
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  const s = (await client.readContract({ address: REGISTRY, abi: ABI, functionName: "content", args: [id8(key)] })) as string;
  return s && s.length > 0 ? s : null;
}
