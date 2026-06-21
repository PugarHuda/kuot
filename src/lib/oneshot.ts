/**
 * 1Shot Permissionless Relayer client — Kuot
 *
 * Gas abstraction for EIP-7710 smart accounts over plain JSON-RPC (no signup,
 * no API key for the public relayer). Used to relay Kuot's attestAndSplit /
 * author-payout transactions on MAINNET while paying gas in stablecoins
 * (USDC/USDT/USDG/MUSD), with EIP-7702 authorizations upgrading the EOA to a
 * smart account. Qualifying path for the "Best Use of 1Shot Relayer" track.
 *
 * Endpoint + method shapes verified from
 * https://1shotapi.com/docs/quickstarts/gas-sponsorship-eip7710 (2026-06-11):
 *   POST https://relayer.1shotapi.com/relayers   (Content-Type: application/json)
 *
 *   relayer_getCapabilities  params: ["<chainId>"]            → chains, payment tokens, feeCollector, targetAddress
 *   relayer_getFeeData       params: [{ chainId, token }]     → gasPrice, rate, minFee, expiry, context
 *   relayer_estimate7710Transaction params: <send shape minus context> → success, requiredPaymentAmount, gasUsed, context
 *   relayer_send7710Transaction     params: <permission context + executions + signed context + destinationUrl + taskId + memo> → TaskId
 *   relayer_getStatus        params: ["<TaskId>"]             → Pending|Submitted|Confirmed|Rejected|Reverted
 *
 * Status: prefer webhooks (destinationUrl) with Ed25519 signature verification
 * against the relayer JWKS; poll relayer_getStatus every 2-3s as fallback.
 */

const TESTNET_CHAINS = new Set(["11155111", "84532"]); // Sepolia, Base Sepolia

/** Pick the relayer endpoint: testnets are served by .dev, mainnets by .com. */
export function relayerUrlForChain(chainId: number | string): string {
  if (process.env.ONESHOT_RELAYER_URL) return process.env.ONESHOT_RELAYER_URL;
  return TESTNET_CHAINS.has(String(chainId))
    ? "https://relayer.1shotapi.dev/relayers"
    : "https://relayer.1shotapi.com/relayers";
}

let _id = 0;

// JSON-RPC params may be an array (getCapabilities) or an object (getFeeData/send).
async function rpc<T>(method: string, params: unknown, url: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }),
  });
  if (!res.ok) throw new Error(`1Shot ${method} HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) throw new Error(`1Shot ${method} RPC ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

/** Recursively convert bigint → 0x-hex and Uint8Array → hex for JSON-RPC. */
export function toRelayerJson(value: unknown): unknown {
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toRelayerJson(v);
    return out;
  }
  return value;
}

/** Per-chain capabilities (verified live shape, 2026-06-11). */
export type ChainCapabilities = {
  /** Fee payment recipient — include a stablecoin transfer here in the bundle. */
  feeCollector: `0x${string}`;
  /** The delegation `to` (delegate) address. Delegations MUST target this or
   *  redemption fails. The session account redelegates to it for the 1Shot path. */
  targetAddress: `0x${string}`;
  tokens: { address: `0x${string}`; symbol: string; decimals: string }[];
};

/** relayer_getCapabilities returns a map keyed by chainId string. */
export type RelayerCapabilities = Record<string, ChainCapabilities>;

export type FeeData = {
  gasPrice: string;
  rate: number;
  minFee: string;
  expiry: number;
  feeCollector: `0x${string}`;
  targetAddress: `0x${string}`;
  token?: { address: `0x${string}`; symbol: string; decimals: number; name?: string };
  /** Opaque signed quote to pass back into send7710Transaction. */
  context: string;
};

/** Full capabilities map (keyed by chainId string). */
export function getCapabilities(chainId: number): Promise<RelayerCapabilities> {
  return rpc<RelayerCapabilities>("relayer_getCapabilities", [String(chainId)], relayerUrlForChain(chainId));
}

/** Convenience: accepted fee tokens + collector for one chain. Call before sending. */
export async function getChainCapabilities(chainId: number): Promise<ChainCapabilities | undefined> {
  const caps = await getCapabilities(chainId);
  return caps[String(chainId)];
}

/** Pre-bundle rough quote. feeAmount owed = max(convertedFee, minFee).
 *  params is an object (not array) with chainId as a string. */
export function getFeeData(chainId: number, token: `0x${string}`): Promise<FeeData> {
  return rpc<FeeData>("relayer_getFeeData", { chainId: String(chainId), token }, relayerUrlForChain(chainId));
}

/**
 * One execution to run under the delegation (e.g. the fee transfer to
 * feeCollector, or attestAndSplit). Field is `target` (not `to`) per the relayer.
 */
export type Execution7710 = { target: `0x${string}`; value: string; data: `0x${string}` };

/** A signed ERC-7710 delegation (serialize bigints/bytes to hex before sending). */
export type Delegation7710 = {
  delegate: `0x${string}`; // = targetAddress from getCapabilities
  delegator: `0x${string}`; // = signer's smart account
  authority: string; // bytes32; "0x000…0" for root
  caveats: { enforcer: `0x${string}`; terms: string; args: string }[];
  salt: string; // 32-byte hex, fresh per delegation
  signature: string; // from smartAccount.signDelegation
};

/** One delegation chain + the executions it authorizes. */
export type DelegatedTransaction7710 = {
  permissionContext: Delegation7710[]; // chain length 1 for direct delegation
  executions: Execution7710[];
};

export type AuthorizationListEntry = {
  address: `0x${string}`;
  chainId: number | string;
  nonce: number | string;
  r: `0x${string}`;
  s: `0x${string}`;
  yParity: number | string;
};

/**
 * Submit a 7710 redeem bundle. Params is an OBJECT (not array). All transactions
 * are merged into one on-chain redeemDelegations batch.
 *
 * GOTCHAS (verified):
 *  - Browser wallets (ERC-7715) handle the EIP-7702 upgrade automatically → omit
 *    `authorizationList`. Local/script signers include ONE entry, first-use only.
 *  - Fresh delegation salt per delegation; bigint/bytes → hex.
 *  - Self-sponsored: one delegation scoping feeAmount + workAmount, two
 *    executions [feeTransfer→feeCollector, workCall]. Always pass `context` from estimate.
 */
export type Send7710TransactionParams = {
  chainId: string;
  transactions: DelegatedTransaction7710[];
  authorizationList?: AuthorizationListEntry[];
  context?: string; // signed price-lock from estimate
  taskId?: `0x${string}`;
  destinationUrl?: string;
  memo?: string;
};

/** The relayer returns a TaskId used to track the bundle. */
export type Send7710Result = { TaskId: string };

export function send7710Transaction(params: Send7710TransactionParams): Promise<Send7710Result> {
  return rpc<Send7710Result>("relayer_send7710Transaction", params, relayerUrlForChain(params.chainId));
}

export type EstimateResult = {
  success: boolean;
  error?: string;
  requiredPaymentAmount?: string;
  gasUsed?: Record<string, string>;
  context?: string;
};

/** Same params as send, minus `context`. Call immediately before send. */
export function estimate7710Transaction(
  params: Omit<Send7710TransactionParams, "context">,
): Promise<EstimateResult> {
  return rpc<EstimateResult>("relayer_estimate7710Transaction", params, relayerUrlForChain(params.chainId));
}

export type RelayerStatusValue = "Pending" | "Submitted" | "Confirmed" | "Rejected" | "Reverted";
export type RelayerStatus = { status: RelayerStatusValue; txHash?: `0x${string}`; chainId?: number };

export function getStatus(taskId: string, chainId: number | string = 1): Promise<RelayerStatus> {
  return rpc<RelayerStatus>("relayer_getStatus", [taskId], relayerUrlForChain(chainId));
}

/** Poll helper for when webhooks aren't wired (every 2-3s per docs). */
export async function waitForStatus(
  taskId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<RelayerStatus> {
  const interval = opts.intervalMs ?? 2500;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  for (;;) {
    const s = await getStatus(taskId);
    if (s.status === "Confirmed" || s.status === "Rejected" || s.status === "Reverted") return s;
    if (Date.now() > deadline) return s;
    await new Promise((r) => setTimeout(r, interval));
  }
}
