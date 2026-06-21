/**
 * Generate a wide anime "papers → payment" band via Venice AI image, to tie the
 * room theme into a closing call-to-action section. Saves webp variants.
 * Run: node --env-file=.env scripts/gen-band.mjs
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error("set VENICE_API_KEY");

const NEG = "people, person, human, text, watermark, signature, letters, words, logo, low quality, blurry, deformed";

const VARIANTS = [
  {
    name: "band-1",
    seed: 31007,
    prompt:
      "anime illustration, wide banner, close-up of a cozy study desk, stacks of open research papers and books, a few shiny golden coins and a small cloth coin pouch resting on the papers suggesting a reward, warm desk lamp glow, soft blurred bookshelf in the background, Studio Ghibli lo-fi aesthetic, warm cream and sage green palette, golden hour light, highly detailed, no people, panoramic",
  },
  {
    name: "band-2",
    seed: 6628,
    prompt:
      "anime background art, wide panoramic, an open book and scattered papers on a warm wooden desk with golden coins spilling from a small pouch onto the pages, warm cozy lamp light and soft window glow, plants and books softly out of focus behind, makoto shinkai inspired warm lighting, cream beige and muted green tones, detailed hand-painted look, no characters, no people",
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
      width: 1280,
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
