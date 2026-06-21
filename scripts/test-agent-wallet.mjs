#!/usr/bin/env node
/**
 * Smoke-test the Circle Agent Wallet on Arc: create wallet → faucet → balance.
 * Run: node scripts/test-agent-wallet.mjs
 */
import { readFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient, Blockchain } from "@circle-fin/developer-controlled-wallets";

function loadEnv(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
    }
  } catch {}
}
loadEnv();

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

console.log("1) create wallet set…");
const ws = await client.createWalletSet({ name: "kuot-agent" });
const walletSetId = ws.data?.walletSet?.id;
console.log("   walletSetId:", walletSetId);

console.log("2) create wallet on Arc testnet…");
const created = await client.createWallets({ blockchains: [Blockchain.ArcTestnet], count: 1, walletSetId });
const wallet = created.data?.wallets?.[0];
console.log("   walletId:", wallet?.id);
console.log("   address :", wallet?.address);

console.log("3) request testnet USDC from faucet…");
try {
  await client.requestTestnetTokens({ address: wallet.address, blockchain: Blockchain.ArcTestnet, usdc: true });
  console.log("   faucet: requested ✓");
} catch (e) {
  console.log("   faucet:", e?.message ?? e);
}

console.log("4) read token balance…");
const bal = await client.getWalletTokenBalance({ id: wallet.id });
console.log("   balances:", JSON.stringify(bal.data?.tokenBalances ?? [], null, 2));
console.log("\nDONE — Agent Wallet live on Arc.");
