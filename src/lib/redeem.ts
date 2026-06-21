/**
 * 1Shot gasless redemption (browser flow) — Kuot
 *
 * The full "pay authors gasless" path, faithful to 1Shot's public-relayer skill:
 *   1. discover relayer capabilities (targetAddress = delegate, feeCollector, USDC)
 *   2. quote the fee (getFeeData → signed `context`)
 *   3. request an ERC-7715 permission whose `to` is the relayer targetAddress,
 *      scoping feeAmount + workAmount of USDC (one signature, in Flask)
 *   4. decode the granted delegation → permissionContext for the relayer
 *   5. build executions: [USDC fee → feeCollector, USDC splits → each author]
 *   6. submit relayer_send7710Transaction with the price-lock context → TaskId
 *
 * Works on Base Sepolia / Sepolia via the .dev relayer (FREE to test), and on
 * mainnet via .com (the track requirement). The user pays zero gas; the fee is
 * a stablecoin transfer inside the bundle.
 */
import type { WalletClient } from "viem";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import {
  getChainCapabilities,
  getFeeData,
  send7710Transaction,
  toRelayerJson,
  type Execution7710,
  type FeeData,
} from "./oneshot";
import type { CitationPayout } from "./agent";

/** feeAmount = max(convertedFee, minFee). */
function computeFeeAmount(fee: FeeData, gasUsed: bigint, decimals: number): bigint {
  const nativeCostWei = gasUsed * BigInt(fee.gasPrice);
  const convertedWhole = (Number(nativeCostWei) / 1e18) * fee.rate;
  const convertedAtoms = BigInt(Math.ceil(convertedWhole * 10 ** decimals));
  const minFeeAtoms = parseUnits(fee.minFee, decimals);
  return convertedAtoms > minFeeAtoms ? convertedAtoms : minFeeAtoms;
}

/** Build one USDC transfer execution. */
function usdcTransfer(token: `0x${string}`, to: `0x${string}`, amount: bigint): Execution7710 {
  return {
    target: token,
    value: "0",
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
  };
}

export type RedeemResult = { taskId: string; feeAmount: string; workAmount: string; relayer: string };

/**
 * Redeem under a freshly-granted ERC-7715 permission to pay authors gasless via
 * 1Shot. Requires MetaMask Flask + the user holding USDC on the chosen chain.
 */
export async function redeemViaOneShot(args: {
  walletClient: WalletClient;
  chainId: number;
  payouts: CitationPayout[];
  /** Total USDC to split across authors (whole units, e.g. 0.5). */
  workUSDC: number;
}): Promise<RedeemResult> {
  const { walletClient, chainId } = args;

  const caps = await getChainCapabilities(chainId);
  if (!caps) throw new Error(`relayer has no capabilities for chain ${chainId}`);
  const usdc = caps.tokens.find((t) => t.symbol === "USDC") ?? caps.tokens[0];
  const decimals = Number(usdc.decimals);

  const fee = await getFeeData(chainId, usdc.address);
  const feeAmount = computeFeeAmount(fee, 200_000n, decimals);
  const workAmount = parseUnits(String(args.workUSDC), decimals);
  const total = feeAmount + workAmount;

  // Grant scoped to the relayer's targetAddress (NOT a dapp session account).
  const wallet7715 = walletClient.extend(erc7715ProviderActions());
  const granted = await wallet7715.requestExecutionPermissions([
    {
      chainId,
      to: caps.targetAddress,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      permission: {
        type: "erc20-token-periodic",
        isAdjustmentAllowed: true,
        data: {
          tokenAddress: usdc.address,
          periodAmount: total,
          periodDuration: 86_400,
          justification: "Kuot: pay cited authors + relayer fee, gasless",
        },
      },
    },
  ]);

  const context = granted[0]?.context as `0x${string}` | undefined;
  if (!context) throw new Error("wallet returned no permission context");
  const delegations = decodeDelegations(context).map((d) => toRelayerJson(d));

  // executions: fee → feeCollector, then USDC split to each author by weight.
  const executions: Execution7710[] = [usdcTransfer(usdc.address, caps.feeCollector, feeAmount)];
  let distributed = 0n;
  args.payouts.forEach((p, i) => {
    const isLast = i === args.payouts.length - 1;
    const share = isLast ? workAmount - distributed : (workAmount * BigInt(p.weightBps)) / 10_000n;
    distributed += share;
    executions.push(usdcTransfer(usdc.address, p.author, share));
  });

  const result = await send7710Transaction({
    chainId: String(chainId),
    context: fee.context,
    transactions: [{ permissionContext: delegations as never, executions }],
    destinationUrl: process.env.NEXT_PUBLIC_ONESHOT_WEBHOOK_URL || undefined,
    memo: "kuot-payout",
  });

  return {
    taskId: result.TaskId,
    feeAmount: feeAmount.toString(),
    workAmount: workAmount.toString(),
    relayer: caps.targetAddress,
  };
}
