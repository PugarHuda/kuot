/**
 * ERC-7715 Advanced Permissions + ERC-7710 redemption — Kuot
 *
 * The qualification gate for the hackathon. Flow:
 *   1. User (in MetaMask Flask) grants ONE scoped permission: a periodic USDC
 *      budget — "the agent may spend max N USDC per period". This maps directly
 *      from Kutip's SpendingIntent. Granting is an EIP-712 signature that
 *      creates an ERC-7710 delegation (off-chain, gasless).
 *   2. The agent's session account redeems that delegation (ERC-7710) to pay for
 *      papers / Venice inference via x402, and to run attestAndSplit.
 *   3. For A2A: the Researcher redelegates a NARROWER slice of its permission
 *      context to the Summarizer (authority only narrows).
 *
 * Supported permission types in @metamask/smart-accounts-kit@1.6.0 (8 total):
 *   erc20-token-periodic, erc20-token-stream, erc20-token-allowance,
 *   erc20-token-revocation, native-token-periodic, native-token-stream,
 *   native-token-allowance, token-approval-revocation.
 * Kuot uses erc20-token-periodic for the USDC budget.
 *
 * ⚠️ Requires MetaMask Flask 13.5.0+ (13.9.0+ auto-upgrades the EOA to a smart
 * account). Run Flask in a separate browser profile.
 */
import type { WalletClient } from "viem";
import {
  erc7715ProviderActions,
  erc7710WalletActions,
  redelegatePermissionContextAction,
  type PermissionRequestParameter,
  type GetGrantedExecutionPermissionsResult,
} from "@metamask/smart-accounts-kit/actions";
import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { decodeDelegations, DELEGATION_ABI_TYPE } from "@metamask/smart-accounts-kit/utils";
import { PERMISSION_CHAIN, USDC, usdc } from "./chains";

export type BudgetParams = {
  /** Session account that will redeem (the agent's account). */
  sessionAccount: `0x${string}`;
  /** Per-period spend cap, in human USDC (e.g. 10 = 10 USDC). */
  perPeriodUSDC: number;
  /** Period length in seconds (e.g. 86400 = one day). */
  periodSeconds: number;
  /** Permission expiry (unix seconds). */
  expiry: number;
  chainId?: number;
};

/**
 * Construct the ERC-7715 request for a periodic USDC budget.
 * Pass the result to `requestBudgetPermission`.
 */
export function buildBudgetRequest(p: BudgetParams): PermissionRequestParameter[] {
  const chainId = p.chainId ?? PERMISSION_CHAIN.id;
  const tokenAddress = USDC[chainId];
  if (!tokenAddress) throw new Error(`No USDC address configured for chain ${chainId}`);

  return [
    {
      chainId,
      to: p.sessionAccount,
      expiry: p.expiry,
      redeemer: [p.sessionAccount],
      permission: {
        type: "erc20-token-periodic",
        isAdjustmentAllowed: false,
        data: {
          periodAmount: usdc(p.perPeriodUSDC),
          periodDuration: p.periodSeconds,
          tokenAddress,
          justification: "Kuot research agent budget — pays paper access & splits USDC to cited authors",
        },
      },
    },
  ];
}

/**
 * Client-side: ask MetaMask (Flask) to grant the budget permission.
 * Returns the granted permission contexts (permissionsContext + delegationManager)
 * that the session account later redeems.
 */
export async function requestBudgetPermission(
  walletClient: WalletClient,
  params: BudgetParams,
): Promise<GetGrantedExecutionPermissionsResult> {
  const client = walletClient.extend(erc7715ProviderActions());
  return client.requestExecutionPermissions(buildBudgetRequest(params));
}

/**
 * Session-account side (EOA): redeem a granted delegation to execute a call on
 * the user's behalf. Sends to the DelegationManager. Use for x402 payments and
 * for attestAndSplit when not relaying via 1Shot.
 */
export async function redeemWithDelegation(
  sessionWallet: WalletClient,
  args: {
    permissionsContext: `0x${string}`;
    delegationManager: `0x${string}`;
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
    accountMetadata?: unknown;
  },
): Promise<`0x${string}`> {
  const client = sessionWallet.extend(erc7710WalletActions());
  return client.sendTransactionWithDelegation({
    permissionsContext: args.permissionsContext,
    delegationManager: args.delegationManager,
    to: args.to,
    data: args.data,
    value: args.value ?? 0n,
    accountMetadata: args.accountMetadata as never,
  } as never);
}

/**
 * A2A redelegation: the Researcher redelegates a (narrowed) slice of its granted
 * permission to the Summarizer. Authority only narrows — added caveats can only
 * tighten, never loosen, so the Summarizer can never redeem more than the
 * Researcher holds. Returns the new (narrowed) permission context.
 */
export async function redelegateTo(
  researcherWallet: WalletClient,
  args: {
    to: `0x${string}`;
    permissionContext: unknown;
    chainId?: number;
    /** Narrowing caveats (e.g. a smaller cap, shorter expiry, scoped target). */
    caveats?: unknown;
  },
): Promise<unknown> {
  const chainId = args.chainId ?? PERMISSION_CHAIN.id;
  const environment = getSmartAccountsEnvironment(chainId);
  return redelegatePermissionContextAction(researcherWallet as never, {
    to: args.to,
    permissionContext: args.permissionContext as never,
    environment,
    chainId,
    caveats: args.caveats as never,
  });
}

/**
 * Revoke a granted budget ON-CHAIN: the delegator (user) calls
 * `disableDelegation` on the DelegationManager for the root delegation decoded
 * from the granted context. After this the Researcher can no longer redeem the
 * permission — a real cancel, not just a UI reset. Costs gas (user-paid).
 */
const DISABLE_DELEGATION_ABI = [
  {
    type: "function",
    name: "disableDelegation",
    stateMutability: "nonpayable",
    inputs: [{ ...DELEGATION_ABI_TYPE, name: "_delegation" }],
    outputs: [],
  },
] as const;

export async function revokeBudget(
  userWallet: WalletClient,
  args: { permissionContext: unknown; delegationManager: `0x${string}`; chainId?: number },
): Promise<`0x${string}`> {
  // decodeDelegations wants the hex permissionsContext string. The granted value
  // is an array of { context: "0x…", delegationManager, … } — pull the hex out
  // (accept a raw hex string too for flexibility).
  const ctx = args.permissionContext;
  const hex =
    typeof ctx === "string"
      ? (ctx as `0x${string}`)
      : (Array.isArray(ctx) ? (ctx[0] as { context?: `0x${string}` })?.context : undefined);
  if (!hex) throw new Error("permission context hex not found");
  const delegations = decodeDelegations(hex as never) as unknown[];
  if (!delegations.length) throw new Error("No delegation found in permission context");
  const account = userWallet.account;
  if (!account) throw new Error("Wallet has no account");
  return userWallet.writeContract({
    address: args.delegationManager,
    abi: DISABLE_DELEGATION_ABI,
    functionName: "disableDelegation",
    args: [delegations[0] as never],
    account,
    chain: userWallet.chain,
  });
}
