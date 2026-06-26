#!/usr/bin/env node
/**
 * One command to switch ORCID OAuth ON in production, end to end.
 *
 * Prereqs (one-time, by you): register a public-API OAuth client at
 *   orcid.org → Developer Tools, redirect URI:
 *   https://kuot-azure.vercel.app/api/auth/orcid/callback
 * then run, from kuot/:
 *   node scripts/wire-orcid.mjs <CLIENT_ID> <CLIENT_SECRET>
 *   (or set ORCID_CLIENT_ID / ORCID_CLIENT_SECRET in the env and run with no args)
 *
 * It writes the creds to local .env, pushes them (plus the existing
 * ORCID_COOKIE_SECRET + NEXT_PUBLIC_SITE_URL) to Vercel production, triggers a
 * prod deploy, and polls /api/auth/orcid/status until {"enabled":true}.
 *
 * Requires the Vercel CLI authed + the project linked (.vercel/project.json).
 * Add --sandbox to target sandbox.orcid.org for a dry run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => a !== "--sandbox");
const SANDBOX = process.argv.includes("--sandbox");
const CLIENT_ID = args[0] ?? process.env.ORCID_CLIENT_ID;
const CLIENT_SECRET = args[1] ?? process.env.ORCID_CLIENT_SECRET;
const SITE = "https://kuot-azure.vercel.app";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("usage: node scripts/wire-orcid.mjs <CLIENT_ID> <CLIENT_SECRET> [--sandbox]");
  process.exit(1);
}

const envPath = new URL("../.env", import.meta.url);
let env = readFileSync(envPath, "utf8");
const upsert = (k, v) => {
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env.replace(/\n*$/, `\n${k}=${v}\n`);
};
upsert("ORCID_CLIENT_ID", CLIENT_ID);
upsert("ORCID_CLIENT_SECRET", CLIENT_SECRET);
if (SANDBOX) upsert("ORCID_OAUTH_BASE", "https://sandbox.orcid.org");
writeFileSync(envPath, env);
console.log("✓ wrote ORCID creds to local .env");

const cookieSecret = (env.match(/^ORCID_COOKIE_SECRET=(.*)$/m) || [])[1]?.trim();
if (!cookieSecret || cookieSecret.length < 16) {
  console.error("✗ ORCID_COOKIE_SECRET missing/too short in .env (min 16 chars) — set it first.");
  process.exit(1);
}

// Push each var to Vercel production (rm-then-add so it's idempotent).
const vercel = (cmdArgs, input) =>
  execFileSync("vercel", cmdArgs, { input, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
const setEnv = (key, value) => {
  try { vercel(["env", "rm", key, "production", "--yes"]); } catch { /* not present yet */ }
  vercel(["env", "add", key, "production"], `${value}\n`);
  console.log(`✓ set ${key} on Vercel production`);
};
setEnv("ORCID_CLIENT_ID", CLIENT_ID);
setEnv("ORCID_CLIENT_SECRET", CLIENT_SECRET);
setEnv("ORCID_COOKIE_SECRET", cookieSecret);
setEnv("NEXT_PUBLIC_SITE_URL", SITE);
if (SANDBOX) setEnv("ORCID_OAUTH_BASE", "https://sandbox.orcid.org");

console.log("\ntriggering production deploy…");
vercel(["--prod", "--yes"]);

// Poll the live status endpoint until OAuth reports enabled.
console.log("\npolling /api/auth/orcid/status …");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) {
  await sleep(5000);
  try {
    const s = await (await fetch(`${SITE}/api/auth/orcid/status`)).json();
    if (s.enabled) {
      console.log(`\n✅ ORCID OAuth is LIVE — real researchers can now verify and claim.`);
      console.log(`   Test: ${SITE}/dashboard/claim → "Verify with ORCID"`);
      process.exit(0);
    }
    process.stdout.write(".");
  } catch { process.stdout.write("x"); }
}
console.log("\n⚠ deploy done but status still enabled:false — check Vercel env + redeploy.");
process.exit(1);
