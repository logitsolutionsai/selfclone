// selfclone video: the avatar as a labelled picture-in-picture presenter, lip-synced to the user's own
// recorded voice (or a voice clone of themself), rendered frame by frame in headless Chrome under a
// paused clock and encoded with the installed ffmpeg.
//
// Safeguards, all enforced here and covered by tests:
// - an "AI CLONE" label is drawn over the chin, inside the face, on every frame, and every frame is
//   checked for it before it is encoded; there is no option to turn it off;
// - the avatar's consent record must be present and must match the face it was baked with;
// - the only input is an audio file (no text, so no speech in a voice that is not the user's);
// - the file carries provenance tags, and a sidecar .provenance.json holds the same plus a SHA-256;
// - the length is capped (10 minutes by default, at most 60).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { VERSION } from '../util.mjs';
import { readAvatarData, htmlFromData } from './build.mjs';
import { decodePng } from './png.mjs';

export const VIDEO_LIMITS = { minSize: 240, maxSize: 1080, size: 480, fps: 30, minFps: 15, maxFps: 60, maxMinutes: 10, capMinutes: 60 };
export const LABEL_TEXT = 'AI CLONE';
const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Check and normalise the options of `selfclone video`. Pure: no files are read. Throws with a plain
 * message on anything not allowed.
 */
export function checkVideoArgs(args, { dir = '.selfclone' } = {}) {
  const text = args.text ?? args.say ?? args.tts ?? args.voice;
  if (text != null || (args._ && args._.length)) {
    throw new Error('selfclone video speaks only with audio you recorded yourself (or a voice clone of yourself): pass --audio <file>. It does not turn text into speech.');
  }
  if (!args.audio || args.audio === true) throw new Error('Refusing to export without your own audio. Usage: selfclone video --audio voice.wav [-o out.webm]');
  const num = (key, flag, def, lo, hi) => {
    if (args[key] == null) return def;
    const v = Number(args[key]);
    if (args[key] === true || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${flag} must be a number from ${lo} to ${hi}, not "${args[key]}".`);
    return v;
  };
  const size = Math.round(num('size', '--size', VIDEO_LIMITS.size, VIDEO_LIMITS.minSize, VIDEO_LIMITS.maxSize) / 2) * 2;
  const fps = Math.round(num('fps', '--fps', VIDEO_LIMITS.fps, VIDEO_LIMITS.minFps, VIDEO_LIMITS.maxFps));
  const maxMinutes = num('maxMinutes', '--max-minutes', VIDEO_LIMITS.maxMinutes, 0.01, VIDEO_LIMITS.capMinutes);
  const shape = args.shape == null ? 'circle' : String(args.shape);
  if (!['circle', 'square'].includes(shape)) throw new Error(`--shape must be circle or square, not "${args.shape}".`);
  let out = args.out && args.out !== true ? String(args.out) : null;
  const ext = out ? path.extname(out).toLowerCase() : null;
  if (out && ext !== '.webm' && ext !== '.mp4') throw new Error('The output must be a .webm (transparent background possible) or .mp4 file.');
  let background = args.background == null ? null : String(args.background);
  if (background != null && background !== 'transparent' && !HEX.test(background)) throw new Error(`--background must be transparent or a colour like #1e1e1e, not "${background}".`);
  if (background && background.length === 4) background = '#' + [...background.slice(1)].map((c) => c + c).join('');
  if (background == null) {
    if (ext === '.mp4') throw new Error('MP4 cannot be transparent. Pass --background "#rrggbb" (for example "#00b140" to key it out in your editor), or write a .webm.');
    background = 'transparent';
  }
  if (background === 'transparent' && ext === '.mp4') throw new Error('MP4 cannot be transparent. Write a .webm for a transparent overlay, or pass --background "#rrggbb".');
  if (!out) out = path.join(dir, background === 'transparent' ? 'avatar-video.webm' : 'avatar-video.mp4');
  const avatar = args.avatar && args.avatar !== true ? String(args.avatar) : path.join(dir, 'avatar.html');
  return { audio: String(args.audio), avatar, out, size, fps, shape, background, transparent: background === 'transparent', maxMinutes, format: path.extname(out).toLowerCase().slice(1) };
}

/**
 * The avatar's consent record, checked: present, a real statement and date, and bound to this face
 * (the SHA-256 of the embedded photo must match). Throws otherwise.
 */
export function checkConsent(data) {
  const c = data && data.consent;
  if (!c || typeof c !== 'object') throw new Error('Refusing to export: this avatar has no consent record. Bake it again with selfclone face or selfclone bake --consent.');
  const statement = String(c.statement || '').trim();
  if (statement.length < 8) throw new Error('Refusing to export: the consent record in this avatar has no consent statement.');
  const date = Date.parse(c.date);
  if (!Number.isFinite(date) || date > Date.now() + 864e5) throw new Error('Refusing to export: the consent record in this avatar has no valid date.');
  if (typeof data.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(data.image)) throw new Error('Refusing to export: this avatar has no face image.');
  const photo = sha256(Buffer.from(data.image.split(',')[1], 'base64'));
  if (!/^[0-9a-f]{64}$/.test(String(c.photoSha256 || '')) || c.photoSha256 !== photo) {
    throw new Error('Refusing to export: the consent record does not match the face in this avatar (the photo hash differs). Bake it again with consent.');
  }
  if (!Array.isArray(data.landmarks) || !Array.isArray(data.points) || !Array.isArray(data.triangles) || !(data.size > 32)) throw new Error('Refusing to export: the avatar data is incomplete.');
  return { name: String(c.name || '').slice(0, 120), statement: statement.slice(0, 600), date: new Date(date).toISOString(), method: String(c.method || 'photo'), photoSha256: c.photoSha256 };
}

/** Refuse audio longer than the cap. */
export function checkLength(seconds, maxMinutes) {
  if (!(seconds > 0)) throw new Error('The audio file has no sound to lip-sync (zero length).');
  if (seconds > maxMinutes * 60 + 0.05) {
    throw new Error(`The audio is ${(seconds / 60).toFixed(1)} minutes long; the limit is ${maxMinutes} minutes (--max-minutes, at most ${VIDEO_LIMITS.capMinutes}). Split it into shorter takes.`);
  }
}

export function provenanceComment(consent) {
  return `AI CLONE: this video shows an AI clone made with selfclone ${VERSION}, not a recording of the person. ` +
    `It is one still frame animated by software and lip-synced to the audio track. Consent: "${consent.statement}" (${consent.date.slice(0, 10)}).`;
}

function ff(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: opts.encoding === null ? null : 'utf8', maxBuffer: 1 << 30, ...opts });
  if (r.error && r.error.code === 'ENOENT') throw new Error(`${bin} was not found. Install ffmpeg (it includes ${bin}) and make sure it is on your PATH.`);
  if (r.status !== 0) throw new Error(`${bin} failed: ${String(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
  return r.stdout;
}

/** Duration of the first audio stream (seconds), or an error if the file has none. */
export function probeAudio(file) {
  const out = JSON.parse(ff('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', file]));
  const a = (out.streams || []).find((s) => s.codec_type === 'audio');
  if (!a) throw new Error(`${path.basename(file)} has no audio stream.`);
  const seconds = Number(a.duration) || Number(out.format && out.format.duration);
  return { seconds };
}

// ---- audio features, measured like the avatar's live audio mode (AnalyserNode, fftSize 1024 at 48 kHz) ----
const SR = 24000;
const N = 512; // 21 ms, the same window and bin width as the live analyser
function fftMag(re) {
  const n = re.length;
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]) / n;
  return mag;
}

/** Loudness (RMS) and spectral centroid (Hz) every `hop` seconds, from the audio decoded by ffmpeg. */
export function audioFeatures(file, hop = 0.01) {
  const raw = ff('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { encoding: null });
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  const count = Math.ceil(x.length / (SR * hop));
  const rms = new Array(count);
  const centroid = new Array(count);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N);
  const binHz = SR / N;
  const lo = Math.floor(100 / binHz);
  const hi = Math.ceil(5000 / binHz);
  const buf = new Float64Array(N);
  for (let f = 0; f < count; f++) {
    const end = Math.round((f + 1) * hop * SR);
    let s = 0;
    for (let i = 0; i < N; i++) {
      const v = x[end - N + i] || 0;
      s += v * v;
      buf[i] = v * win[i];
    }
    rms[f] = Math.round(Math.sqrt(s / N) * 1e5) / 1e5;
    const mag = fftMag(buf);
    let num = 0;
    let den = 0;
    for (let k = lo; k < Math.min(mag.length, hi); k++) {
      num += k * binHz * mag[k];
      den += mag[k];
    }
    centroid[f] = den > 0 ? Math.round(num / den) : 0;
  }
  return { hop, rms, centroid, seconds: x.length / SR };
}

/**
 * Share of the label box that is the label's near-black fill, and of its white lettering, in an RGBA frame.
 * The fill must be a neutral near-black (no channel above 56, channels within 16 of each other), so dark
 * skin, hair or a shadow on the chin, which all carry some colour, do not count as the label.
 */
export function labelCoverage(img, box) {
  let fill = 0;
  let white = 0;
  let n = 0;
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(img.width, Math.round(box.x + box.width));
  const y1 = Math.min(img.height, Math.round(box.y + box.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * img.width + x) * 4;
      const r = img.data[o];
      const g = img.data[o + 1];
      const b = img.data[o + 2];
      if (img.data[o + 3] < 200) continue;
      n++;
      const hi = Math.max(r, g, b);
      if (hi <= 56 && hi - Math.min(r, g, b) <= 16) fill++;
      else if (r > 200 && g > 200 && b > 200) white++;
    }
  }
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  return { fill: fill / area, white: white / area, opaque: n / area };
}

/** The label is there when most of its box is the near-black fill and some of it is white lettering. */
export const labelOk = (c) => c.fill > 0.35 && c.white > 0.04 && c.white < 0.45;

/** Render and encode. Returns {file, sidecar, bytes, seconds, frames, ...}. */
export async function exportVideo(opts, { log = () => {} } = {}) {
  const o = opts;
  if (!fs.existsSync(o.avatar)) throw new Error(`No avatar at ${o.avatar}. Make one first with selfclone face or selfclone bake.`);
  if (!fs.existsSync(o.audio)) throw new Error(`Audio not found: ${o.audio}`);
  const data = readAvatarData(fs.readFileSync(o.avatar, 'utf8'));
  const consent = checkConsent(data);
  const { seconds } = probeAudio(o.audio);
  checkLength(seconds, o.maxMinutes);
  // The page is rebuilt from the avatar's data with this version's runtime, so an edited page cannot
  // drop the label.
  const html = htmlFromData(data);
  const features = audioFeatures(o.audio);
  const frames = Math.max(1, Math.ceil(seconds * o.fps));
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  const tmp = `${o.out}.part${path.extname(o.out)}`;
  const comment = provenanceComment(consent);
  const title = consent.name ? `AI clone of ${consent.name}` : 'AI clone';
  const meta = {
    title,
    comment,
    description: comment,
    selfclone_ai_generated: 'true',
    selfclone_label: `${LABEL_TEXT} (burned into every frame)`,
    selfclone_consent: consent.statement,
    selfclone_consent_name: consent.name,
    selfclone_consent_date: consent.date,
    selfclone_version: VERSION,
  };
  const codec = o.format === 'mp4'
    ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart+use_metadata_tags']
    : ['-c:v', 'libvpx-vp9', '-pix_fmt', o.transparent ? 'yuva420p' : 'yuv420p', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '96k'];
  const ffArgs = [
    '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.size}x${o.size}`, '-r', String(o.fps), '-i', '-',
    '-i', o.audio, '-map', '0:v:0', '-map', '1:a:0', ...codec,
    ...Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]),
    '-f', o.format, tmp,
  ];
  const { launchChrome } = await import('./chrome.mjs');
  const browser = await launchChrome({ args: ['--mute-audio'] });
  let enc = null;
  let label;
  try {
    const context = await browser.newContext({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Paused: page time moves only when a frame is stepped, never with the real time a screenshot takes.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }) : r.abort()));
    const q = new URLSearchParams({ export: o.shape, controls: '0', tts: '0', volume: '0', seed: 'video' });
    if (!o.transparent) q.set('bg', o.background);
    await page.goto(`http://avatar.local/avatar.html?${q}`);
    for (let i = 0; i < 200; i++) {
      await page.clock.runFor(50);
      await new Promise((r) => setTimeout(r, 30));
      if (await page.evaluate(() => !!(window.selfclone && window.selfclone.state().frames > 3))) break;
    }
    if (!(await page.evaluate(() => !!window.selfclone))) throw new Error(`The avatar did not load${errors.length ? ': ' + errors.join('; ') : ''}.`);
    // The label sits on the chin; if a crop puts the chin near the edge, move it up until it is inside
    // the frame (and inside the circle).
    label = await page.evaluate(({ shape }) => {
      const b = document.getElementById('badge');
      const S = window.innerWidth;
      const inside = (r) => {
        if (r.left < 2 || r.top < 2 || r.right > S - 2 || r.bottom > S - 2) return false;
        if (shape !== 'circle') return true;
        const c = S / 2;
        return [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].every(([x, y]) => Math.hypot(x - c, y - c) < c - 2);
      };
      let r = b.getBoundingClientRect();
      for (let k = 0; k < 60 && !inside(r); k++) {
        b.style.setProperty('top', `${parseFloat(getComputedStyle(b).top) - S * 0.01}px`, 'important');
        r = b.getBoundingClientRect();
      }
      return { x: r.left, y: r.top, width: r.width, height: r.height, inside: inside(r), font: parseFloat(getComputedStyle(b).fontSize) };
    }, { shape: o.shape });
    if (!label.inside) throw new Error('Could not place the AI CLONE label inside the face for this avatar.');
    enc = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
    let encErr = '';
    enc.stderr.on('data', (d) => (encErr += d));
    const encDone = once(enc, 'close');
    enc.on('error', () => {});
    const step = 1000 / o.fps;
    await page.evaluate(({ f, lead }) => {
      window.__videoDone = false;
      window.selfclone.sayFeatures(f, { lead }).then(() => (window.__videoDone = true));
    }, { f: features, lead: step });
    let now = 0;
    for (let i = 0; i < frames; i++) {
      const t = Math.round((i + 1) * step);
      await page.clock.runFor(t - now);
      now = t;
      const png = await page.screenshot({ type: 'png', omitBackground: o.transparent, clip: { x: 0, y: 0, width: o.size, height: o.size } });
      const img = decodePng(png);
      const cov = labelCoverage(img, label);
      if (!labelOk(cov)) throw new Error(`The AI CLONE label was missing from frame ${i}; nothing was written.`);
      if (!enc.stdin.write(img.data)) await once(enc.stdin, 'drain');
      if (i % (o.fps * 10) === 0) log(`  frame ${i + 1} of ${frames}`);
    }
    enc.stdin.end();
    const [code] = await encDone;
    if (code !== 0) throw new Error(`ffmpeg failed: ${encErr.trim().split('\n').slice(-3).join(' ')}`);
    if (errors.length) throw new Error(`The avatar page reported errors: ${errors.join('; ')}`);
    await context.close();
  } catch (e) {
    if (enc && enc.exitCode == null) enc.kill();
    fs.rmSync(tmp, { force: true });
    throw e;
  } finally {
    await browser.close();
  }
  fs.renameSync(tmp, o.out);
  const bytes = fs.statSync(o.out).size;
  const provenance = {
    kind: 'selfclone-video-provenance',
    version: 1,
    aiGenerated: true,
    comment,
    tool: { name: 'selfclone', version: VERSION },
    createdAt: new Date().toISOString(),
    consent,
    label: { text: LABEL_TEXT, burnedIn: true, placement: 'over the chin, inside the face', box: { x: Math.round(label.x), y: Math.round(label.y), width: Math.round(label.width), height: Math.round(label.height) }, fontPx: Math.round(label.font * 10) / 10 },
    video: { file: path.basename(o.out), sha256: sha256(fs.readFileSync(o.out)), bytes, seconds: Math.round(seconds * 1000) / 1000, fps: o.fps, frames, size: o.size, shape: o.shape, background: o.background, format: o.format },
    audio: { file: path.basename(o.audio), sha256: sha256(fs.readFileSync(o.audio)) },
    tags: meta,
  };
  const sidecar = `${o.out}.provenance.json`;
  fs.writeFileSync(sidecar, JSON.stringify(provenance, null, 2) + '\n');
  return { file: o.out, sidecar, bytes, seconds, frames, label: provenance.label };
}
