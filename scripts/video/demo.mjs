/**
 * Live-demo video assets: runs a REAL research query (/api/research), seeds it
 * into the result page's localStorage, then screenshots the real app pages AND
 * the real result (answer + multi-agent trace + author payout) via Playwright,
 * with matching natural-voice narration (Venice TTS).
 * Output: video-out/demo-frames + video-out/demo-audio. Requires dev on :3000.
 * Run: node --env-file=.env scripts/video/demo.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const APP = process.env.BASE_URL ?? "http://localhost:3000";
const BASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error("set VENICE_API_KEY");
const VOICE = process.env.VENICE_TTS_VOICE ?? "af_sky";
const HISTORY_KEY = "kuot:research-history";

// 1) Run a real research query server-side (no wallet needed for the run).
console.log("running real research query…");
const rres = await fetch(`${APP}/api/research`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "perovskite solar cell stability", papers: 5, language: "English", rootBudgetUSDC: 1 }),
});
if (!rres.ok) throw new Error(`/api/research ${rres.status}: ${(await rres.text()).slice(0, 200)}`);
const result = await rres.json();
const id = `1718000000000-${(result.query || "run").toLowerCase().replace(/\W+/g, "-").slice(0, 40)}`;
const entry = { id, query: result.query, savedAt: 1718000000000, venice: result.venice, result };
console.log(`✓ result: "${result.query}" · ${result.payouts?.length ?? 0} authors · venice=${result.venice}`);

// Cues. kind:"url" = a normal page; kind:"result" = the seeded result page.
const CUES = [
  { kind: "url", url: "/", text: "This is kuot — live. An autonomous A.I. research agent that cites and pays the human authors it cites." },
  { kind: "url", url: "/", scrollTo: "From a question to a payment", text: "Right on the landing you can watch one run, end to end: a Planner, parallel Readers, a Citation-Matcher, and a Fact-checker — then the author payout." },
  { kind: "url", url: "/dashboard", text: "The dashboard opens on live on-chain stats — attestations, U.S.D.C. attributed, and authors cited — all read straight from Sepolia." },
  { kind: "url", url: "/dashboard/research", text: "Research is the core. You connect MetaMask Flask and grant one E.R.C. seventy-seven-fifteen budget the agent can never exceed, then ask a question." },
  { kind: "result", text: "Here's a real run. The agent searched OpenAlex's two-hundred-fifty-million-paper index and synthesized a grounded answer with Venice, citing each source." },
  { kind: "result", scrollTo: "Multi-agent trace", text: "The multi-agent trace is real: a Planner splits the question, parallel Readers answer with Venice, a Citation-Matcher ranks relevance, and a Fact-checker verifies — each redelegated a strictly narrower budget over E.R.C. seventy-seven-ten." },
  { kind: "result", scrollTo: "Author payout plan", text: "And here's the payout: every cited author gets a relevance-weighted U.S.D.C. share. One click settles it on-chain with attestAndSplit — no relayer fee, no double pay." },
  { kind: "url", url: "/dashboard/agents", text: "The Agents page shows the five specialists, each a real on-chain principal that earns reputation in the E.R.C. eighty-oh-four registry." },
  { kind: "url", url: "/dashboard/bounties", text: "Anyone can sponsor a research topic with U.S.D.C. When kuot satisfies it, the deposit is paid straight to the cited authors, with no platform fee." },
  { kind: "url", url: "/dashboard/claim", text: "Authors get paid on the Claim page: prove your ORCID, bind your wallet with one signature, and withdraw — plus a twelve-percent citation-loyalty yield." },
  { kind: "url", url: "/dashboard/activity", text: "And it's all public. Activity is a live read of every attestation on-chain, with a leaderboard of the most-cited authors." },
  { kind: "url", url: "/", scrollTo: "Every citation, a real payment", text: "That's the whole loop. kuot — an agent that cites and pays its sources. Every citation, a real payment. Try it at kuot dot vercel dot app." },
];

mkdirSync("video-out/demo-frames", { recursive: true });
mkdirSync("video-out/demo-audio", { recursive: true });

async function tts(text) {
  const res = await fetch(`${BASE}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: process.env.VENICE_TTS_MODEL ?? "tts-kokoro", input: text, voice: VOICE, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

const HIDE = "nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher,[data-next-badge-root]{display:none!important}";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

// Seed the real result into the result page's localStorage (set on app origin).
await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [HISTORY_KEY, JSON.stringify([entry])]);

for (let i = 0; i < CUES.length; i++) {
  const c = CUES[i];
  const nn = String(i).padStart(2, "0");
  const url = c.kind === "result" ? `/dashboard/result/${id}` : c.url;
  await page.goto(`${APP}${url}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1500);
  if (c.scrollTo) {
    try {
      await page.getByText(c.scrollTo, { exact: false }).first().scrollIntoViewIfNeeded({ timeout: 4000 });
      await page.waitForTimeout(900);
    } catch { /* fall back to top */ }
  }
  await page.screenshot({ path: `video-out/demo-frames/${nn}.png`, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  writeFileSync(`video-out/demo-audio/${nn}.mp3`, await tts(c.text));
  console.log(`✓ cue ${nn} → ${url}${c.scrollTo ? ` (#${c.scrollTo})` : ""}`);
}

await browser.close();
console.log("done.");
