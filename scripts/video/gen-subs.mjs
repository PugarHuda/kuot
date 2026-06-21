/**
 * Rewrite public/pitch.srt + pitch.vtt with timings that match the actual Venice
 * narration audio (video-out/audio/NN.mp3), so the standalone subtitle files line
 * up with the deck. Run: node scripts/video/gen-subs.mjs
 */
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const GAP = 0.45; // matches the deck's inter-slide pause

// Readable subtitle text per slide (order = the /slide deck).
const SUBS = [
  "kuot — the research agent that cites and pays its sources. Built for the MetaMask Smart Accounts Kit, 1Shot, and Venice AI Dev Cook-Off.",
  "Here's the problem. AI scrapes humanity's research and pays the authors nothing. Every model is built on papers and writing by real people who are never cited, credited, or paid.",
  "Our solution: an agent that cites and pays. You grant one scoped budget. kuot buys the papers it needs, reads them with Venice, and splits USDC back to every author it cites.",
  "It starts with one signature. A single ERC-7715 Advanced Permission via the MetaMask Smart Accounts Kit: up to ten USDC for a twenty-four hour grant. A hard cap that auto-expires. You keep full custody.",
  "Under the hood it's a mesh, not a script. The Researcher redelegates strictly narrower budgets using ERC-7710. A Planner splits the question, a Reader fan-out answers in parallel, a Citation-Matcher weights who gets paid, and a Fact-checker can reject and force a revision.",
  "The agents' brain is Venice — private and uncensored. Five Venice endpoints in the main flow: chat, web search, embeddings, image, and text-to-speech. The embeddings weight who gets paid.",
  "Then authors get paid — gasless, on mainnet. The agent pays for papers via x402. Payouts relay through 1Shot on Base mainnet with an EIP-7702 upgrade, gas paid in USDC. The contract blocks double payment.",
  "And it's flexible. Non-custodial by default — funds stay in your wallet until the split. Pay directly in one transaction with no relayer fee, relay gaslessly via 1Shot, escrow for an ORCID claim, or auto-pay on finish. A Kutip-style lock-upfront mode is an opt-in.",
  "And it's all real. No mocks in the critical path. Six contracts live, a hundred and twelve tests green, five on-chain agents, and a real 1Shot relay executed on Base mainnet.",
  "One product covers every track: Best Agent, Best A2A coordination, Best x402 and ERC-7710, Best use of Venice AI, and Best 1Shot Relayer.",
  "And you can see it all yourself. The live app has an interactive guided tour that narrates and points at every feature, navigating section to section on its own — and each research run explains itself, step by step. It's cozy, anime-styled, and fully on-chain.",
  "kuot — an agent that pays the people it learns from. Try it live at kuot.vercel.app. Thank you.",
];

function dur(path) {
  let out = "";
  try { execFileSync(ffmpegPath, ["-i", path], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { out = (e.stderr || "").toString(); }
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 6;
}
const pad = (n, w = 2) => String(n).padStart(w, "0");
const clock = (s, sep) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sec)}${sep}${pad(ms, 3)}`;
};

let t = 0;
const srt = [], vtt = ["WEBVTT", "", "NOTE kuot — pitch deck narration (timings match the generated audio).", ""];
SUBS.forEach((text, i) => {
  const d = dur(`video-out/audio/${pad(i)}.mp3`);
  const start = t, end = t + d;
  srt.push(`${i + 1}\n${clock(start, ",")} --> ${clock(end, ",")}\n${text}\n`);
  vtt.push(`${clock(start, ".")} --> ${clock(end, ".")}\n${text}\n`);
  t = end + GAP;
});

writeFileSync("public/pitch.srt", srt.join("\n"));
writeFileSync("public/pitch.vtt", vtt.join("\n") + "\n");
console.log(`✓ pitch.srt + pitch.vtt rewritten · total ${clock(t, ".")}`);
