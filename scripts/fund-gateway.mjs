#!/usr/bin/env node
/** Fund the agent's Circle Gateway balance on Arc (real on-chain deposit). */
import { readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
function loadEnv(p = ".env") { try { for (const l of readFileSync(p, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim(); } } catch {} }
loadEnv();

const pk = process.env.AGENT_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
const amount = process.argv[2] ?? "1.0";
const client = new GatewayClient({ chain: "arcTestnet", privateKey: pk.startsWith("0x") ? pk : `0x${pk}`, rpcUrl: process.env.ARC_RPC_URL });

console.log("agent:", client.address);
console.log("balances before:", JSON.stringify(await client.getBalances(), (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
console.log(`depositing ${amount} USDC into Circle Gateway…`);
const res = await client.deposit(amount);
console.log("  approvalTx:", res.approvalTxHash ?? "(already approved)");
console.log("  depositTx :", res.depositTxHash);
console.log("balances after:", JSON.stringify(await client.getBalances(), (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
