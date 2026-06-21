/**
 * NameRegistry — author identity → wallet resolution (Kuot)
 *
 * Real on-chain attribution. An author proves wallet control with an EIP-191
 * signature over keccak256(authorId, wallet); the operator relays a `bind` to
 * the NameRegistry. Payouts then route to the *real* claimed wallet. Unclaimed
 * authors fall back to a deterministic demo address (clearly labeled).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  getAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN } from "./chains";

const NAME_REGISTRY = process.env.NEXT_PUBLIC_NAME_REGISTRY as Address | undefined;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "walletOf",
    stateMutability: "view",
    inputs: [{ name: "authorHash", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "bind",
    stateMutability: "nonpayable",
    inputs: [
      { name: "authorHash", type: "bytes32" },
      { name: "wallet", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

function rpcUrl(): string {
  return process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
}

/** keccak256 hash of an author id — the registry key + the message authors sign. */
export function authorHash(authorId: string): `0x${string}` {
  // Coerce: a missing/non-string id must never throw in encodePacked.
  return keccak256(encodePacked(["string"], [typeof authorId === "string" ? authorId : String(authorId ?? "")]));
}

/** The exact message an author signs to prove wallet ownership of an authorId. */
export function bindingMessage(authorId: string, wallet: Address): `0x${string}` {
  return keccak256(encodePacked(["string", "address"], [authorId, getAddress(wallet)]));
}

/** Deterministic demo wallet for unclaimed authors (never the zero address). */
export function demoWallet(seed: string): Address {
  // Defensive: an author id can be missing from upstream data — never throw.
  const s = typeof seed === "string" && seed.length > 0 ? seed : "unknown-author";
  let h = 0n;
  for (const ch of s) h = (h * 131n + BigInt(ch.charCodeAt(0))) % (1n << 160n);
  if (h === 0n) h = 1n;
  return getAddress(`0x${h.toString(16).padStart(40, "0")}`);
}

const publicClient = () => createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });

/**
 * Resolve wallets for a batch of author ids. Returns the real claimed wallet
 * when bound on-chain, else a labeled demo wallet.
 */
export async function resolveAuthorWallets(
  authorIds: string[],
): Promise<Map<string, { wallet: Address; claimed: boolean }>> {
  const out = new Map<string, { wallet: Address; claimed: boolean }>();
  if (!NAME_REGISTRY) {
    for (const id of authorIds) out.set(id, { wallet: demoWallet(id), claimed: false });
    return out;
  }
  const client = publicClient();
  await Promise.all(
    authorIds.map(async (id) => {
      try {
        const w = (await client.readContract({
          address: NAME_REGISTRY,
          abi: REGISTRY_ABI,
          functionName: "walletOf",
          args: [authorHash(id)],
        })) as Address;
        out.set(id, w && w !== "0x0000000000000000000000000000000000000000"
          ? { wallet: getAddress(w), claimed: true }
          : { wallet: demoWallet(id), claimed: false });
      } catch {
        out.set(id, { wallet: demoWallet(id), claimed: false });
      }
    }),
  );
  return out;
}

/**
 * Operator-relayed bind: verify the author's signature, then write the binding
 * on-chain so the author pays no gas. Returns the tx hash.
 */
export async function operatorBind(args: {
  authorId: string;
  wallet: Address;
  signature: `0x${string}`;
}): Promise<`0x${string}`> {
  if (!NAME_REGISTRY) throw new Error("NAME_REGISTRY not configured");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");

  // Verify the EIP-191 personal_sign signature matches the claimed wallet.
  const message = bindingMessage(args.authorId, args.wallet);
  const ok = await publicClient().verifyMessage({
    address: args.wallet,
    message: { raw: message },
    signature: args.signature,
  });
  if (!ok) throw new Error("signature does not match wallet");

  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: PERMISSION_CHAIN, transport: http(rpcUrl()) });
  return wallet.writeContract({
    address: NAME_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "bind",
    args: [authorHash(args.authorId), getAddress(args.wallet), args.signature],
  });
}
