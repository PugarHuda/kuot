/**
 * Generate natural-voice narration per pitch slide via Venice TTS (kokoro).
 * Output: video-out/audio/NN.mp3  (order matches the /slide deck).
 * Run: node --env-file=.env scripts/video/gen-audio.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error("set VENICE_API_KEY");
const VOICE = process.env.VENICE_TTS_VOICE ?? "af_sky";

// Ordered to match the SLIDES array in src/app/slide/page.tsx.
export const NARRATION = [
  ["title", "kuot — the research agent that cites and pays its sources. Built for the MetaMask Smart Accounts Kit, 1Shot, and Venice AI Dev Cook-Off."],
  ["problem", "Here's the problem. A.I. scrapes humanity's research and pays the authors nothing. Every model is built on papers and writing by real people who are never cited, credited, or paid. The incentive to share knowledge quietly erodes."],
  ["solution", "Our solution: an agent that cites and pays. You grant one scoped budget. kuot buys the papers it needs, reads them with Venice, and splits U.S.D.C. back to every author it cites — gasless, non-custodial, and recorded on-chain. Every citation becomes a payment."],
  ["permission", "It starts with one signature. A single E.R.C. seventy-seven-fifteen Advanced Permission, via the MetaMask Smart Accounts Kit: up to ten U.S.D.C. for a twenty-four hour grant. A hard cap that auto-expires. You keep full custody — no blanket approval, no per-action popups."],
  ["mesh", "Under the hood it's a mesh, not a script. The Researcher redelegates strictly narrower budgets using E.R.C. seventy-seven-ten — authority only ever shrinks. A Planner splits the question, a Reader fan-out answers in parallel, a Citation-Matcher weights who gets paid, and a Fact-checker can reject and force a revision. Five real on-chain agents that earn reputation."],
  ["venice", "The agents' brain is Venice — private and uncensored. Five Venice endpoints in the main flow: chat, web search, embeddings, image, and text-to-speech. The embeddings don't just deduplicate — they weight who gets paid."],
  ["pay", "Then authors get paid — gasless, on mainnet. The agent pays for papers via x-four-oh-two. Payouts relay through 1Shot on Base mainnet with an E.I.P. seventy-seven-oh-two account upgrade, gas paid in U.S.D.C. Every citation's share is recorded on-chain, and the contract blocks double payment."],
  ["settlement", "And it's flexible. Non-custodial by default — funds stay in your wallet until the split. But you pick the rail: pay directly in one transaction with no relayer fee, relay gaslessly via 1Shot, escrow for an ORCID claim, or auto-pay on finish. We even offer a custodial, Kutip-style lock-upfront mode as an opt-in."],
  ["proof", "And it's all real. No mocks in the critical path. Six contracts live, a hundred and twelve tests green, five on-chain agents, and a real 1Shot relay executed on Base mainnet."],
  ["tracks", "One product covers every track: Best Agent, Best A2A coordination, Best x-four-oh-two and E.R.C. seventy-seven-ten, Best use of Venice A.I., and Best 1Shot Relayer."],
  ["demo", "And you can see it all yourself. The live app has an interactive guided tour that narrates and points at every feature, navigating section to section on its own — and each research run explains itself, step by step. It's cozy, anime-styled, and fully on-chain."],
  ["close", "kuot — an agent that pays the people it learns from. Try it live at kuot dot vercel dot app. Thank you."],
];

mkdirSync("video-out/audio", { recursive: true });

async function tts(text) {
  const res = await fetch(`${BASE}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: process.env.VENICE_TTS_MODEL ?? "tts-kokoro", input: text, voice: VOICE, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

for (let i = 0; i < NARRATION.length; i++) {
  const [id, text] = NARRATION[i];
  const buf = await tts(text);
  const path = `video-out/audio/${String(i).padStart(2, "0")}.mp3`;
  writeFileSync(path, buf);
  console.log(`✓ ${path} (${id}, ${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log("done.");
