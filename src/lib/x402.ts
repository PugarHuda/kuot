/**
 * x402 payments — Kuot
 *
 * x402 (HTTP 402 Payment Required) lets a server demand payment for a resource:
 * the server replies 402 with payment requirements, the client pays and retries
 * with an `X-PAYMENT` header. The official x402 spec lists **ERC-7710 asset
 * transfer** as one of the three ways to settle the "exact" EVM scheme — so a
 * MetaMask Smart Account paying via a 7710 delegation is spec-sanctioned, and
 * uniquely supports MULTI-USE (recurring) payments, unlike EIP-3009 / Permit2.
 *
 * Kuot uses x402 two ways:
 *   1. The agent pays to unlock premium paper full-text (our own x402 gate).
 *   2. (roadmap) The agent pays Venice inference via x402 (USDC on Base).
 *
 * Settlement of the 7710 scheme is done by redeeming the delegation on the
 * DelegationManager (see settlement.ts) — optionally relayed gasless via 1Shot.
 */

export const X402_VERSION = 1;

/** What a server asks for in a 402 response (one entry of `accepts`). */
export type PaymentRequirements = {
  scheme: "exact";
  network: string; // e.g. "base", "base-sepolia", "eip155:8453"
  /** Smallest unit (USDC has 6 decimals). String to stay JSON-safe. */
  maxAmountRequired: string;
  resource: string;
  description: string;
  /** Token contract (USDC). */
  asset: `0x${string}`;
  /** Who gets paid. */
  payTo: `0x${string}`;
  /** Settlement method extensions for the ERC-7710 path. */
  extra?: { method: "erc7710"; delegationManager: `0x${string}` };
  maxTimeoutSeconds?: number;
};

export type Payment402Body = { x402Version: number; accepts: PaymentRequirements[]; error?: string };

/** The client's payment, base64-encoded into the X-PAYMENT header. */
export type PaymentPayload = {
  x402Version: number;
  scheme: "exact";
  network: string;
  /** ERC-7710 permission context proving the delegation, + the execution. */
  payload: {
    method: "erc7710";
    permissionContext: `0x${string}`;
    delegationManager: `0x${string}`;
    /** Encoded transfer execution the facilitator will redeem. */
    execution: { to: `0x${string}`; value: string; data: `0x${string}` };
  };
};

/** Server helper: build a 402 response body demanding `amount` USDC. */
export function require402(req: {
  amountUSDC6: bigint;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  resource: string;
  description: string;
  network: string;
  delegationManager: `0x${string}`;
}): Payment402Body {
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: "exact",
        network: req.network,
        maxAmountRequired: req.amountUSDC6.toString(),
        resource: req.resource,
        description: req.description,
        asset: req.asset,
        payTo: req.payTo,
        extra: { method: "erc7710", delegationManager: req.delegationManager },
        maxTimeoutSeconds: 120,
      },
    ],
  };
}

/** Encode/decode the X-PAYMENT header (base64 JSON of a PaymentPayload). */
export function encodePaymentHeader(p: PaymentPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64");
}
export function decodePaymentHeader(header: string): PaymentPayload {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentPayload;
}

/**
 * Client wrapper: fetch a resource, and if it returns 402, build a 7710 payment
 * via `signPayment` and retry once with the X-PAYMENT header.
 */
export async function payAndFetch(
  url: string,
  init: RequestInit,
  signPayment: (reqs: PaymentRequirements) => Promise<PaymentPayload>,
): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 402) return first;

  const body = (await first.json()) as Payment402Body;
  const reqs = body.accepts?.[0];
  if (!reqs) throw new Error("402 with no payment requirements");

  const payment = await signPayment(reqs);
  const headers = new Headers(init.headers);
  headers.set("X-PAYMENT", encodePaymentHeader(payment));
  return fetch(url, { ...init, headers });
}
