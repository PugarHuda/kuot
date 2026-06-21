#!/usr/bin/env node
/** Smoke-test StableFX (App Kit Swap) quote USDC->EURC on Arc. */
import { readFileSync } from "node:fs";
import { AppKit, SwapChain } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

function loadEnv(p = ".env") {
  try { for (const l of readFileSync(p, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim(); } } catch {}
}
loadEnv();

const address = process.argv[2] ?? "0x69906004c174c84ba9082f0f85dfa08ca7eb7cea";
const kit = new AppKit();
const adapter = createCircleWalletsAdapter({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });

console.log("estimateSwap 1.0 USDC -> EURC on Arc for", address, "…");
const r = await kit.estimateSwap({
  from: { adapter, chain: SwapChain.Arc_Testnet, address },
  tokenIn: "USDC",
  tokenOut: "EURC",
  amountIn: "1.0",
  config: { kitKey: process.env.KIT_KEY },
});
console.log("  estimated EURC out:", r.estimatedOutput?.amount);
console.log("  full:", JSON.stringify(r, null, 2).slice(0, 600));
