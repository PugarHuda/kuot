/**
 * Generate anime-style "messy study room" hero backgrounds via Venice AI image
 * (z-image-turbo). Saves landscape webp variants to public/ so we can pick one.
 *
 * Run: node --env-file=.env scripts/gen-hero.mjs
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const KEY = process.env.VENICE_API_KEY;
if (!KEY) throw new Error("set VENICE_API_KEY");

const NEG =
  "people, person, human, text, watermark, signature, letters, words, logo, low quality, blurry, deformed";

// Composition is biased to the RIGHT (desk + books) so the left stays calm for
// the headline text. Warm afternoon light, cozy Ghibli / lo-fi anime aesthetic.
const VARIANTS = [
  {
    name: "hero-room-1",
    seed: 73122,
    prompt:
      "anime illustration, cozy messy study bedroom in warm afternoon light, a wooden study desk on the RIGHT side cluttered with tall stacks of books, open notebooks and scattered loose papers, a desk lamp, an overflowing bookshelf behind it, a few papers drifting in the air, a potted plant, soft sunlight streaming through a window casting warm rays and floating dust, the LEFT side is a calm empty warm wall with gentle light, Studio Ghibli inspired, lo-fi cozy aesthetic, soft warm color palette of cream beige and gentle green, highly detailed background art, no people, wide cinematic shot",
  },
  {
    name: "hero-room-2",
    seed: 4490,
    prompt:
      "anime background art, a student's messy desk piled with books and research papers on the RIGHT, scattered sheets of paper falling and lying around, sticky notes, a warm desk lamp glowing, a large window on the right with golden hour sunlight and dust motes, bookshelf crammed with books, plants on the windowsill, the LEFT third is softly lit empty wall space, makoto shinkai inspired lighting, warm cozy palette, cream and muted emerald green tones, detailed, no characters, no people, panoramic composition",
  },
  {
    name: "hero-room-3",
    seed: 88517,
    prompt:
      "cozy anime study room interior, afternoon, study table on the RIGHT overflowing with stacks of books, open journals, loose papers everywhere on the desk and floor, a desk lamp, corkboard with notes, tall bookshelves, warm light beams from a side window with floating dust, calm warm empty wall on the LEFT for breathing room, ghibli lo-fi aesthetic, soft warm cream and sage green colors, hand-painted detailed background, no people, wide aspect",
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
      height: 768,
      format: "webp",
      seed: v.seed,
      return_binary: false,
    }),
  });
  if (!res.ok) {
    console.log(`✗ ${v.name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const json = await res.json();
  const b64 = json.images?.[0];
  if (!b64) {
    console.log(`✗ ${v.name}: no image in response (${JSON.stringify(json).slice(0, 160)})`);
    return;
  }
  const buf = Buffer.from(b64, "base64");
  const path = `public/${v.name}.webp`;
  writeFileSync(path, buf);
  console.log(`✓ ${v.name} → ${path} (${(buf.length / 1024).toFixed(0)} KB)`);
}

for (const v of VARIANTS) await gen(v);
console.log("done.");
