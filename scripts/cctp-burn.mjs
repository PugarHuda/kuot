#!/usr/bin/env node
/**
 * CCTP V2 — burn USDC on Arc for cross-chain mint on Base (domain 6).
 *
 * Reproducible on-chain proof of Circle's CCTP V2: approve the Arc TokenMessengerV2,
 * then call depositForBurn(amount, destinationDomain, mintRecipient, burnToken,
 * destinationCaller, maxFee, minFinalityThreshold). The burned USDC becomes mintable
 * on Base once the Circle attestation is published.
 *
 * This re-creates (and supersedes) the originally hand-run burn
 * 0xceb08d128510915eed26c6b4f300dbaf8abf85d2b87ebd102ec3fb16c2f05715 with code.
 *
 * Run: node scripts/cctp-burn.mjs [amountUSDC=0.05]
 */
import { createPublicClient, createWalletClient, http, getAddress, pad, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const E = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();

const RPC = process.env.ARC_RPC_URL ?? E("ARC_RPC_URL");
const USDC = getAddress(process.env.NEXT_PUBLIC_ARC_USDC ?? E("NEXT_PUBLIC_ARC_USDC") ?? "0x3600000000000000000000000000000000000000");
// Circle CCTP V2 TokenMessengerV2 on Arc testnet (verified from the live burn tx).
const TOKEN_MESSENGER = getAddress(process.env.ARC_CCTP_TOKEN_MESSENGER ?? "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa");
const DEST_DOMAIN = 6; // Base
const amountUSDC = Number(process.argv[2] ?? "0.05");
const amount = BigInt(Math.round(amountUSDC * 1e6));

const chain = { id: 5042002, name: "Arc Testnet", nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" }, rpcUrls: { default: { http: [RPC] } } };

// CCTP V2 depositForBurn (selector 0x8e0250ee).
const MESSENGER_ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
];

const op = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY ?? E("OPERATOR_PRIVATE_KEY"));
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: op, chain, transport: http(RPC) });

async function main() {
  console.log(`operator: ${op.address}\nTokenMessengerV2 (Arc): ${TOKEN_MESSENGER}\nburning ${amountUSDC} USDC → Base (domain ${DEST_DOMAIN})`);

  // 1) approve the TokenMessenger to pull the USDC it burns
  const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [op.address, TOKEN_MESSENGER] });
  if (allowance < amount) {
    const a = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [TOKEN_MESSENGER, amount] });
    await pub.waitForTransactionReceipt({ hash: a });
    console.log(`approved USDC → TokenMessenger · tx ${a}`);
  }

  // 2) burn for cross-chain mint. mintRecipient = operator on Base (left-padded to bytes32),
  //    destinationCaller = 0 (anyone can complete the mint), maxFee 0, fast-finality threshold.
  const mintRecipient = pad(op.address, { size: 32 });
  const burn = await wallet.writeContract({
    address: TOKEN_MESSENGER,
    abi: MESSENGER_ABI,
    functionName: "depositForBurn",
    args: [amount, DEST_DOMAIN, mintRecipient, USDC, pad("0x", { size: 32 }), 0n, 2000],
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash: burn });
  console.log(`\n✅ CCTP V2 depositForBurn · status ${rcpt.status} · ${rcpt.logs.length} logs`);
  console.log(`   burn tx: ${burn}`);
  console.log(`   explorer: https://testnet.arcscan.app/tx/${burn}`);
  console.log(`   → mint on Base via Circle attestation (iris-api.circle.com) to ${op.address}`);
  process.exit(rcpt.status === "success" ? 0 : 1);
}
main().catch((e) => { console.error("error:", e.shortMessage ?? e.message ?? e); process.exit(1); });
