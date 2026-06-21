#!/usr/bin/env node
/**
 * One-time: register Kuot's CIRCLE_ENTITY_SECRET with Circle so Developer-Controlled
 * Wallets (agent-wallet.ts) and App Kit Swap (fx.ts) can sign on Arc.
 *
 * Prereqs in .env: CIRCLE_API_KEY (from console.circle.com), CIRCLE_ENTITY_SECRET.
 * Run once:  node scripts/register-entity-secret.mjs
 * (Re-running after a successful registration will error — that's expected.)
 */
import { readFileSync } from "node:fs";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

// Minimal .env loader (no dep): KEY=VALUE lines, ignores comments/blanks.
function loadEnv(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        // strip trailing inline comment (" # ...") and surrounding whitespace
        process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
      }
    }
  } catch {
    /* no .env — rely on process env */
  }
}
loadEnv();

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey) throw new Error("CIRCLE_API_KEY missing — create one at console.circle.com (testnet) and put it in .env");
if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET missing in .env");

const res = await registerEntitySecretCiphertext({ apiKey, entitySecret });
// Save the recovery file Circle returns — it's your only way to recover the secret.
console.log("Registered. Recovery file (store somewhere safe):");
console.log(res.data?.recoveryFile ?? res);
