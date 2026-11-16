// selfclone studio: explainer videos. A scene file (written by Claude or by hand) lists scenes: what is
// said and by whom, the background and scenery, who is on screen and what they do, a camera path, drawn
// items (SVG, props, charts, text, bubbles, images) and optional Manim maths. The cast can be the user's
// own drawn character, random fictional people, or nobody at all. Each frame is rendered in headless
// Chrome with the network blocked, by several workers in parallel, and piped to ffmpeg; the
// frame count is then checked on the encoded file. No image model, no GPU. An .srt caption file is
// written alongside.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { VERSION, sha256 } from '../util.mjs';
import { audioFeatures } from '../face/video.mjs';
import { checkCharacter, randomCharacter } from './character.mjs';
import { narrate, alignRecording, readAudio, writeWav, parseVoice, DEFAULT_VOICE, SR } from './speech.mjs';
import { checkScenes, buildTimeline, sceneLines, sceneVoices } from './scenes.mjs';
import { mouthTrack, blinkTrack, emphasisTrack, phonemeSegments } from './tracks.mjs';
import { sfxEvents, synthSfx, mixSfx, ambientMusic } from './sfx.mjs';
import { explainerHtml, sheetHtml, sheetHeight } from './page.mjs';
import { renderManim } from './manim.mjs';
import { lintStoryboard } from './lint.mjs';

export { checkScenes, buildTimeline, sceneLines, mouthTrack, blinkTrack, emphasisTrack, explainerHtml };
export { ENTERS, EXITS, LOOPS, TRANSITIONS } from './scenes.mjs';
export const STUDIO_LIMITS = { fps: 24, minFps: 12, maxFps: 30, width: 1280, height: 720, maxMinutes: 10, capMinutes: 60, maxWorkers: 16 };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

/** The SubRip caption file for the narration. */
export function srt(spec, timings) {
  const ts = (s) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  let n = 0;
  const out = [];
  spec.scenes.forEach((s, i) => s.say.forEach((line, j) => {
    const m = timings[i].lines[j];
    out.push(`${++n}\n${ts(m.start)} --> ${ts(m.end + 0.2)}\n${line.text}\n`);
  }));
  return out.join('\n');
}

/** Default number of render workers: about a third of the cores, at most 8. */
export const defaultWorkers = () => Math.max(1, Math.min(8, Math.floor(os.cpus().length / 3)));

async function withBrowser(fn) {
  const { launchChrome } = await import('../face/chrome.mjs');
  // Software rendering: SVG filters are several times faster than through SwiftShader's GL.
  const browser = await launchChrome({ args: ['--mute-audio', '--disable-gpu'] });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** A page with the html served from memory, Manim frames served from their folders, everything else refused. */
async function openPage(browser, { html, width, height, manimDirs = {} }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const url = r.request().url();
    if (url === 'http://studio.local/') return r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
    const m = /^http:\/\/studio\.local\/manim\/(\d+)\/(\d+)\.png$/.exec(url);
    if (m && manimDirs[m[1]]) {
      const f = path.join(manimDirs[m[1]], `${m[2]}.png`);
      if (fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'image/png' });
    }
    return r.abort();
  });
  await page.goto('http://studio.local/');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  if (errors.length) throw new Error(`The page reported errors: ${errors.join('; ')}`);
  return { page, context, errors };
}

/** A preview sheet of the character (mouths, blinks, moods, every gesture, looking aside) as a PNG. */
export async function renderCharacterSheet(character, file, { body = 'bust' } = {}) {
  const html = sheetHtml(character, { body });
  await withBrowser(async (browser) => {
    const { page, context } = await openPage(browser, { html, width: 1200, height: sheetHeight(body) });
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    await context.close();
  });
  return file;
}

/**
 * The characters of the cast: a character file (relative to the scene file), "random" or
 * "random:<seed>" for a fictional person, or a character object. `hostFile` overrides the host's.
 */
export function loadCast(spec, baseDir, { hostFile } = {}) {
  const out = {};
  for (const [name, m] of Object.entries(spec.cast)) {
    let c;
    const src = name === 'host' && hostFile ? hostFile : m.character;
    if (src && typeof src === 'object') c = src;
    else if (/^random(:|$)/.test(src)) c = randomCharacter(src.includes(':') ? src.slice(src.indexOf(':') + 1) : `${spec.title}:${name}`);
    else {
      const f = path.resolve(baseDir, src);
      if (!fs.existsSync(f)) throw new Error(`No character file for ${name} at ${f}. Make one with selfclone character --photo <img> --consent "<statement>", or use "random".`);
      c = JSON.parse(fs.readFileSync(f, 'utf8'));
    }
    out[name] = checkCharacter(c);
  }
  return out;
}

// Added to every painted backdrop, so it sits behind drawn characters without fighting them.
const BACKDROP_STYLE = 'Wide background illustration for an animated explainer: flat hand-drawn shapes, soft gouache texture, muted colours, gentle light, no people, no text, no letters, plenty of empty space in the middle.';

/**
 * Backdrops with a "prompt" are painted once by an image model (OpenAI, with OPENAI_API_KEY) and cached
 * by prompt; afterwards they are ordinary image files. Nothing is sent anywhere without a key.
 */
export async function paintBackdrops(spec, cacheDir, log = () => {}) {
  for (const s of spec.scenes) {
    const b = s.backdropImage;
    if (!b || !b.prompt) continue;
    const file = path.resolve(cacheDir, `backdrop-${sha256(`${BACKDROP_STYLE}\n${b.prompt}`).slice(0, 16)}.png`);
    if (!fs.existsSync(file)) {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('A backdrop has a "prompt", which needs an image model: set OPENAI_API_KEY, or use a drawn backdrop (clouds, stars, room...) or {"image": "file.png"}.');
      log(`  Painting a backdrop: ${b.prompt.slice(0, 60)}...`);
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt: `${BACKDROP_STYLE} ${b.prompt}`, size: '1536x1024', n: 1 }),
      });
      if (!res.ok) throw new Error(`The image model returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = await res.json();
      const b64 = j.data && j.data[0] && j.data[0].b64_json;
      if (!b64) throw new Error('The image model returned no image.');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    }
    b.file = file;
  }
}

/** Image files used by the scene file, as data URLs (at most 8 MB each). */
export function loadMedia(spec, baseDir) {
  const media = {};
  const add = (rel) => {
    if (media[rel]) return;
    const f = path.resolve(baseDir, rel);
    if (!fs.existsSync(f)) throw new Error(`Image not found: ${f}`);
    const buf = fs.readFileSync(f);
    if (buf.length > 8 * 1048576) throw new Error(`${rel} is over 8 MB; use a smaller image.`);
    media[rel] = `data:${MIME[path.extname(f).toLowerCase()]};base64,${buf.toString('base64')}`;
  };
  for (const s of spec.scenes) {
    if (s.backdropImage) add(s.backdropImage.file);
    for (const it of s.items) if (it.kind === 'image') add(it.image);
  }
  return media;
}

/** Narration for a scene file: synthesised (cached by voices and text) or read from --audio. */
export async function prepareNarration(spec, { voice, audio, cacheDir, log = () => {} }) {
  const lines = sceneLines(spec);
  if (audio) {
    if (!fs.existsSync(audio)) throw new Error(`Audio not found: ${audio}`);
    const x = readAudio(audio);
    return { wav: audio, samples: x, timings: alignRecording(x, lines), seconds: x.length / SR, voice: { file: path.basename(audio), sha256: sha256(fs.readFileSync(audio)), timing: 'aligned to the pauses in the recording' } };
  }
  const fallback = voice || spec.voice || DEFAULT_VOICE;
  const voices = sceneVoices(spec, fallback);
  voices.flat().forEach((v) => parseVoice(v));
  const holds = spec.scenes.map((s) => s.hold);
  const key = sha256(JSON.stringify({ voices, lines, holds, version: 2 })).slice(0, 16);
  const wav = path.join(cacheDir, `narration-${key}.wav`);
  const meta = path.join(cacheDir, `narration-${key}.json`);
  const used = [...new Set(voices.flat())].map((v) => parseVoice(v));
  const pv = used.length === 1 ? used[0] : { provider: used.map((u) => u.provider).join('+'), voice: used.map((u) => `${u.provider}:${u.voice}`).join(', ') };
  if (fs.existsSync(wav) && fs.existsSync(meta)) {
    log(`Reusing the narration already spoken for this text and these voices (${path.basename(wav)}).`);
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
    return { wav, timings: m.timings, seconds: m.seconds, voice: pv };
  }
  log(`Speaking ${lines.flat().length} lines (${pv.voice || pv.provider})...`);
  const n = await narrate(lines, fallback, { log, holds, voices });
  writeWav(wav, n.samples);
  fs.writeFileSync(meta, JSON.stringify({ voices, timings: n.scenes, seconds: n.seconds }, null, 2));
  return { wav, samples: n.samples, timings: n.scenes, seconds: n.seconds, voice: pv };
}

/** Per-character tracks: each character's mouth moves only on its own lines. */
export async function castTracks(timeline, feat, fps, frames, seed) {
  const lines = timeline.flatMap((s) => s.lines);
  // Lip-read from phonemes where the phonemizer is installed (it comes with kokoro-js).
  const segs = new Map();
  for (const l of lines) if (!segs.has(l.text)) segs.set(l.text, await phonemeSegments(l.text));
  const who = [...new Set([...timeline.flatMap((s) => s.characters.map((c) => c.who)), ...lines.map((l) => l.who)])];
  const out = {};
  for (const w of who) {
    const spans = lines.filter((l) => l.who === w).map((l) => ({ start: l.start, end: l.end, text: l.text, segs: segs.get(l.text) || undefined }));
    out[w] = { mouth: mouthTrack(feat, fps, frames, spans), blink: blinkTrack(frames, fps, `${seed}:${w}`), emph: emphasisTrack(feat, fps, frames, spans) };
  }
  return out;
}

/** The number of video frames in an encoded file, counted by ffprobe. */
export function countFrames(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe could not read the video back: ${String(r.stderr).trim().split('\n').pop()}`);
  return parseInt(String(r.stdout).trim(), 10);
}

const VIDEO_CODEC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium'];

/** ffmpeg arguments for the final mux: the joined video, the mixed sound track, optional music ducked under the voice. */
export function encodeArgs({ fps, audio, music, musicVolume, seconds, meta, out, video = null }) {
  const args = video ? ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', video, '-i', audio] : ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', '-i', audio];
  let map = ['-map', '0:v:0', '-map', '1:a:0'];
  if (music) {
    args.push('-stream_loop', '-1', '-i', music);
    // The music loops, fades in and out, and is pushed down (sidechain compression) while the voice speaks.
    const fadeOut = Math.max(0, seconds - 2).toFixed(2);
    args.push('-filter_complex',
      `[2:a]aresample=48000,atrim=0:${seconds.toFixed(2)},volume=${musicVolume},afade=t=in:d=1.5,afade=t=out:st=${fadeOut}:d=2[m];` +
      '[1:a]aresample=48000,asplit=2[v][key];[m][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[duck];' +
      '[v][duck]amix=inputs=2:duration=first:normalize=0[a]');
    map = ['-map', '0:v:0', '-map', '[a]'];
  }
  return [...args, ...map, ...(video ? ['-c:v', 'copy'] : VIDEO_CODEC), '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart+use_metadata_tags', ...Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]), '-f', 'mp4', out];
}

/** Render frames [a, b) with one page into a video-only MP4 segment. */
async function renderSegment(browser, { html, width, height, manimDirs, fps, a, b, file, onFrame }) {
  const { page, context, errors } = await openPage(browser, { html, width, height, manimDirs });
  const enc = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', ...VIDEO_CODEC, '-an', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let encErr = '';
  enc.stderr.on('data', (d) => (encErr += d));
  enc.on('error', () => {});
  const done = once(enc, 'close');
  try {
    for (let f = a; f < b; f++) {
      await page.evaluate((k) => window.studio.render(k), f);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!enc.stdin.write(jpg)) await once(enc.stdin, 'drain');
      onFrame();
    }
    if (errors.length) throw new Error(`The scene page reported errors: ${errors.join('; ')}`);
    enc.stdin.end();
    const [code] = await done;
    if (code !== 0) throw new Error(`ffmpeg failed: ${encErr.trim().split('\n').slice(-3).join(' ')}`);
  } catch (e) {
    if (enc.exitCode == null) enc.kill();
    throw e;
  } finally {
    await context.close();
  }
}

/** Everything up to the page: checked spec, cast, narration, timeline, tracks, media, Manim frames. */
async function prepare(o, log) {
  const raw = JSON.parse(fs.readFileSync(o.scenesFile, 'utf8'));
  if (o.noHost) {
    // Nobody on screen: drop the cast, every placement and the speech bubbles; the narrator reads every line.
    delete raw.character;
    delete raw.cast;
    for (const s of raw.scenes || []) {
      delete s.character;
      delete s.characters;
      if (Array.isArray(s.items)) s.items = s.items.filter((it) => !(it && it.bubble != null));
      if (Array.isArray(s.say)) s.say = s.say.map((l) => (l && typeof l === 'object' ? l.text : l));
    }
  }
  // --character adds a host to a scene file that has no cast of its own.
  if (o.characterFile && !o.noHost && raw.cast == null && raw.character == null) raw.character = path.resolve(o.characterFile);
  const spec = checkScenes(raw);
  const baseDir = path.dirname(path.resolve(o.scenesFile));
  const cast = loadCast(spec, baseDir, { hostFile: o.characterFile });
  let music = o.music || (spec.music && (spec.music === 'ambient' ? 'ambient' : path.resolve(baseDir, spec.music)));
  if (music && music !== 'ambient' && !fs.existsSync(music)) throw new Error(`Music not found: ${music}`);
  const fps = o.fps || STUDIO_LIMITS.fps;
  const width = o.width || STUDIO_LIMITS.width;
  const height = o.height || STUDIO_LIMITS.height;
  fs.mkdirSync(o.cacheDir, { recursive: true });
  const nar = await prepareNarration(spec, { voice: o.voice, audio: o.audio, cacheDir: o.cacheDir, log });
  const maxMinutes = o.maxMinutes || STUDIO_LIMITS.maxMinutes;
  if (nar.seconds > maxMinutes * 60 + 0.05) throw new Error(`The narration is ${(nar.seconds / 60).toFixed(1)} minutes; the limit is ${maxMinutes} (--max-minutes, at most ${STUDIO_LIMITS.capMinutes}).`);
  const frames = Math.ceil(nar.seconds * fps);
  if (music === 'ambient') {
    // Generated music: a soft pad bed, made once per length and title.
    music = path.join(o.cacheDir, `ambient-${sha256(`${spec.title}:${nar.seconds.toFixed(2)}`).slice(0, 12)}.wav`);
    if (!fs.existsSync(music)) writeWav(music, ambientMusic(nar.seconds + 1, spec.title));
  }
  const timeline = buildTimeline(spec, nar.timings);
  const feat = audioFeatures(nar.wav);
  const tracks = await castTracks(timeline, feat, fps, frames, spec.title);
  await paintBackdrops(spec, o.cacheDir, log);
  const media = loadMedia(spec, baseDir);
  const manim = {};
  const manimDirs = {};
  for (const [i, s] of spec.scenes.entries()) {
    if (!s.manim) continue;
    const r = renderManim({ code: s.manim.code, scene: s.manim.scene, width: Math.round((width * s.manim.w) / 2) * 2, height: Math.round((height * s.manim.w) / 2) * 2, fps, cacheDir: o.cacheDir, log });
    manim[i] = { t: timeline[i].manim.t, frames: r.frames };
    manimDirs[i] = r.dir;
  }
  const html = explainerHtml({ spec, timeline, cast, tracks, media, manim, fps, width, height });
  const warnings = lintStoryboard(spec, timeline, { width, height });
  for (const w of warnings) log(`  warning: ${w}`);
  return { warnings, spec, cast, music, fps, width, height, nar, frames, timeline, html, manimDirs, manim, tracks };
}

/** Stills from every scene (just after it starts, the middle, near the end) as one PNG, in seconds. */
export async function renderPreview(o, { log = () => {} } = {}) {
  const P = await prepare(o, log);
  const shots = P.timeline.flatMap((s) => [s.start + Math.min(1.2, (s.end - s.start) * 0.25), (s.start + s.end) / 2, s.end - 0.3].map((t) => Math.max(0, Math.min(P.frames - 1, Math.round(t * P.fps)))));
  const dir = path.join(o.cacheDir, 'preview');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await withBrowser(async (browser) => {
    const { page, context } = await openPage(browser, { html: P.html, width: P.width, height: P.height, manimDirs: P.manimDirs });
    for (const [k, f] of shots.entries()) {
      await page.evaluate((n) => window.studio.render(n), f);
      await page.screenshot({ path: path.join(dir, `${String(k).padStart(3, '0')}.png`) });
    }
    await context.close();
  });
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, shots.map((_, k) => `file '${path.join(dir, `${String(k).padStart(3, '0')}.png`).replace(/\\/g, '/')}'`).join('\n'));
  const out = o.out.replace(/\.mp4$/i, '') + '.preview.png';
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:-2,tile=3x${P.timeline.length}`, '-frames:v', '1', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not make the preview sheet: ${String(r.stderr).trim().split('\n').pop()}`);
  return { file: out, shots: shots.length, seconds: P.nar.seconds, warnings: P.warnings };
}

/**
 * Render a scene file to an MP4. Options: {scenesFile, characterFile, noHost, out, voice, audio, music,
 * sfx, fps, width, height, maxMinutes, cacheDir, keepHtml, workers}. Returns {file, srtFile,
 * seconds, frames, bytes, renderSeconds, workers}.
 */
export async function renderExplainer(o, { log = () => {} } = {}) {
  const P = await prepare(o, log);
  const { spec, cast, music, fps, width, height, nar, frames, timeline, html, manimDirs } = P;
  // The sound track: the narration, plus effects unless turned off. Lip sync reads the narration alone.
  let audioFile = nar.wav;
  const useSfx = o.sfx !== false && spec.sfx;
  if (useSfx) {
    const voice = nar.samples || readAudio(nar.wav);
    const fx = synthSfx(sfxEvents(timeline), voice.length / SR, spec.title);
    audioFile = path.join(o.cacheDir, `mix-${sha256(fs.readFileSync(nar.wav)).slice(0, 12)}-${sha256(JSON.stringify(sfxEvents(timeline))).slice(0, 8)}.wav`);
    writeWav(audioFile, mixSfx(voice, fx));
  }
  if (o.keepHtml) fs.writeFileSync(o.out.replace(/\.mp4$/i, '.html'), html);
  const meta = { title: spec.title, comment: `Made with selfclone ${VERSION}` };
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  const tmp = `${o.out}.part.mp4`;
  const segDir = path.join(o.cacheDir, `segments-${process.pid}`);
  fs.rmSync(segDir, { recursive: true, force: true });
  fs.mkdirSync(segDir, { recursive: true });
  const workers = Math.max(1, Math.min(o.workers || defaultWorkers(), STUDIO_LIMITS.maxWorkers, Math.ceil(frames / (fps * 2))));
  const t0 = Date.now();
  let doneFrames = 0;
  let nextLog = fps * 10;
  const onFrame = () => {
    doneFrames++;
    if (doneFrames >= nextLog) {
      log(`  ${doneFrames} of ${frames} frames (${Math.round((Date.now() - t0) / 1000)} s, ${workers} worker${workers === 1 ? '' : 's'})`);
      nextLog += fps * 10;
    }
  };
  const segs = [];
  try {
    await withBrowser(async (browser) => {
      // Every frame is a pure function of its number, so the frames split into independent runs.
      const per = Math.ceil(frames / workers);
      const jobs = [];
      for (let w = 0; w < workers; w++) {
        const a = w * per;
        const b = Math.min(frames, a + per);
        if (a >= b) continue;
        const file = path.join(segDir, `seg-${w}.mp4`);
        segs.push(file);
        jobs.push(renderSegment(browser, { html, width, height, manimDirs, fps, a, b, file, onFrame }));
      }
      await Promise.all(jobs);
    });
    const list = path.join(segDir, 'list.txt');
    fs.writeFileSync(list, segs.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
    const r = spawnSync('ffmpeg', encodeArgs({ fps, audio: audioFile, music, musicVolume: /ambient-[0-9a-f]{12}\.wav$/.test(String(music)) ? Math.max(spec.musicVolume, 0.8) : spec.musicVolume, seconds: nar.seconds, meta, out: tmp, video: list }), { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error(`ffmpeg could not join the video: ${String(r.stderr).trim().split('\n').slice(-3).join(' ')}`);
    const got = countFrames(tmp);
    if (got !== frames) throw new Error(`The encoded video has ${got} frames; expected ${frames}.`);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  } finally {
    fs.rmSync(segDir, { recursive: true, force: true });
  }
  fs.renameSync(tmp, o.out);
  const bytes = fs.statSync(o.out).size;
  const srtFile = o.out.replace(/\.mp4$/i, '') + '.srt';
  fs.writeFileSync(srtFile, srt(spec, nar.timings));
  return { file: o.out, srtFile, seconds: nar.seconds, frames, bytes, renderSeconds: (Date.now() - t0) / 1000, workers };
}

/**
 * The interactive version: one self-contained HTML file that plays the explainer in a browser, driven by
 * its own sound, with play and pause, a scrubber, a chapter per scene and a captions switch. The sound
 * (narration, effects, music) is embedded as AAC, Manim scenes as small transparent WebM clips, images
 * as data URLs.
 */
export async function exportHtmlPlayer(o, { log = () => {} } = {}) {
  const P = await prepare(o, log);
  const { spec, music, fps, nar, timeline } = P;
  let audioFile = nar.wav;
  if (o.sfx !== false && spec.sfx) {
    const voice = nar.samples || readAudio(nar.wav);
    audioFile = path.join(o.cacheDir, `player-mix-${sha256(fs.readFileSync(nar.wav)).slice(0, 12)}.wav`);
    writeWav(audioFile, mixSfx(voice, synthSfx(sfxEvents(timeline), voice.length / SR, spec.title)));
  }
  const m4a = path.join(o.cacheDir, 'player-audio.m4a');
  const vol = /ambient-[0-9a-f]{12}\.wav$/.test(String(music)) ? Math.max(spec.musicVolume, 0.8) : spec.musicVolume;
  const args = ['-y', '-v', 'error', '-i', audioFile];
  if (music) {
    args.push('-stream_loop', '-1', '-i', music, '-filter_complex',
      `[1:a]aresample=48000,atrim=0:${nar.seconds.toFixed(2)},volume=${vol},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, nar.seconds - 2).toFixed(2)}:d=2[m];` +
      '[0:a]aresample=48000,asplit=2[v][key];[m][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[duck];[v][duck]amix=inputs=2:duration=first:normalize=0[a]', '-map', '[a]');
  }
  args.push('-c:a', 'aac', '-b:a', '128k', m4a);
  const a = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (a.status !== 0) throw new Error(`ffmpeg could not encode the sound: ${String(a.stderr).trim().split('\n').pop()}`);
  const manimVideos = {};
  for (const [i, dir] of Object.entries(P.manimDirs)) {
    const webm = path.join(o.cacheDir, `player-manim-${i}.webm`);
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(dir, '%d.png'), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '4', webm], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg could not encode the Manim clip: ${String(r.stderr).trim().split('\n').pop()}`);
    manimVideos[i] = `data:video/webm;base64,${fs.readFileSync(webm).toString('base64')}`;
  }
  const { explainerHtml: page } = await import('./page.mjs');
  const media = loadMedia(spec, path.dirname(path.resolve(o.scenesFile)));
  const html = page({ spec, timeline, cast: P.cast, tracks: P.tracks, media, manim: P.manim, fps, width: P.width, height: P.height, player: { audio: `data:audio/mp4;base64,${fs.readFileSync(m4a).toString('base64')}`, manim: manimVideos } });
  const out = o.out.replace(/\.mp4$/i, '') + '.html';
  fs.writeFileSync(out, html);
  return { file: out, bytes: Buffer.byteLength(html), seconds: nar.seconds, scenes: spec.scenes.length };
}
