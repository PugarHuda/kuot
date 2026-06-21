/**
 * StableFX — USDC↔EURC FX for multi-currency author payouts — Kuot (Lepton · Arc)
 *
 * Global authors (many in the EU) can elect EURC. When a payout is due, the agent
 * swaps USDC→EURC on Arc via Circle's **App Kit Swap** (the same SDK the official
 * circlefin/arc-stablecoin-fx sample uses) before settling. Real product need:
 * a dollar-denominated citation economy paying a euro-denominated author directly.
 *
 * SERVER-ONLY. Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET + KIT_KEY (App Kit).
 * Until those are set, `swapEnabled()` is false and payouts stay in USDC.
 */
import { AppKit, SwapChain } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

export const FX_TOKENS = ["USDC", "EURC"] as const;
export type FxToken = (typeof FX_TOKENS)[number];

/** Arc testnet in the App Kit SwapChain enum (verified: SwapChain.Arc_Testnet). */
const FX_CHAIN: SwapChain = SwapChain.Arc_Testnet;

let _kit: AppKit | null = null;
let _adapter: ReturnType<typeof createCircleWalletsAdapter> | null = null;

function kit(): AppKit {
  return (_kit ??= new AppKit());
}

function adapter() {
  if (_adapter) return _adapter;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) throw new Error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET required for StableFX");
  _adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  return _adapter;
}

function kitKey(): string {
  const k = process.env.KIT_KEY;
  if (!k) throw new Error("KIT_KEY required for App Kit Swap");
  return k;
}

/** FX is available only once the Circle App Kit credentials are configured. */
export function swapEnabled(): boolean {
  return Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.KIT_KEY);
}

export type FxQuote = { amountOut: string; effectiveRate: string };

/** Quote a swap (no execution) — for previewing the EURC an author will receive. */
export async function estimateFx(args: {
  walletAddress: string;
  tokenIn: FxToken;
  tokenOut: FxToken;
  amountIn: string;
}): Promise<FxQuote> {
  const result = await kit().estimateSwap({
    from: { adapter: adapter(), chain: FX_CHAIN, address: args.walletAddress },
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amountIn: args.amountIn,
    config: { kitKey: kitKey() },
  });
  const amountOut = result.estimatedOutput.amount;
  const inNum = Number(args.amountIn);
  const outNum = Number(amountOut);
  return { amountOut, effectiveRate: inNum > 0 ? (outNum / inNum).toString() : "0" };
}

export type FxResult = { amountOut?: string; txHash?: string };

/** Execute a swap on Arc via App Kit. Optional app fee via APP_FEE_BPS/RECIPIENT. */
export async function swapFx(args: {
  walletAddress: string;
  tokenIn: FxToken;
  tokenOut: FxToken;
  amountIn: string;
  slippageBps?: number;
}): Promise<FxResult> {
  const config: Record<string, unknown> = { kitKey: kitKey(), slippageBps: args.slippageBps ?? 50 };
  const feeBps = Number(process.env.APP_FEE_BPS ?? 0);
  if (feeBps > 0 && process.env.APP_FEE_RECIPIENT) {
    config.customFee = { percentageBps: feeBps, recipientAddress: process.env.APP_FEE_RECIPIENT };
  }
  const params = {
    from: { adapter: adapter(), chain: FX_CHAIN, address: args.walletAddress },
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amountIn: args.amountIn,
  };

  let result;
  try {
    result = await kit().swap({ ...params, config });
  } catch (err) {
    // Counterfactual Circle smart wallets can't sign (EIP-1271) until deployed;
    // the on-chain approval path deploys the wallet as a side effect (per Circle's sample).
    if (/undeployed wallet/i.test(err instanceof Error ? err.message : String(err))) {
      result = await kit().swap({ ...params, config: { ...config, allowanceStrategy: "approve" } });
    } else {
      throw err;
    }
  }
  return { amountOut: result.amountOut, txHash: result.txHash };
}

/** Convenience: pay an EU author by swapping their USDC share into EURC. */
export function swapUsdcToEurc(args: { walletAddress: string; amountIn: string; slippageBps?: number }): Promise<FxResult> {
  return swapFx({ walletAddress: args.walletAddress, tokenIn: "USDC", tokenOut: "EURC", amountIn: args.amountIn, slippageBps: args.slippageBps });
}
