/**
 * Multi-currency author payout — direct EURC — Kuot (Lepton · Arc)
 *
 * StableFX (App Kit Swap) USDC→EURC has no route on Arc testnet yet (Circle-side),
 * so the pragmatic path to pay an EU author in euros is to hold EURC and transfer
 * it directly — no swap needed. EURC is a first-class native token on Arc
 * (0x89B5…D72a), so this is a plain ERC-20 transfer settled in USDC gas.
 *
 * Fund the operator with testnet EURC from the Circle faucet, then call payAuthorEurc.
 */
import { createPublicClient, createWalletClient, erc20Abi, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, EURC, EURC_DECIMALS } from "./chains";
import { swapUsdcToEurcOnArc } from "./onchain-fx";

function rpc() {
  return process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? arcTestnet.rpcUrls.default.http[0];
}

/** EURC balance the operator can pay out with (atomic, 6 decimals). */
export async function operatorEurcBalance(): Promise<bigint> {
  const eurc = EURC[arcTestnet.id];
  if (!eurc) return 0n;
  const pub = createPublicClient({ chain: arcTestnet, transport: http(rpc()) });
  return (await pub.readContract({ address: eurc, abi: erc20Abi, functionName: "balanceOf", args: [
    privateKeyToAccount((process.env.OPERATOR_PRIVATE_KEY ?? "0x0") as `0x${string}`).address,
  ] })) as bigint;
}

/**
 * Pay an author directly in EURC (operator-funded). `amount` is human euros, e.g. 0.25.
 * Returns the tx hash. Requires the operator to hold EURC (Circle faucet → Arc Testnet → EURC).
 */
export async function payAuthorEurc(to: Address, amount: number): Promise<`0x${string}`> {
  const eurc = EURC[arcTestnet.id];
  if (!eurc) throw new Error("EURC not configured for Arc");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");
  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc()) });
  const atomic = BigInt(Math.round(amount * 10 ** EURC_DECIMALS));
  return wallet.writeContract({ address: eurc, abi: erc20Abi, functionName: "transfer", args: [to, atomic] });
}

/**
 * Pay an EU author by SWAPPING their USDC share into EURC on-chain (Kuot's Arc
 * StableFXPool), then transferring the swapped euros. This is the full live path:
 * a dollar-denominated citation share becomes a euro payout in two real txs — no
 * pre-held EURC, no Circle StableFX route required. `usdcAmount6` is base units.
 */
export async function payAuthorEurcViaSwap(
  to: Address,
  usdcAmount6: bigint,
): Promise<{ swapTx: `0x${string}`; payTx: `0x${string}`; eurcPaid: string }> {
  const eurc = EURC[arcTestnet.id];
  if (!eurc) throw new Error("EURC not configured for Arc");
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");

  const swap = await swapUsdcToEurcOnArc(usdcAmount6);
  const eurcOut = BigInt(swap.amountOut);

  const account = privateKeyToAccount(opKey);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc()) });
  const payTx = await wallet.writeContract({ address: eurc, abi: erc20Abi, functionName: "transfer", args: [to, eurcOut] });
  return { swapTx: swap.txHash, payTx, eurcPaid: eurcOut.toString() };
}
