import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Manual click-through of the live Kuot UI. Each test loads a real page and
 * (where it matters) clicks a real control, asserting the page works and fails
 * gracefully. The headline test clicks the Cite-from-wallet button with no wallet
 * installed and asserts a clean error — not a white-screen crash.
 */

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
  return String(json.path).replace("/r/", "");
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

test("CiteButton: clicking with no wallet fails gracefully (no crash, real error)", async ({ page, request }) => {
  const id = await makeShare(request);
  // The on-chain publish may take a moment to index; retry the page load.
  let loaded = false;
  for (let i = 0; i < 6 && !loaded; i++) {
    const resp = await page.goto(`/r/${id}`);
    loaded = Boolean(resp?.ok()) && (await page.locator("body").innerText()).includes("Cite this answer");
    if (!loaded) await page.waitForTimeout(2500);
  }
  expect(loaded, "share page with the Cite button should render").toBeTruthy();

  const cite = page.getByRole("button", { name: /Cite this answer/i });
  await expect(cite).toBeVisible();
  await cite.click();

  // No injected wallet in headless Chromium → a clean, human-readable error and
  // the page is still alive (button still on screen). It must NOT double-charge or
  // throw an uncaught render error.
  await expect(page.getByText(/No wallet detected/i)).toBeVisible();
  await expect(cite).toBeVisible();
});

test("share page 'Run your own' navigates to research (real click)", async ({ page, request }) => {
  const id = await makeShare(request);
  let loaded = false;
  for (let i = 0; i < 6 && !loaded; i++) {
    const resp = await page.goto(`/r/${id}`);
    loaded = Boolean(resp?.ok()) && (await page.locator("body").innerText()).includes("Run your own");
    if (!loaded) await page.waitForTimeout(2500);
  }
  expect(loaded).toBeTruthy();
  await page.getByRole("link", { name: /Run your own/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/research/);
});
