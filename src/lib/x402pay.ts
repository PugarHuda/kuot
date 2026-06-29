/**
 * x402 micropayment + on-chain verification — Kuot
 *
 * Real "exact" x402 settlement for unlocking paid resources (paper full-text):
 *   - the agent pays by sending a real USDC transfer to the resource's payTo
 *   - the resource server verifies the payment ON-CHAIN (the tx is a USDC
 *     Transfer to payTo of >= price) — not a header-shape stub (H1).
 *
 * The production path uses the spec's ERC-7710 delegated method (demonstrated by
 * the gasless redeem flow); this micropayment path is the directly-verifiable
 * HTTP-402 handshake used inside the research flow.
 */
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  erc20Abi,
  http,
  getAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMISSION_CHAIN, USDC } from "./chains";

function rpc() {
  return process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
}
function usdcAddress() {
  return USDC[PERMISSION_CHAIN.id];
}

const pub = () => createPublicClient({ chain: PERMISSION_CHAIN, transport: http(rpc()) });

/** Operator pays `amount6` USDC to `payTo`. Returns tx hash. Throws if unfunded. */
export async function payForResource(payTo: Address, amount6: bigint): Promise<`0x${string}`> {
  const opKey = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!opKey) throw new Error("OPERATOR_PRIVATE_KEY not configured");
  const account = privateKeyToAccount(opKey);
  const balance = (await pub().readContract({
    address: usdcAddress(),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  if (balance < amount6) throw new Error(`operator USDC balance ${balance} < price ${amount6}`);

  const wallet = createWalletClient({ account, chain: PERMISSION_CHAIN, transport: http(rpc()) });
  return wallet.writeContract({
    address: usdcAddress(),
    abi: erc20Abi,
    functionName: "transfer",
    args: [getAddress(payTo), amount6],
  });
}

/**
 * Verify on-chain that `txHash` is a RECENT, confirmed USDC Transfer to `payTo`
 * of >= `amount6`. The recency window stops an attacker from replaying an old
 * historical transfer to `payTo` as if it paid for this request. (A bare
 * amount-to-address check is also reusable; serverless single-use needs a shared
 * store — production binds an EIP-3009 authorization nonce minted in the 402.)
 */
export async function verifyPayment(
  txHash: `0x${string}`,
  payTo: Address,
  amount6: bigint,
  maxAgeSec = 900,
): Promise<boolean> {
  try {
    const receipt = await pub().getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") return false;
    const block = await pub().getBlock({ blockNumber: receipt.blockNumber });
    if (Math.floor(Date.now() / 1000) - Number(block.timestamp) > maxAgeSec) return false;
    const usdc = usdcAddress().toLowerCase();
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdc) continue;
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (
          ev.eventName === "Transfer" &&
          getAddress(ev.args.to as Address) === getAddress(payTo) &&
          (ev.args.value as bigint) >= amount6
        ) {
          return true;
        }
      } catch {
        /* not a Transfer log */
      }
    }
    return false;
  } catch {
    return false;
  }
}
