/**
 * Interactive live-demo video. Records REAL browser video (Playwright recordVideo)
 * of the app being driven — a visible pointer glides to and points at each feature,
 * with real clicks/typing, over a real research run — PLUS on-chain proof cues
 * (the 1Shot 7702 relay on Basescan and an attestAndSplit tx on Etherscan).
 * Generates its own Venice narration (TTS), trims each clip's load lead-in, muxes,
 * and concatenates. Output: video-out/demo.mp4. Requires dev on :3000.
 * Run: node --env-file=.env scripts/video/demo-interactive.mjs
 */
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const APP = process.env.BASE_URL ?? "http://localhost:3000";
const VBASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const VKEY = process.env.VENICE_API_KEY;
if (!VKEY) throw new Error("set VENICE_API_KEY");
const VOICE = process.env.VENICE_TTS_VOICE ?? "af_sky";
const HISTORY_KEY = "kuot:research-history";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ff = (args) => execFileSync(ffmpegPath, args, { stdio: ["ignore", "ignore", "inherit"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function audioDuration(path) {
  let out = "";
  try { execFileSync(ffmpegPath, ["-i", path], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { out = (e.stderr || "").toString(); }
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 6;
}
async function tts(text) {
  const res = await fetch(`${VBASE}/audio/speech`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${VKEY}` },
    body: JSON.stringify({ model: process.env.VENICE_TTS_MODEL ?? "tts-kokoro", input: text, voice: VOICE, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const HIDE = "nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher,[data-next-badge-root]{display:none!important}";

async function ensureCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.style.cssText = "position:fixed;z-index:2147483647;left:640px;top:380px;width:30px;height:30px;margin:-15px 0 0 -15px;border:3px solid #0b6e4f;border-radius:50%;background:rgba(11,110,79,.20);box-shadow:0 0 0 5px rgba(11,110,79,.12),0 2px 8px rgba(0,0,0,.18);pointer-events:none";
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:50%;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#0b6e4f";
    c.appendChild(d);
    (document.body || document.documentElement).appendChild(c);
  }).catch(() => {});
}
async function setCursor(page, x, y) {
  await page.evaluate(([x, y]) => { const c = document.getElementById("__demo_cursor"); if (c) { c.style.left = x + "px"; c.style.top = y + "px"; } }, [x, y]).catch(() => {});
}
// Burned-in subtitle bar (bottom-center), persists through the cue.
async function setCaption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__demo_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_caption";
      el.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;max-width:1060px;width:calc(100% - 90px);background:rgba(13,17,23,.86);color:#fff;font:500 17px/1.42 system-ui,-apple-system,Segoe UI,sans-serif;padding:12px 22px;border-radius:12px;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.32);pointer-events:none;box-sizing:border-box";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => {});
}

const BASESCAN = "https://basescan.org/tx/0x6f4c8d539f9ea34f7e6e0d0730e4ae04fec1d986e5d0641b8b36ab00c6e8480c";
const ETHERSCAN = "https://sepolia.etherscan.io/tx/0xc61adf4ee665794ef6a2588c21dd2469ff6d9855129e9d2d0501d94bd1e1c6c8";

const CUES = [
  { kind: "url", url: "/", points: ["Open the dashboard"], text: "This is kuot — live. An autonomous A.I. research agent that cites and pays the human authors it cites." },
  { kind: "url", url: "/", scrollTo: "From a question to a payment", points: ["From a question to a payment", "Settle"], text: "Right on the landing you can watch one run, end to end: a Planner, parallel Readers, a Citation-Matcher, and a Fact-checker — then the author payout." },
  { kind: "url", url: "/dashboard", points: ['[data-tour="ov-stats"]'], text: "The dashboard opens on live on-chain stats — attestations, U.S.D.C. attributed, and authors cited — all read straight from Sepolia." },
  { kind: "url", url: "/dashboard/research", scrollTo: "Grant a periodic", points: ["0.5 USDC"], click: "0.5 USDC", text: "Research is the core. You connect MetaMask Flask and grant one E.R.C. seventy-seven-fifteen budget the agent can never exceed — a hard cap — then pick a budget for this run." },
  { kind: "url", url: "/dashboard/research", scrollTo: "Agent mesh", expandSel: '[data-tour="mesh"] summary', points: ['[data-tour="mesh"]'], text: "Here's the process. Before it runs, the Researcher builds a mesh: it redelegates a strictly narrower slice of the budget to a Planner, parallel Readers, a Fact-checker, and a Summarizer — authority only ever shrinks." },
  { kind: "url", url: "/dashboard/research", scrollTo: "Ask a research question", type: { sel: '[data-tour="ask"] input, [data-tour="ask"] textarea', text: "What drives perovskite solar cell stability?" }, points: ['[data-tour="ask"]'], text: "Then you ask your question, and the agents go to work — searching OpenAlex, reading the papers with Venice, matching citations, and fact-checking the answer." },
  { kind: "result", points: ["Synthesis"], text: "Moments later, here's the real result. The agent synthesized a grounded answer with Venice, citing each source it used." },
  { kind: "result", scrollTo: "Multi-agent trace", points: ["Multi-agent trace"], text: "The multi-agent trace is real: a Planner splits the question, parallel Readers answer with Venice, a Citation-Matcher ranks relevance, and a Fact-checker verifies — each redelegated a strictly narrower budget over E.R.C. seventy-seven-ten." },
  { kind: "result", scrollTo: "Author payout plan", points: ["Author payout plan"], text: "And here's the payout: every cited author gets a relevance-weighted U.S.D.C. share. One click settles it on-chain with attestAndSplit — no relayer fee, no double pay." },
  { kind: "ext", url: BASESCAN, points: ["0x6f4c8d53"], text: "Payouts can also relay gaslessly through the 1Shot permissionless relayer on Base mainnet. Here's the real transaction — a type-four, E.I.P. seventy-seven-oh-two account upgrade, with gas paid in U.S.D.C." },
  { kind: "ext", url: ETHERSCAN, points: ["0xc61adf4e"], text: "And every citation is recorded on-chain. This is a real attestAndSplit transaction on Etherscan — the attestation and the author payment, in a single transaction." },
  { kind: "url", url: "/dashboard/agents", points: ['[data-tour="agents-list"]'], text: "The Agents page shows the five specialists, each a real on-chain principal that earns reputation in the E.R.C. eighty-oh-four registry." },
  { kind: "url", url: "/dashboard/bounties", points: ['[data-tour="bounty-form"]'], type: { sel: 'input[placeholder*="perovskite"]', text: "stable diffusion safety" }, text: "Anyone can sponsor a research topic with U.S.D.C. When kuot satisfies it, the deposit is paid straight to the cited authors, with no platform fee." },
  { kind: "url", url: "/dashboard/claim", scrollTo: "Verify your ORCID", verifyClaim: "0000-0002-1825-0097", points: ["Your earnings"], text: "Authors get paid on the Claim page. They prove their ORCID — here, the demo verify — and their owed balance appears, ready to withdraw, plus a twelve-percent citation-loyalty yield that ticks up live." },
  { kind: "url", url: "/dashboard/activity", points: ["Top cited authors"], text: "And it's all public. Activity is a live read of every attestation on-chain, with a leaderboard of the most-cited authors." },
  { kind: "url", url: "/", scrollTo: "Every citation, a real payment", points: ["Run a query"], text: "That's the whole loop. kuot — an agent that cites and pays its sources. Every citation, a real payment. Try it at kuot dot vercel dot app." },
];

mkdirSync("video-out/demo-audio", { recursive: true });
mkdirSync("video-out/ivid", { recursive: true });

// Render the REAL live 1Shot mainnet relay (captured in video-out/relay-output.txt by
// scripts/video/relay-run.mjs) as a terminal cue — not re-sent on each build.
console.log("rendering 1Shot live-relay terminal…");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let relayLines = [];
try {
  const raw = readFileSync("video-out/relay-output.txt", "utf8").split(/\r?\n/);
  const end = raw.findIndex((l) => l.includes("relayer_send7710Transaction OK"));
  relayLines = (end >= 0 ? raw.slice(0, end + 1) : raw).filter((l) => l.trim().length).slice(0, 14);
} catch { relayLines = ["(run scripts/video/relay-run.mjs first)"]; }
const oneHtml = `<!doctype html><html><body style="margin:0;background:#0d1117;color:#c9d1d9;font:15px/1.62 Consolas,'Cascadia Code',monospace;padding:44px 56px;height:100vh;box-sizing:border-box">
<div style="color:#7ee787;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px">1Shot Permissionless Relayer · Base mainnet · LIVE 7710 + 7702 relay</div>
<div style="color:#8b949e;margin-bottom:14px"><span style="color:#58a6ff">$</span> node scripts/relay-mainnet-1shot.mjs <span style="color:#6e7681"># gas paid in USDC, no ETH</span></div>
<pre style="white-space:pre-wrap;margin:0">${esc(relayLines.join("\n"))}</pre>
<div style="color:#7ee787;margin-top:18px;font-weight:600">✓ 7710 transaction relayed through 1Shot · EIP-7702 account upgrade · gas paid in USDC</div>
</body></html>`;
writeFileSync("video-out/oneshot.html", oneHtml);
const ONESHOT_URL = pathToFileURL(`${process.cwd()}/video-out/oneshot.html`).href;
CUES.splice(9, 0, { kind: "file", url: ONESHOT_URL, points: ["relayer_send7710Transaction OK", "TaskId"], text: "And here's the 1Shot relayer in action, live on Base mainnet. We sign an E.I.P. seventy-seven-oh-two authorization and submit the seven-seven-ten transaction to the relayer — it accepts it and returns a task id. The relay is real, the gas is paid in U.S.D.C., and the account is upgraded to a smart account." });
console.log(`✓ 1Shot relay terminal rendered (${relayLines.length} lines)`);

console.log("generating narration…");
for (let i = 0; i < CUES.length; i++) writeFileSync(`video-out/demo-audio/${String(i).padStart(2, "0")}.mp3`, await tts(CUES[i].text));
const durs = CUES.map((_, i) => audioDuration(`video-out/demo-audio/${String(i).padStart(2, "0")}.mp3`));

console.log("running real research query…");
const rres = await fetch(`${APP}/api/research`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "perovskite solar cell stability", papers: 5, language: "English", rootBudgetUSDC: 1 }),
});
if (!rres.ok) throw new Error(`/api/research ${rres.status}`);
const result = await rres.json();
const id = `1718000000000-${(result.query || "run").toLowerCase().replace(/\W+/g, "-").slice(0, 40)}`;
const entry = { id, query: result.query, savedAt: 1718000000000, venice: result.venice, result };
console.log(`✓ result seeded: ${result.payouts?.length ?? 0} authors`);

const browser = await chromium.launch();
const segs = [];

for (let i = 0; i < CUES.length; i++) {
  const c = CUES[i];
  const nn = String(i).padStart(2, "0");
  const dur = durs[i];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, userAgent: c.kind === "ext" ? UA : undefined, recordVideo: { dir: "video-out/ivid", size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const video = page.video();

  if (c.kind === "result") {
    await page.goto(`${APP}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [HISTORY_KEY, JSON.stringify([entry])]);
  }
  const external = c.kind === "ext" || c.kind === "file";
  const target = c.kind === "result" ? `${APP}/dashboard/result/${id}` : external ? c.url : `${APP}${c.url}`;
  await page.goto(target, { waitUntil: external ? "domcontentloaded" : "networkidle", timeout: 35000 }).catch(() => {});
  if (!external) await page.addStyleTag({ content: HIDE }).catch(() => {});
  else if (c.kind === "ext") { await sleep(2200); for (const t of ["Accept", "I Agree", "Got it", "Accept all"]) { await page.getByRole("button", { name: t }).first().click({ timeout: 800 }).catch(() => {}); } }
  else await sleep(900);
  if (c.scrollTo) { await page.getByText(c.scrollTo, { exact: false }).first().scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {}); await sleep(500); }
  if (c.expandSel) { await page.locator(c.expandSel).first().click({ timeout: 3000 }).catch(() => {}); await sleep(700); }
  await ensureCursor(page);
  let cur = { x: 640, y: 380 };
  await setCursor(page, cur.x, cur.y);
  await setCaption(page, c.text);
  await sleep(350);

  const tReady = Date.now();
  const glide = async (x, y) => {
    for (let s = 1; s <= 18; s++) { const px = cur.x + (x - cur.x) * s / 18, py = cur.y + (y - cur.y) * s / 18; await page.mouse.move(px, py); await setCursor(page, px, py); await sleep(26); }
    cur = { x, y };
  };
  const pointAt = async (sel) => {
    let box = null;
    try {
      const loc = sel.startsWith("[") ? page.locator(sel).first() : page.getByText(sel, { exact: false }).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
      await ensureCursor(page);
      box = await loc.boundingBox();
    } catch { /* ignore */ }
    if (!box) return null;
    const x = Math.min(1262, Math.max(18, box.x + box.width / 2)), y = Math.min(702, Math.max(18, box.y + box.height / 2));
    await glide(x, y);
    return { x, y };
  };

  // Claim flow: type the ORCID, demo-verify it, then the "Your earnings" panel appears.
  if (c.verifyClaim) {
    const inp = page.locator('input[placeholder*="0000"]').first();
    const box = await inp.boundingBox().catch(() => null);
    if (box) { await glide(box.x + 24, box.y + box.height / 2); await inp.click().catch(() => {}); await inp.fill(c.verifyClaim).catch(() => {}); await sleep(500); }
    const verify = page.getByText("Demo verify", { exact: false }).first();
    const vb = await verify.boundingBox().catch(() => null);
    if (vb) { await glide(vb.x + vb.width / 2, vb.y + vb.height / 2); }
    await verify.click({ timeout: 4000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.goto(`${APP}/dashboard/claim`, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.getByText("Your earnings", { exact: false }).first().scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    cur = { x: 640, y: 380 };
    await ensureCursor(page); await setCursor(page, cur.x, cur.y); await setCaption(page, c.text);
    await sleep(500);
  }

  for (const p of c.points) { await pointAt(p); await sleep(750); }
  if (c.click) { const at = await pointAt(c.click); if (at) { await page.mouse.click(at.x, at.y).catch(() => {}); await sleep(500); } }
  if (c.type) {
    const inp = page.locator(c.type.sel).first();
    const box = await inp.boundingBox().catch(() => null);
    if (box) { await glide(box.x + 24, box.y + box.height / 2); await inp.click().catch(() => {}); await inp.type(c.type.text, { delay: 60 }).catch(() => {}); }
  }
  const visible = (Date.now() - tReady) / 1000;
  if (visible < dur + 0.4) await sleep((dur + 0.4 - visible) * 1000);

  const leadSec = Math.max(0, (tReady - t0) / 1000);
  await page.close();
  await ctx.close();
  const vpath = await video.path();

  const out = `video-out/iseg-${nn}.mp4`;
  ff([
    "-y", "-ss", leadSec.toFixed(2), "-i", vpath, "-i", `video-out/demo-audio/${nn}.mp3`,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-vf", "scale=1280:720,format=yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", "-movflags", "+faststart", out,
  ]);
  segs.push(`file 'iseg-${nn}.mp4'`);
  console.log(`✓ cue ${nn} ${c.kind} (lead ${leadSec.toFixed(1)}s, ${dur.toFixed(1)}s)`);
}
await browser.close();

writeFileSync("video-out/list-iseg.txt", segs.join("\n"));
ff(["-y", "-f", "concat", "-safe", "0", "-i", "video-out/list-iseg.txt", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "video-out/demo.mp4"]);
console.log("✓ video-out/demo.mp4");
