/**
 * Assemble the narrated pitch video: each slide image is held for the length of
 * its Venice narration (-shortest), then all segments are concatenated.
 * Output: video-out/pitch.mp4. Run: node scripts/video/build.mjs
 */
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, readdirSync } from "node:fs";

const FRAMES = process.env.FRAMES_DIR ?? "video-out/frames";
const AUDIO = process.env.AUDIO_DIR ?? "video-out/audio";
const OUT = process.env.OUT ?? "video-out/pitch.mp4";
const PREFIX = process.env.SEG_PREFIX ?? "seg";

const N = readdirSync(FRAMES).filter((f) => f.endsWith(".png")).length;
if (!N) throw new Error(`no frames in ${FRAMES}`);

const run = (args) => execFileSync(ffmpegPath, args, { stdio: ["ignore", "ignore", "inherit"] });

// 1) one mp4 segment per slide (still image + its narration, ends with the audio)
const list = [];
for (let i = 0; i < N; i++) {
  const nn = String(i).padStart(2, "0");
  const img = `${FRAMES}/${nn}.png`;
  const aud = `${AUDIO}/${nn}.mp3`;
  const out = `video-out/${PREFIX}-${nn}.mp4`;
  if (!existsSync(img) || !existsSync(aud)) throw new Error(`missing ${img} or ${aud}`);
  run([
    "-y", "-loop", "1", "-i", img, "-i", aud,
    "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "30",
    "-vf", "scale=1280:720,format=yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    "-shortest", "-movflags", "+faststart", out,
  ]);
  list.push(`file '${PREFIX}-${nn}.mp4'`); // relative to list.txt (in video-out/)
  console.log(`✓ ${out}`);
}

// 2) concat segments (re-encode for safe concat of identical params)
const listPath = `video-out/list-${PREFIX}.txt`;
writeFileSync(listPath, list.join("\n"));
run([
  "-y", "-f", "concat", "-safe", "0", "-i", listPath,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart", OUT,
]);
console.log(`✓ ${OUT}`);
