import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E — manual click-through of the LIVE Kuot deploy. These exercise
 * the real UI a judge touches (nav, docs, the share page + Cite-from-wallet
 * button) against production, so they catch render/interaction bugs the unit and
 * API tests can't. Run: `npm run e2e` (set E2E_BASE_URL to test a preview).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://kuot-azure.vercel.app",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
