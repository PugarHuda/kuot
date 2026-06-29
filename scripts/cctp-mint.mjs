#!/usr/bin/env node
/**
 * CCTP V2 — complete the round-trip: mint on Base the USDC burned on Arc.
 *
 * Pairs with scripts/cctp-burn.mjs. Given the Arc burn tx, this:
 *   1. reads the burn receipt and extracts the CCTP `message` (MessageSent event),
 *   2. polls Circle's Iris attestation service until the message is attested,
 *   3. calls receiveMessage(message, attestation) on Base's MessageTransmitterV2,
 *      minting the USDC to the original mintRecipient.
 *
 * Real + reproducible. Needs: BASE_RPC_URL + the operator funded with Base-Sepolia
 * gas (the mint is a normal tx on Base). Arc CCTP source domain = 26, Base = 6.
 * CCTP V2 uses deterministic (CREATE2) addresses, so MessageTransmitterV2 is the
 * same on Arc and Base: 0xe737e5cebeeba77efe34d4aa090756590b1ce275.
 *
 * Run: node scripts/cctp-mint.mjs <arcBurnTxHash>
 */
import { createPublicClient, createWalletClient, http, getAddress, keccak256, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const E = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();

const ARC_RPC = process.env.ARC_RPC_URL ?? E("ARC_RPC_URL");
const BASE_RPC = process.env.BASE_RPC_URL ?? E("BASE_RPC_URL") ?? "https://sepolia.base.org";
const SRC_DOMAIN = 26; // Arc testnet CCTP domain (decoded from the live burn message)
const MESSAGE_TRANSMITTER = getAddress(
  process.env.CCTP_MESSAGE_TRANSMITTER ?? "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
);
const IRIS = process.env.CCTP_IRIS_URL ?? "https://iris-api-sandbox.circle.com";
const burnTx = process.argv[2];
if (!burnTx) { console.error("usage: node scripts/cctp-mint.mjs <arcBurnTxHash>"); process.exit(1); }

const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" }, rpcUrls: { default: { http: [ARC_RPC] } } });
const baseSepolia = defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" }, rpcUrls: { default: { http: [BASE_RPC] } } });

// MessageSent(bytes message) — keccak256("MessageSent(bytes)")
const MESSAGE_SENT = "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";
const RECEIVE_ABI = [{
  type: "function", name: "receiveMessage", stateMutability: "nonpayable",
  inputs: [{ name: "message", type: "bytes" }, { name: "attestation", type: "bytes" }],
  outputs: [{ type: "bool" }],
}];

const op = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY ?? E("OPERATOR_PRIVATE_KEY"));
const arcPub = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
const basePub = createPublicClient({ chain: baseSepolia, transport: http(BASE_RPC) });
const baseWallet = createWalletClient({ account: op, chain: baseSepolia, transport: http(BASE_RPC) });

/** Extract the CCTP message bytes from the burn receipt's MessageSent log. */
function extractMessage(receipt) {
  for (const lg of receipt.logs) {
    if (lg.topics[0] !== MESSAGE_SENT) continue;
    const hex = lg.data.slice(2);
    const len = parseInt(hex.slice(64, 128), 16);
    return "0x" + hex.slice(128, 128 + len * 2);
  }
  throw new Error("no MessageSent log in burn tx — not a CCTP burn?");
}

async function pollAttestation(messageHash) {
  // Iris V2: GET /v2/messages/{srcDomain}?transactionHash= returns the attestation
  // once status === "complete". Poll with backoff.
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${IRIS}/v2/messages/${SRC_DOMAIN}?transactionHash=${burnTx}`);
    if (res.ok) {
      const j = await res.json();
      const m = (j.messages ?? []).find((x) => keccak256(x.message ?? "0x") === messageHash) ?? j.messages?.[0];
      if (m?.status === "complete" && m.attestation && m.attestation !== "PENDING") return m;
    }
    console.log(`  attestation pending… (${i + 1}/30)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("attestation not ready after ~150s — try again later");
}

async function main() {
  console.log(`operator: ${op.address}\nArc burn: ${burnTx}\nMessageTransmitterV2 (Base): ${MESSAGE_TRANSMITTER}`);
  const receipt = await arcPub.getTransactionReceipt({ hash: burnTx });
  const message = extractMessage(receipt);
  const messageHash = keccak256(message);
  console.log(`message len ${(message.length - 2) / 2} bytes · hash ${messageHash}`);

  console.log(`fetching attestation from ${IRIS} (Arc domain ${SRC_DOMAIN})…`);
  const { message: attMsg, attestation } = await pollAttestation(messageHash);
  console.log(`attestation ready (${attestation.length} chars)`);

  const hash = await baseWallet.writeContract({
    address: MESSAGE_TRANSMITTER, abi: RECEIVE_ABI, functionName: "receiveMessage",
    args: [attMsg ?? message, attestation],
  });
  const rcpt = await basePub.waitForTransactionReceipt({ hash });
  console.log(`\n✅ minted on Base · status ${rcpt.status}`);
  console.log(`   mint tx: ${hash}`);
  console.log(`   explorer: https://sepolia.basescan.org/tx/${hash}`);
  process.exit(rcpt.status === "success" ? 0 : 1);
}
main().catch((e) => { console.error("error:", e.shortMessage ?? e.message ?? e); process.exit(1); });
