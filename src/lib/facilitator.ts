/**
 * x402 7710 facilitator — Kuot
 *
 * A facilitator is the service an x402 resource server calls to (1) VERIFY a
 * payment payload and (2) SETTLE it on-chain. The Gateway track explicitly suggests
 * "build your own x402 7710 facilitator on top of the Gateway public relayer" — this
 * is exactly that: we verify the ERC-7710 "exact" payment, then settle it gas-free
 * by relaying the delegation redemption through Circle Gateway.
 *
 * Endpoints: /api/facilitator/{supported,verify,settle}. The verify logic here is
 * pure so it can be unit-tested without a network.
 */
import { decodeFunctionData, erc20Abi, getAddress, isAddressEqual } from "viem";
import type { PaymentPayload, PaymentRequirements } from "./x402";

export type VerifyResult = { isValid: boolean; invalidReason?: string; payer?: string };

const eq = (a?: string, b?: string) => {
  try {
    return Boolean(a && b && isAddressEqual(getAddress(a), getAddress(b)));
  } catch {
    return false;
  }
};

/**
 * Verify an x402 ERC-7710 payment against the resource's requirements. Pure.
 * Checks scheme/network/method/delegationManager, and decodes the execution to
 * confirm it transfers ≥ the required amount of the right asset to payTo.
 */
export function verifyPayment(payload: PaymentPayload, reqs: PaymentRequirements): VerifyResult {
  if (payload.scheme !== reqs.scheme) return { isValid: false, invalidReason: "scheme_mismatch" };
  if (payload.network !== reqs.network) return { isValid: false, invalidReason: "network_mismatch" };
  const p = payload.payload;
  if (p?.method !== "erc7710") return { isValid: false, invalidReason: "unsupported_method" };
  if (reqs.extra && !eq(p.delegationManager, reqs.extra.delegationManager))
    return { isValid: false, invalidReason: "delegation_manager_mismatch" };
  if (!p.permissionContext || p.permissionContext === "0x")
    return { isValid: false, invalidReason: "missing_permission_context" };
  if (!eq(p.execution?.to, reqs.asset))
    return { isValid: false, invalidReason: "execution_not_asset_transfer" };

  // Decode the execution: it must be an ERC20 transfer to payTo of ≥ required amount.
  let to: string;
  let amount: bigint;
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data: p.execution.data });
    if (d.functionName !== "transfer") return { isValid: false, invalidReason: "not_a_transfer" };
    [to, amount] = d.args as [string, bigint];
  } catch {
    return { isValid: false, invalidReason: "undecodable_execution" };
  }
  if (!eq(to, reqs.payTo)) return { isValid: false, invalidReason: "wrong_recipient" };
  if (amount < BigInt(reqs.maxAmountRequired))
    return { isValid: false, invalidReason: "insufficient_amount" };

  return { isValid: true, payer: p.delegationManager };
}

/** Map an x402 network string to a chainId for the Circle Gateway. */
export function networkToChainId(network: string): number | undefined {
  const m: Record<string, number> = {
    arc: 5042002,
    "arc-testnet": 5042002,
    "eip155:5042002": 5042002,
    base: 8453,
    "base-mainnet": 8453,
    "eip155:8453": 8453,
    "base-sepolia": 84532,
    "eip155:84532": 84532,
    sepolia: 11155111,
    "ethereum-sepolia": 11155111,
    "eip155:11155111": 11155111,
    optimism: 10,
    "eip155:10": 10,
    arbitrum: 42161,
    "eip155:42161": 42161,
  };
  return m[network.toLowerCase()];
}

/** Schemes/networks this facilitator supports (for GET /supported). */
export const SUPPORTED_KINDS = [
  // Kuot primary: Circle Gateway batched settlement on Arc (gas-free nanopayments).
  { x402Version: 1, scheme: "exact", network: "arc-testnet", extra: { name: "GatewayWalletBatched", version: "1" } },
  // Legacy ERC-7710 paths (kept during the port).
  { x402Version: 1, scheme: "exact", network: "base", extra: { method: "erc7710" } },
  { x402Version: 1, scheme: "exact", network: "base-sepolia", extra: { method: "erc7710" } },
  { x402Version: 1, scheme: "exact", network: "sepolia", extra: { method: "erc7710" } },
] as const;
