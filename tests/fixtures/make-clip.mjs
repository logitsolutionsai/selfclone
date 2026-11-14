// Makes tests/fixtures/mona-lisa-clip.webm, the synthetic enrol clip used by the clip tests.
// No real person is filmed: the public domain painting is baked into a photo avatar, which then
// reads the enrol phrase and blinks twice in headless Chrome. Frames are captured under a paused fake
// clock (exactly 15 frames per second of page time, whatever a screenshot costs in real time, so every
// mouth shape is held for its full length and every blink is caught) and encoded with ffmpeg.
// Run: node tests/fixtures/make-clip.mjs   (needs Chrome or Edge, and ffmpeg on PATH)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../src/face/chrome.mjs';
import { bakeFromPhoto } from '../../src/face/bake.mjs';
import { ENROL_PHRASE, CLIP_FPS, CLIP_SECONDS } from '../../face/lib/clip.js';
import { textToVisemes } from '../../face/lib/geometry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = path.join(ROOT, 'tests', 'output', 'clip-frames');
const OUTFILE = path.join(HERE, 'mona-lisa-clip.webm');
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const avatarFile = path.join(WORK, 'source-avatar.html');
await bakeFromPhoto({
  photo: path.join(HERE, 'mona-lisa.jpg'),
  consent: 'Test fixture: a public domain painting (Mona Lisa), not a living person.',
  name: 'Mona Lisa (public domain painting)',
  out: avatarFile,
});
const html = fs.readFileSync(avatarFile, 'utf8');
const STEP = 1000 / CLIP_FPS;
// Still before (9 frames) and after (6), two blinks (2 + 9 frames each), a few frames to spare: the
// phrase gets the rest of the 10 seconds, read slowly and evenly (about 0.73 of the normal rate, so
// each vowel lasts about 165 ms, two to three frames).
const PHRASE_FRAMES = CLIP_SECONDS * CLIP_FPS - 9 - 6 - 22 - 4;
const RATE = Math.round((textToVisemes(ENROL_PHRASE).total / (PHRASE_FRAMES * STEP)) * 100) / 100;

const browser = await launchChrome({ args: ['--mute-audio'] });
try {
  const context = await browser.newContext({ viewport: { width: 560, height: 560 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.abort()));
  await page.goto('http://avatar.local/avatar.html?controls=0&idle=0&blink=0&tts=0&volume=0');
  for (let i = 0; i < 100; i++) {
    await page.clock.runFor(50);
    await new Promise((r) => setTimeout(r, 50));
    if (await page.evaluate(() => !!(window.selfclone && window.selfclone.state().frames > 3))) break;
  }
  const clip = await page.evaluate(() => window.selfclone.regions().canvas);
  const box = { x: Math.round(clip.x), y: Math.round(clip.y), width: 512, height: 512 };
  let n = 0;
  const frame = async () => {
    await page.clock.runFor(STEP);
    await page.screenshot({ path: path.join(WORK, `f${String(n).padStart(4, '0')}.png`), clip: box });
    n++;
  };
  // Keep still for a moment, read the phrase at a careful pace (as people do when asked to read
  // aloud), then blink twice (eyes shut for two frames, about 130 ms) and keep still again.
  for (let i = 0; i < 9; i++) await frame();
  await page.evaluate(({ t, rate }) => {
    window.__said = window.selfclone.say(t, { tts: false, rate }).then(() => (window.__done = true));
  }, { t: ENROL_PHRASE, rate: RATE });
  for (let i = 0; i < 400 && !(await page.evaluate(() => window.__done === true)); i++) await frame();
  for (let i = 0; i < 6; i++) await frame();
  for (const gap of [9, 9]) {
    await page.evaluate(() => window.selfclone.pose({ blink: true }));
    for (let i = 0; i < 2; i++) await frame();
    await page.evaluate(() => window.selfclone.pose(null));
    for (let i = 0; i < gap; i++) await frame();
  }
  if (n > CLIP_SECONDS * CLIP_FPS) throw new Error(`the phrase did not fit: ${n} frames`);
  while (n < CLIP_SECONDS * CLIP_FPS) await frame();
  await context.close();
  console.log(`captured ${n} frames (${(n / CLIP_FPS).toFixed(1)} s), phrase at rate ${RATE}`);
} finally {
  await browser.close();
}

const ff = spawnSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', String(CLIP_FPS), '-i', path.join(WORK, 'f%04d.png'),
  '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-pix_fmt', 'yuv420p', '-row-mt', '1', '-an', OUTFILE,
], { encoding: 'utf8' });
if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr}`);
console.log(`${path.relative(ROOT, OUTFILE)}: ${Math.round(fs.statSync(OUTFILE).size / 1024)} KB`);
