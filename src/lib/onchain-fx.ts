/**
 * On-chain StableFX — real USDC<->EURC swap on Arc — Kuot (Lepton · Arc)
 *
 * Circle's StableFX (App Kit Swap) has no Arc-testnet route, so Kuot runs its own
 * thin FX pool (contracts/src/StableFXPool.sol). This is the LIVE swap path: an
 * author who elects euros gets a real on-chain USDC->EURC swap before payout, not
 * a bypass. The operator signs the approve + swap; both legs are 6-decimal.
 *
 * SERVER-ONLY (uses OPERATOR_PRIVATE_KEY).
 */
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, USDC, EURC, FX_POOL } from "./chains";

const POOL_ABI = [
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "swap", stateMutability: "nonpayable", inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "priceEurcPerUsdc1e6", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
] as const;

const APPROVE_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const rpc = () => process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0];
const pool = () => FX_POOL[arcTestnet.id];
const tokenAddr = (t: FxToken): Address => (t === "USDC" ? USDC[arcTestnet.id] : EURC[arcTestnet.id]);

export type FxToken = "USDC" | "EURC";

/** On-chain FX is live whenever the pool is configured (no Circle API needed). */
export function onchainFxEnabled(): boolean {
  return Boolean(pool());
}

function publicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(rpc()) });
}

/** Quote net amountOut (base units) for swapping `amountIn` of `tokenIn`. */
export async function quoteOnArc(tokenIn: FxToken, amountIn: bigint): Promise<bigint> {
  const p = pool();
  if (!p) throw new Error("FX_POOL not configured for Arc");
  return publicClient().readContract({ address: p, abi: POOL_ABI, functionName: "quote", args: [tokenAddr(tokenIn), amountIn] }) as Promise<bigint>;
}

/** Live pool reserves (usdc, eurc) in base units. */
export async function poolReserves(): Promise<{ usdc: bigint; eurc: bigint }> {
  const p = pool();
  if (!p) throw new Error("FX_POOL not configured for Arc");
  const [u, e] = (await publicClient().readContract({ address: p, abi: POOL_ABI, functionName: "reserves" })) as [bigint, bigint];
  return { usdc: u, eurc: e };
}

export type OnchainFxResult = { txHash: `0x${string}`; approveTx: `0x${string}`; amountOut: string; quoted: string };

/**
 * Execute a REAL on-chain swap on Arc: operator approves the pool then swaps.
 * `slippageBps` defaults to 100 (1%). Returns the swap tx + the quoted output.
 */
export async function swapOnArc(args: { tokenIn: FxToken; amountIn: bigint; slippageBps?: number }): Promise<OnchainFxResult> {
  const p = pool();
  if (!p) throw new Error("FX_POOL not configured for Arc");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");

  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc()) });
  const pub = publicClient();

  const quoted = await quoteOnArc(args.tokenIn, args.amountIn);
  const slip = BigInt(args.slippageBps ?? 100);
  const minOut = (quoted * (10_000n - slip)) / 10_000n;

  const tIn = tokenAddr(args.tokenIn);
  let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
  const approveTx = await wallet.writeContract({ address: tIn, abi: APPROVE_ABI, functionName: "approve", args: [p, args.amountIn], nonce });
  await pub.waitForTransactionReceipt({ hash: approveTx });
  nonce += 1;
  const txHash = await wallet.writeContract({ address: p, abi: POOL_ABI, functionName: "swap", args: [tIn, args.amountIn, minOut], nonce });
  await pub.waitForTransactionReceipt({ hash: txHash });

  return { txHash, approveTx, amountOut: quoted.toString(), quoted: quoted.toString() };
}

/** Convenience: swap a USDC author share into EURC on-chain before paying. */
export function swapUsdcToEurcOnArc(amountInUsdc6: bigint, slippageBps?: number): Promise<OnchainFxResult> {
  return swapOnArc({ tokenIn: "USDC", amountIn: amountInUsdc6, slippageBps });
}
