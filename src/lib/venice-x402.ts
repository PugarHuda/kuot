/**
 * x402-pay-Venice — Kuot
 *
 * Venice's API is itself x402-gated: a request with no API key returns HTTP 402
 * with payment requirements (USDC on Base, the "exact" EIP-3009 scheme, x402 v2).
 * This module lets the agent pay Venice per the x402 spec instead of using a key —
 * combining Venice + x402 + on-chain payment, which the Venice track rewards.
 *
 * Verifiable for free: `parseVenice402` reads Venice's real 402 (see /api/venice-x402/quote).
 * Activating a paid session costs the amount Venice quotes (≈10 USDC on Base) — so the
 * full settle is wired + unit-tested but not auto-run; fund the agent to enable it.
 */
import { getAddress, type Address } from "viem";

export type VeniceRequirement = {
  x402Version: number;
  scheme: "exact";
  network: string; // "eip155:8453"
  chainId: number; // 8453
  asset: Address; // USDC on Base
  amount: string; // base units (6 decimals)
  payTo: Address;
  name: string; // EIP-712 domain name (e.g. "USD Coin")
  version: string; // EIP-712 domain version (e.g. "2")
};

/** Parse Venice's 402 body → the EVM (eip155) "exact" requirement. Pure + testable. */
export function parseVenice402(body: {
  x402Version?: number;
  accepts?: {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    extra?: { name?: string; version?: string };
  }[];
}): VeniceRequirement | null {
  const evm = (body.accepts ?? []).find((a) => a.scheme === "exact" && a.network.startsWith("eip155:"));
  if (!evm) return null;
  const chainId = Number(evm.network.split(":")[1]);
  if (!chainId) return null;
  return {
    x402Version: body.x402Version ?? 2,
    scheme: "exact",
    network: evm.network,
    chainId,
    asset: getAddress(evm.asset),
    amount: evm.amount,
    payTo: getAddress(evm.payTo),
    name: evm.extra?.name ?? "USD Coin",
    version: evm.extra?.version ?? "2",
  };
}

/** EIP-3009 TransferWithAuthorization typed-data for the "exact" USDC scheme. Pure. */
export function buildEip3009TypedData(req: VeniceRequirement, payer: Address, nonce: `0x${string}`, validBeforeSec: number) {
  return {
    domain: { name: req.name, version: req.version, chainId: req.chainId, verifyingContract: req.asset },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: payer,
      to: req.payTo,
      value: BigInt(req.amount),
      validAfter: 0n,
      validBefore: BigInt(validBeforeSec),
      nonce,
    },
  };
}

/** Encode an x402 v2 "exact" payment into the X-PAYMENT header value. Pure. */
export function encodeVenicePaymentHeader(req: VeniceRequirement, authorization: Record<string, string>, signature: `0x${string}`): string {
  const payload = {
    x402Version: req.x402Version,
    scheme: "exact",
    network: req.network,
    payload: { signature, authorization },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export type Eip712TypedData = ReturnType<typeof buildEip3009TypedData>;

/**
 * Full x402-pay-Venice handshake: call Venice with no key → on 402, sign an
 * EIP-3009 authorization for the quoted USDC → retry with the X-PAYMENT header →
 * return Venice's response. `signTypedData`, `fetchImpl`, `nonce`, and
 * `validBeforeSec` are injected so this is deterministic and unit-testable.
 * Settling actually costs the quoted amount (≈10 USDC on Base).
 */
export async function payVeniceX402(opts: {
  body: object;
  account: Address;
  signTypedData: (td: Eip712TypedData) => Promise<`0x${string}`>;
  nonce: `0x${string}`;
  validBeforeSec: number;
  base?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ paid: boolean; status: number; data?: unknown; requirement?: VeniceRequirement; reason?: string }> {
  const f = opts.fetchImpl ?? fetch;
  const base = opts.base ?? "https://api.venice.ai/api/v1";
  const url = `${base}/chat/completions`;

  const first = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(opts.body) });
  if (first.status !== 402) {
    return { paid: false, status: first.status, data: await first.json().catch(() => null), reason: "not_402" };
  }

  const req = parseVenice402(await first.json());
  if (!req) return { paid: false, status: 402, reason: "no_evm_requirement" };

  const typed = buildEip3009TypedData(req, opts.account, opts.nonce, opts.validBeforeSec);
  const signature = await opts.signTypedData(typed);
  const authorization = {
    from: opts.account,
    to: req.payTo,
    value: req.amount,
    validAfter: "0",
    validBefore: String(opts.validBeforeSec),
    nonce: opts.nonce,
  };
  const header = encodeVenicePaymentHeader(req, authorization, signature);

  const paidRes = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-PAYMENT": header },
    body: JSON.stringify(opts.body),
  });
  return { paid: paidRes.ok, status: paidRes.status, data: await paidRes.json().catch(() => null), requirement: req };
}
