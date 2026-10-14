// Usage: node voice/make_vo.mjs
// One Kokoro take per sentence (local, no API key), silence trimmed, joined per line.
// Writes public/vo/<line>.wav and public/vo/manifest.json with exact sentence offsets.
// KOKORO_JS can point at any installed kokoro-js entry; by default we reuse the copy
// (and cached model) from the TGOI launch-film project.
import fs from "node:fs";

const entry =
  process.env.KOKORO_JS ??
  "/Users/rehaanajani/codebases/TGOI/launch-film/node_modules/kokoro-js/dist/kokoro.js";
const { KokoroTTS } = await import(entry);

const cfg = JSON.parse(fs.readFileSync("voice/lines.json", "utf8"));
const OUT = "public/vo";
fs.mkdirSync(OUT, { recursive: true });
const SR = 24000;
const PAD = Math.round(0.05 * SR);

function writeWav(file, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  fs.writeFileSync(file, b);
}

function trim(x) {
  const th = 0.012;
  let a = 0, z = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < th) a++;
  while (z > a && Math.abs(x[z]) < th) z--;
  return x.slice(Math.max(0, a - PAD), Math.min(x.length, z + PAD));
}

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
const manifest = [];
for (const line of cfg.lines) {
  const chunks = [];
  const parts = [];
  let t = 0;
  for (const [i, part] of line.parts.entries()) {
    const speed = part.speed ?? line.speed ?? cfg.speed;
    const x = trim((await tts.generate(part.say, { voice: part.voice ?? cfg.voice, speed })).audio);
    if (i > 0) {
      const gap = new Float32Array(Math.round((line.parts[i - 1].gapAfter ?? cfg.partGap) * SR));
      chunks.push(gap);
      t += gap.length;
    }
    parts.push({ say: part.say, start: +(t / SR).toFixed(3), end: +((t + x.length) / SR).toFixed(3) });
    chunks.push(x);
    t += x.length;
  }
  const all = new Float32Array(t);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  writeWav(`${OUT}/${line.id}.wav`, all);
  manifest.push({ id: line.id, seconds: +(t / SR).toFixed(3), parts });
  console.log(line.id.padEnd(9), (t / SR).toFixed(2) + "s", parts.map((p) => `${p.start}-${p.end}`).join("  "));
}
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log("speech total", manifest.reduce((a, b) => a + b.seconds, 0).toFixed(2) + "s");
