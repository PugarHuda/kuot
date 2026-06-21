/**
 * Screenshot each pitch slide (captions on) at 1280x720 via Playwright.
 * Output: video-out/frames/NN.png. Requires the dev server on :3000.
 * Run: node scripts/video/shoot.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLIDES = 12; // matches src/app/slide/page.tsx

mkdirSync("video-out/frames", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/slide`, { waitUntil: "networkidle" });
// hide the footer nav chrome for a clean, cinematic frame (keep the caption bar)
await page.addStyleTag({
  content:
    "main > div.justify-between{display:none!important} nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher,[data-next-badge-root]{display:none!important}",
});
await page.waitForTimeout(1200); // fonts + first slide-in

for (let i = 0; i < SLIDES; i++) {
  await page.waitForTimeout(700); // let slide-in settle
  const path = `video-out/frames/${String(i).padStart(2, "0")}.png`;
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  console.log(`✓ ${path}`);
  if (i < SLIDES - 1) await page.keyboard.press("ArrowRight");
}

await browser.close();
console.log("done.");
