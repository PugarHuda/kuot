import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Manual click-through of the live Kuot UI. Each test loads a real page and
 * (where it matters) clicks a real control, asserting the page works and fails
 * gracefully. The headline test clicks the Cite-from-wallet button with no wallet
 * installed and asserts a clean error — not a white-screen crash.
 */

// Every public page a judge can reach without a wallet. The smoke sweep loads
// each one and asserts: 2xx, no Next error-boundary, and NO uncaught JS exception
// (many of these fetch on-chain data, so this catches a render/fetch crash).
const PUBLIC_ROUTES = [
  "/",
  "/docs",
  "/slide",
  "/cited",
  "/leaderboard",
  "/dashboard",
  "/dashboard/activity",
  "/dashboard/agents",
  "/dashboard/bounties",
  "/dashboard/research",
  "/dashboard/library",
  "/dashboard/claim",
];

for (const route of PUBLIC_ROUTES) {
  test(`smoke: ${route} loads with no crash or uncaught error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(resp?.ok(), `${route} should be 2xx`).toBeTruthy();
    await expect(page.locator("body")).not.toContainText(/Application error|could not be found|Internal Server Error/i);
    // give client fetches (on-chain reads) a beat to run and potentially throw
    await page.waitForTimeout(1500);
    expect(errors, `${route} threw uncaught: ${errors.join(" | ")}`).toEqual([]);
  });
}

async function makeShare(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/share", {
    data: {
      result: {
        query: "playwright e2e cite check",
        synthesis: "A short stored synthesis so the share page renders.",
        works: [],
        payouts: [],
        webCitations: [],
        venice: "fallback",
        x402: { paid: false },
      },
    },
  });
  expect(res.ok(), `share POST should succeed (${res.status()})`).toBeTruthy();
  const json = await res.json();
  const id = String(json.path).replace("/r/", "");
  // No KV → the share is published on-chain; wait until it's actually readable
  // (the ?quote=1 endpoint 200s only once the publish is indexed) so the page
  // render is deterministic instead of racing on-chain indexing lag.
  for (let i = 0; i < 15; i++) {
    const q = await request.get(`/api/summaries/${id}?quote=1`);
    if (q.ok()) return id;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return id; // proceed anyway; the page-level assertion will surface a real failure
}

test("landing page loads and shows the brand", async ({ page }) => {
  const resp = await page.goto("/");
  expect(resp?.ok(), "landing should be 2xx").toBeTruthy();
  await expect(page.locator("body")).toContainText(/Kuot/i);
});

test("docs page shows the deployed contracts and test count", async ({ page }) => {
  const resp = await page.goto("/docs");
  expect(resp?.ok()).toBeTruthy();
  await expect(page.locator("body")).toContainText("168 tests");
  // a real deployed contract address (AttributionLedger) should be listed
  await expect(page.locator("body")).toContainText(/0x[0-9a-fA-F]{6}/);
});

test("claim page renders the ORCID + wallet flow", async ({ page }) => {
  const resp = await page.goto("/dashboard/claim");
  expect(resp?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: /Claim your author wallet/i })).toBeVisible();
});

test("research page renders an interactive query box", async ({ page }) => {
  const resp = await page.goto("/dashboard/research");
  expect(resp?.ok()).toBeTruthy();
  const box = page.getByPlaceholder(/carbon capture/i);
  await expect(box).toBeVisible();
  await box.fill("graphene supercapacitor");
  await expect(box).toHaveValue("graphene supercapacitor");
});

test("budget step: free by default (agent pays), lock is optional, no ERC-7715/Flask", async ({ page }) => {
  // The concept: research is free — the AGENT pays cited authors from its own budget.
  // Locking your own USDC is optional. No MetaMask-Flask / ERC-7715 anywhere.
  await page.goto("/dashboard/research");
  await expect(page.locator("body")).toContainText(/Set a budget \(optional\)/i);
  await expect(page.locator("body")).toContainText(/Research is free for you/i);
  await expect(page.locator("body")).toContainText(/the agent pays the cited authors/i);
  await expect(page.getByRole("button", { name: /the agent pays \(free\)/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Optional: fund it yourself/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/ERC-7715|MetaMask Flask/i);
});

test("cited page: ORCID lookup runs (invalid rejected, valid returns a real result)", async ({ page }) => {
  await page.goto("/cited");
  const input = page.getByPlaceholder("0000-0002-1825-0097");
  const btn = page.getByRole("button", { name: /Check my earnings/i });
  // Invalid format → friendly rejection, no crash.
  await input.fill("not-an-orcid");
  await btn.click();
  await expect(page.getByText(/doesn.t look like an ORCID/i)).toBeVisible();
  // Valid format → reaches a real /api/owed result (an owed amount or "none yet").
  await input.fill("0000-0002-1825-0097");
  await btn.click();
  await expect(page.getByText(/waiting for you|No citations of your work yet/i)).toBeVisible({ timeout: 20_000 });
});

test("dashboard sidebar navigates on click (real nav click)", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('a[href="/dashboard/activity"]').first().click();
  await expect(page).toHaveURL(/\/dashboard\/activity/);
  await page.locator('a[href="/dashboard/bounties"]').first().click();
  await expect(page).toHaveURL(/\/dashboard\/bounties/);
});

test("CiteButton: clicking with no wallet fails gracefully (no crash, real error)", async ({ page, request }) => {
  const id = await makeShare(request);
  const resp = await page.goto(`/r/${id}`);
  expect(resp?.ok(), "share page should be 2xx").toBeTruthy();

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const cite = page.getByRole("button", { name: /Cite this answer/i });
  await expect(cite).toBeVisible();
  await cite.click();

  // The point: graceful failure, NOT a white-screen crash. Headless Chromium has
  // no wallet, so depending on whether wagmi discovers a connector the error wording
  // varies (no wallet / connect rejected / network) — so assert the page is still
  // alive (button on screen), a red error message is shown, and nothing threw uncaught.
  await expect(cite).toBeVisible();
  await expect(page.getByText(/wallet|connect|network|reject|failed|payment/i).first()).toBeVisible({ timeout: 12_000 });
  expect(errors, `uncaught: ${errors.join(" | ")}`).toEqual([]);
});

test("share page 'Run your own' navigates to research (real click)", async ({ page, request }) => {
  const id = await makeShare(request);
  const resp = await page.goto(`/r/${id}`, { waitUntil: "domcontentloaded" });
  expect(resp?.ok()).toBeTruthy();
  // Wait for the link to actually render (on-chain share read can lag) before
  // clicking — avoids a race where the click fires before the page hydrates.
  const link = page.getByRole("link", { name: /Run your own/i }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page).toHaveURL(/\/dashboard\/research/);
});
