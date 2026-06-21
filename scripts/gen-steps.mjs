/**
 * Generate three matching anime mini-scene strips for the "How it works" steps
 * via Venice AI image. Saves webp to public/. Run: node --env-file=.env scripts/gen-steps.mjs
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error("set VENICE_API_KEY");

const NEG = "people, person, human, hands, text, watermark, signature, letters, words, logo, ui, low quality, blurry, deformed";
const STYLE =
  ", Studio Ghibli lo-fi anime illustration, warm cream beige and sage green palette, soft golden lamp light, cozy, highly detailed hand-painted background, no people, no text";

const VARIANTS = [
  {
    name: "step-grant",
    seed: 21010,
    prompt:
      "a single glowing golden key resting on an old parchment scroll sealed with green wax, on a warm wooden desk, soft magical glow" + STYLE,
  },
  {
    name: "step-agents",
    seed: 21020,
    prompt:
      "several small glowing magical wisps and softly floating open books and papers above a cozy study desk, faint glowing threads connecting them like a network, warm lamp" + STYLE,
  },
  {
    name: "step-pay",
    seed: 21030,
    prompt:
      "shiny golden coins gently dropping onto an open research paper next to a fountain pen on a warm wooden desk, a small coin pouch nearby, soft glow" + STYLE,
  },
];

async function gen(v) {
  const res = await fetch(`${BASE}/image/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: process.env.VENICE_IMAGE_MODEL ?? "z-image-turbo",
      prompt: v.prompt,
      negative_prompt: NEG,
      width: 768,
      height: 512,
      format: "webp",
      seed: v.seed,
      return_binary: false,
    }),
  });
  if (!res.ok) return console.log(`✗ ${v.name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const b64 = json.images?.[0];
  if (!b64) return console.log(`✗ ${v.name}: no image`);
  const buf = Buffer.from(b64, "base64");
  writeFileSync(`public/${v.name}.webp`, buf);
  console.log(`✓ ${v.name} → public/${v.name}.webp (${(buf.length / 1024).toFixed(0)} KB)`);
}

for (const v of VARIANTS) await gen(v);
console.log("done.");
