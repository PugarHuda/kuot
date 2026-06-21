/**
 * On-chain shared-result store — Kuot (ShareRegistry)
 *
 * Zero-infra backend for public share links: the operator publishes a result's
 * JSON on-chain under a short id, and anyone reads it back with one view call.
 * This is the default store so sharing works out of the box (no KV to provision);
 * `store.ts` prefers Upstash/Vercel KV when configured for lower latency.
 */
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN } from "./chains";

const REGISTRY = process.env.NEXT_PUBLIC_SHARE_REGISTRY as Address | undefined;

const ABI = [
  { type: "function", name: "publish", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes8" }, { name: "json", type: "string" }], outputs: [] },
  { type: "function", name: "content", stateMutability: "view", inputs: [{ name: "id", type: "bytes8" }], outputs: [{ type: "string" }] },
  { type: "function", name: "exists", stateMutability: "view", inputs: [{ name: "id", type: "bytes8" }], outputs: [{ type: "bool" }] },
] as const;

const rpcUrl = () => process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";

/** A 16-hex share id (8 bytes) → the bytes8 the contract expects. */
function toBytes8(id: string): `0x${string}` {
  const hex = id.replace(/^0x/, "").toLowerCase().slice(0, 16).padEnd(16, "0");
  return `0x${hex}`;
}

/** True when reads are possible (registry deployed). */
export function canReadOnChain(): boolean {
  return Boolean(REGISTRY);
}

/** True when the operator can publish (registry + operator key). */
export function canWriteOnChain(): boolean {
  return Boolean(REGISTRY && process.env.OPERATOR_PRIVATE_KEY);
}

/** Operator-relayed publish of a result JSON. Returns the tx hash. */
export async function publishOnChain(id: string, json: string): Promise<`0x${string}`> {
  if (!REGISTRY) throw new Error("SHARE_REGISTRY not configured");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");
  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  return wallet.writeContract({ address: REGISTRY, abi: ABI, functionName: "publish", args: [toBytes8(id), json] });
}

/** Read a published result JSON (or null if never published). */
export async function readOnChain(id: string): Promise<string | null> {
  if (!REGISTRY) return null;
  const client = createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  const s = (await client.readContract({ address: REGISTRY, abi: ABI, functionName: "content", args: [toBytes8(id)] })) as string;
  return s && s.length > 0 ? s : null;
}
