// Builds the README media in docs/media/ from the test painting:
//   avatar-talking.gif  the clip-baked avatar speaking (frames captured in headless Chrome, assembled with ffmpeg)
//   avatar-page.png     the avatar page with its controls and consent panel
//   game.png            the Can You Tell page from the fictional example
//   enrol.png           the webcam enrolment page recording a clip (from the e2e evidence, if present)
// Run: npm run gif   (needs Chrome or Edge, and ffmpeg on PATH)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../src/face/chrome.mjs';
import { bakeFromPhoto } from '../src/face/bake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = path.join(ROOT, 'docs', 'media');
const WORK = path.join(ROOT, 'tests', 'output', 'media');
fs.mkdirSync(MEDIA, { recursive: true });
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const avatarFile = path.join(WORK, 'avatar.html');
// Baked from the synthetic enrol clip (the painting reading the enrol phrase; see tests/fixtures/SOURCE.md),
// the way a user bakes from a 10-second clip. docs/make-contact-sheet.mjs makes the photo against clip image.
await bakeFromPhoto({
  video: path.join(ROOT, 'tests', 'fixtures', 'mona-lisa-clip.webm'),
  consent: 'Demo only: a public domain painting (Mona Lisa, Leonardo da Vinci), not a living person.',
  name: 'Mona Lisa (public domain painting)',
  out: avatarFile,
});
const html = fs.readFileSync(avatarFile, 'utf8');

const browser = await launchChrome({ args: ['--mute-audio'] });
try {
  // ---- GIF: real-time capture with true per-frame durations ----
  const page = await browser.newPage({ viewport: { width: 544, height: 544 }, deviceScaleFactor: 1 });
  await page.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.abort()));
  await page.goto('http://avatar.local/avatar.html?controls=0&tts=0&volume=0&seed=gif');
  await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3);
  const clip = await page.evaluate(() => window.selfclone.regions().canvas);
  await page.waitForTimeout(600);
  const frames = [];
  const t0 = Date.now();
  let said = false;
  while (Date.now() - t0 < 6500) {
    if (!said && Date.now() - t0 > 500) {
      await page.evaluate(() => {
        window.selfclone.say('Hello. I am an AI clone of a painting. I blink, I nod, and I read whatever you type.', { tts: false });
      });
      said = true;
    }
    if (Date.now() - t0 > 2600 && Date.now() - t0 < 2700) await page.evaluate(() => window.selfclone.blink());
    const file = path.join(WORK, `f${String(frames.length).padStart(4, '0')}.png`);
    await page.screenshot({ path: file, clip });
    frames.push({ file, t: Date.now() - t0 });
  }
  await page.close();
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? (frames[i + 1].t - frames[i].t) / 1000 : 0.08;
    list.push(`file '${frames[i].file.replace(/\\/g, '/')}'`, `duration ${dur.toFixed(3)}`);
  }
  list.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  const listFile = path.join(WORK, 'frames.txt');
  fs.writeFileSync(listFile, list.join('\n'));
  const gif = path.join(MEDIA, 'avatar-talking.gif');
  const ff = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    // The padded swatches bias the shared palette toward the drawn teeth tones, which are only a few
    // pixels per frame and otherwise get mapped to the painting's pale sky colours.
    '-vf', 'fps=12,scale=320:-1:flags=lanczos,split[a][b];[a]pad=iw:ih+12:0:0:color=0xA5977F,pad=iw:ih+12:0:0:color=0x9C8E77,pad=iw:ih+12:0:0:color=0xB4A68D,pad=iw:ih+12:0:0:color=0xC2B59C,palettegen=max_colors=112:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    '-loop', '0', gif,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr}`);
  console.log(`GIF: ${frames.length} frames captured over ${(frames[frames.length - 1].t / 1000).toFixed(1)} s, ${Math.round(fs.statSync(gif).size / 1024)} KB`);

  // ---- avatar page with controls and the consent panel open ----
  const p2 = await browser.newPage({ viewport: { width: 600, height: 980 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await p2.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.abort()));
  await p2.goto('http://avatar.local/avatar.html?tts=0&idle=0&blink=0');
  await p2.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3);
  await p2.fill('#text', 'Hello. I am an AI clone of a painting.');
  await p2.click('#infoBtn');
  await p2.evaluate(() => {
    window.selfclone.say('Hello. I am an AI clone of a painting.', { tts: false });
  });
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: path.join(MEDIA, 'avatar-page.png'), fullPage: true });
  await p2.close();

  // ---- game page from the fictional example ----
  const gameFile = path.join(ROOT, 'examples', 'maya', 'workspace', 'can-you-tell.html');
  if (fs.existsSync(gameFile)) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 760 }, colorScheme: 'dark', deviceScaleFactor: 1 });
    const p3 = await ctx.newPage();
    await p3.setContent(fs.readFileSync(gameFile, 'utf8'));
    await p3.click('button.reply >> nth=1');
    await p3.screenshot({ path: path.join(MEDIA, 'game.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
}

// The enrolment page while it records a clip (from the e2e evidence), or the still-frame checks.
const enrol = ['evidence-enrol-clip-recording.png', 'evidence-enrol-checks.png'].map((f) => path.join(ROOT, 'tests', 'output', f)).find((f) => fs.existsSync(f));
if (enrol) fs.copyFileSync(enrol, path.join(MEDIA, 'enrol.png'));
for (const f of fs.readdirSync(MEDIA)) console.log(`${f}: ${Math.round(fs.statSync(path.join(MEDIA, f)).size / 1024)} KB`);
