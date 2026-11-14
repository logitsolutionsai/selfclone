// Builds docs/media/video-overlay.gif: what `selfclone video` is for. The test painting's avatar, exported
// as a round transparent WebM by the real command, lip-synced to a synthetic speech-like waveform (no voice
// of anyone), laid over a mock screen recording of a code editor with the same ffmpeg overlay the README
// shows.
// Run: node tools/make-video-overlay.mjs   (needs Chrome or Edge, and ffmpeg on PATH)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../src/face/chrome.mjs';
import { bakeFromPhoto } from '../src/face/bake.mjs';
import { checkVideoArgs, exportVideo } from '../src/face/video.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'tests', 'output', 'video-overlay');
const GIF = path.join(ROOT, 'docs', 'media', 'video-overlay.gif');
fs.mkdirSync(WORK, { recursive: true });
const SECONDS = 3.6;

// ---- a speech-like waveform: syllables of a buzzing voice with dark, middle and bright vowels ----
function speechWav(file) {
  const sr = 24000;
  const n = Math.round(SECONDS * sr);
  const pcm = Buffer.alloc(n * 2);
  // [start s, length s, pitch Hz, brightness 0 (oo) .. 1 (ee)]
  const syl = [
    [0.25, 0.22, 170, 0.5], [0.52, 0.18, 182, 0.95], [0.78, 0.3, 160, 0.05], [1.3, 0.2, 175, 0.55],
    [1.55, 0.24, 190, 0.9], [1.85, 0.16, 168, 0.4], [2.25, 0.3, 158, 0.0], [2.62, 0.2, 176, 0.6], [2.88, 0.32, 150, 0.15],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const [s0, len, f0, br] of syl) {
      if (t < s0 || t > s0 + len) continue;
      const u = (t - s0) / len;
      const env = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.2);
      const f = f0 * (1 + 0.06 * Math.sin(Math.PI * u));
      let s = 0;
      for (let h = 1; h <= 24; h++) s += Math.sin(2 * Math.PI * h * f * t) / h ** (2.2 - 1.9 * br);
      v += 0.32 * env * s;
    }
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

// ---- a mock screen: a plain code editor showing a short tutorial file (no real product) ----
const SCREEN = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:720px;background:#1b1d23;color:#c9d1d9;font:15px/1.6 ui-monospace,Consolas,monospace;display:grid;grid-template-rows:34px 1fr 26px;grid-template-columns:220px 1fr}
.top{grid-column:1/3;background:#14161a;display:flex;align-items:center;gap:8px;padding:0 12px;color:#8b949e;font:13px system-ui,Segoe UI,sans-serif}
.dot{width:11px;height:11px;border-radius:50%;background:#3a3f48}
.side{background:#16181d;padding:12px 0;font:13px/2 system-ui,Segoe UI,sans-serif;color:#8b949e}
.side div{padding:0 16px}.side .on{background:#22262e;color:#e6edf3}
.code{padding:18px 0 0 0;counter-reset:l;white-space:pre}
.code div{counter-increment:l}.code div::before{content:counter(l);display:inline-block;width:46px;text-align:right;margin-right:22px;color:#4a515c}
.k{color:#ff7b72}.s{color:#a5d6ff}.c{color:#6e7681}.f{color:#d2a8ff}.n{color:#79c0ff}
.sel{background:#2a3446}
.bar{grid-column:1/3;background:#0065fd;color:#fff;font:12px/26px system-ui,Segoe UI,sans-serif;padding:0 12px}
.cur{display:inline-block;width:2px;height:18px;background:#e6edf3;vertical-align:-3px}
</style>
<div class="top"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:10px">tutorial / retry.js</span></div>
<div class="side"><div>tutorial</div><div>&nbsp;&nbsp;README.md</div><div class="on">&nbsp;&nbsp;retry.js</div><div>&nbsp;&nbsp;retry.test.js</div><div>&nbsp;&nbsp;package.json</div></div>
<div class="code"><div><span class="c">// Step 3: retry a request with exponential backoff</span></div><div></div><div><span class="k">export async function</span> <span class="f">retry</span>(fn, { tries = <span class="n">4</span>, base = <span class="n">200</span> } = {}) {</div><div>  <span class="k">for</span> (<span class="k">let</span> i = <span class="n">0</span>; ; i++) {</div><div>    <span class="k">try</span> {</div><div class="sel">      <span class="k">return await</span> <span class="f">fn</span>();</div><div>    } <span class="k">catch</span> (err) {</div><div>      <span class="k">if</span> (i + <span class="n">1</span> &gt;= tries) <span class="k">throw</span> err;</div><div>      <span class="k">const</span> wait = base * <span class="n">2</span> ** i + Math.<span class="f">random</span>() * base;</div><div>      <span class="k">await new</span> <span class="f">Promise</span>((r) =&gt; <span class="f">setTimeout</span>(r, wait));<span class="cur"></span></div><div>    }</div><div>  }</div><div>}</div><div></div><div><span class="c">// Next: call it with a flaky fetch and watch the waits grow.</span></div></div>
<div class="bar">main &nbsp;&nbsp; Ln 10, Col 54 &nbsp;&nbsp; JavaScript</div>`;

const avatar = path.join(WORK, 'avatar.html');
const wav = path.join(WORK, 'voice.wav');
const pip = path.join(WORK, 'presenter.webm');
const screen = path.join(WORK, 'screen.png');
await bakeFromPhoto({
  photo: path.join(ROOT, 'tests', 'fixtures', 'mona-lisa.jpg'),
  consent: 'Demo only: a public domain painting (Mona Lisa, Leonardo da Vinci), not a living person.',
  name: 'Mona Lisa (public domain painting)',
  out: avatar,
});
speechWav(wav);
const browser = await launchChrome();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(SCREEN);
  await page.screenshot({ path: screen });
} finally {
  await browser.close();
}
const r = await exportVideo(checkVideoArgs({ _: [], audio: wav, avatar, size: '360', out: pip }));
console.log(`presenter.webm: ${Math.round(r.bytes / 1024)} KB, ${r.frames} frames`);

// The README's overlay (bottom right, 300 px wide, 40 px in), on the still screen, then a small looping GIF.
const mp4 = path.join(WORK, 'tutorial.mp4');
const run = (args) => {
  const x = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (x.status !== 0) throw new Error(x.stderr);
};
run(['-loop', '1', '-framerate', '30', '-t', String(SECONDS), '-i', screen, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(WORK, 'screen.mp4')]);
run(['-i', path.join(WORK, 'screen.mp4'), '-c:v', 'libvpx-vp9', '-i', pip, '-filter_complex', '[1:v]scale=300:-1[pip];[0:v][pip]overlay=W-w-40:H-h-40', '-map', '1:a', '-c:a', 'aac', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4]);
run(['-i', mp4, '-filter_complex', 'fps=12.5,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', GIF]);
console.log(`${path.relative(ROOT, GIF)}: ${Math.round(fs.statSync(GIF).size / 1024)} KB`);
