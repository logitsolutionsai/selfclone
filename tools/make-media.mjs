// Builds the README media in docs/media/ from the test painting:
//   avatar-talking.gif  the avatar speaking and blinking, a seamless loop (frames captured in headless Chrome
//                       under a fake clock, assembled with ffmpeg)
//   avatar-page.png     the avatar page with its controls and consent panel
//   game.png            the Can You Tell page from the fictional example
//   enrol.png           the webcam enrolment page recording a clip (from the e2e evidence, if present)
// Run: npm run gif   (needs Chrome or Edge, and ffmpeg on PATH)
//      node tools/make-media.mjs --avatar-only   (just avatar-talking.gif and avatar-page.png)
//
// The avatar is the photo bake, so the GIF shows the drawn mouth and the drawn blink. The clip bake would
// show patches cut from tests/fixtures/mona-lisa-clip.webm, which is the photo avatar itself reading the
// enrol phrase (see SOURCE.md), so it can only look like the drawn mouth did when that clip was made.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../src/face/chrome.mjs';
import { bakeFromPhoto } from '../src/face/bake.mjs';
import { textToVisemes } from '../face/lib/geometry.js';

const AVATAR_ONLY = process.argv.includes('--avatar-only');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = path.join(ROOT, 'docs', 'media');
const WORK = path.join(ROOT, 'tests', 'output', 'media');
fs.mkdirSync(MEDIA, { recursive: true });
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const avatarFile = path.join(WORK, 'avatar.html');
await bakeFromPhoto({
  photo: path.join(ROOT, 'tests', 'fixtures', 'mona-lisa.jpg'),
  consent: 'Demo only: a public domain painting (Mona Lisa, Leonardo da Vinci), not a living person.',
  name: 'Mona Lisa (public domain painting)',
  out: avatarFile,
});
const html = fs.readFileSync(avatarFile, 'utf8');
// Rounded lips (O, U), open vowels (AA, E, I), closed lips (M, B, P) and F and V, in one short sentence.
const SENTENCE = 'Oh, hello! I am a painting, but I can move and speak.';
const STEP = 80; // ms per frame (a GIF delay of 8 cs, 12.5 frames per second)
const FADE = 5; // frames cross-faded from the end back into the start, so the loop has no jump

async function openAvatar(browser, viewport, query) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await context.newPage();
  // Paused: time moves only with runFor, never with the real time a screenshot takes.
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.abort()));
  await page.goto(`http://avatar.local/avatar.html${query}`);
  for (let i = 0; i < 100; i++) {
    await page.clock.runFor(50);
    await new Promise((r) => setTimeout(r, 50));
    if (await page.evaluate(() => !!(window.selfclone && window.selfclone.state().frames > 3))) break;
  }
  return { context, page };
}

const browser = await launchChrome({ args: ['--mute-audio'] });
try {
  // ---- GIF: fixed time steps under a fake clock, so every frame is exactly STEP ms apart ----
  const { context, page } = await openAvatar(browser, { width: 544, height: 544 }, '?controls=0&tts=0&volume=0&blink=0&seed=gif');
  const c = await page.evaluate(() => window.selfclone.regions().canvas);
  const box = { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) };
  // A seamless loop: the idle head motion is a sum of slow sines of the page clock, so pick the moment
  // to start where the head pose a loop later is nearly the same, and the cross-fade has nothing to blend.
  const tl = textToVisemes(SENTENCE);
  const speechFrames = Math.ceil((tl.total + 100) / STEP) + 2;
  const TAU = Math.PI * 2;
  // Mirrors updateHead() in face/lib/runtime.js (idle motion only; the mouth is at rest at both ends).
  const head = (ms) => {
    const t = ms / 1000;
    return [
      4 * (0.6 * Math.sin(TAU * 0.071 * t + 1.3) + 0.4 * Math.sin(TAU * 0.131 * t + 0.2)),
      2.5 * (0.6 * Math.sin(TAU * 0.093 * t + 2.1) + 0.4 * Math.sin(TAU * 0.171 * t + 4.0)),
      1.2 * Math.sin(TAU * 0.053 * t + 0.7),
      Math.sin((TAU * t) / 4.6),
    ];
  };
  const now0 = await page.evaluate(() => performance.now());
  // Up to 5 extra frames of rest at the end give the search more loop lengths to choose from.
  let best = null;
  for (let extra = 0; extra <= 5; extra++) {
    const L = (1 + speechFrames + extra + FADE) * STEP;
    for (let T = now0 + 1000; T < now0 + 600000; T += 10) {
      let cost = 0;
      for (let j = 0; j < FADE; j++) {
        const a = head(T + j * STEP);
        const b = head(T + j * STEP + L);
        for (let q = 0; q < 4; q++) cost += Math.abs(a[q] - b[q]);
      }
      if (!best || cost < best.cost) best = { T, cost, extra };
    }
  }
  await page.clock.fastForward(Math.round(best.T - STEP - now0));
  console.log(`loop start at ${(best.T / 1000).toFixed(2)} s of page time, head pose mismatch ${(best.cost / FADE).toFixed(3)} (degrees and px per frame)`);
  let n = 0;
  const frame = async () => {
    await page.clock.runFor(STEP);
    await page.screenshot({ path: path.join(WORK, `f${String(n).padStart(4, '0')}.png`), clip: box });
    n++;
  };
  // At rest for the frames that the end fades back into, then the sentence with a blink in its pause,
  // and rest again (the sentence ends with half a second of closed lips).
  for (let i = 0; i < FADE + 1; i++) await frame();
  await page.evaluate((t) => {
    window.__done = false;
    window.selfclone.say(t, { tts: false }).then(() => (window.__done = true));
  }, SENTENCE);
  // One blink in the pause after "painting,", as people do between phrases.
  const blinkAt = tl.words.find((w) => w.text === 'but').start - 200;
  let blinked = false;
  for (let i = 0; i < speechFrames; i++) {
    if (!blinked && i * STEP >= blinkAt) {
      await page.evaluate(() => window.selfclone.blink());
      blinked = true;
    }
    await frame();
  }
  if (!(await page.evaluate(() => window.__done === true))) throw new Error('the sentence did not finish inside the loop');
  for (let i = 0; i < best.extra + FADE; i++) await frame();
  await context.close();

  const gif = path.join(MEDIA, 'avatar-talking.gif');
  const fps = 1000 / STEP;
  const ff = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(WORK, 'f%04d.png'),
    '-filter_complex',
    // Loop: drop the first FADE frames, and cross-fade the last FADE frames into them.
    `[0]split[a][b];[a]trim=start_frame=${FADE},setpts=PTS-STARTPTS[main];[b]trim=end_frame=${FADE},setpts=PTS-STARTPTS[head];` +
    `[main][head]xfade=transition=fade:duration=${(FADE * STEP) / 1000}:offset=${((n - 2 * FADE) * STEP) / 1000},` +
    // One palette for the whole loop, built from the frames plus an enlarged copy of the mouth, so the
    // few dark mouth tones get their own colours instead of being mapped to skin; a fine ordered dither
    // keeps the skin from banding without the noise (and size) of error diffusion.
    'scale=320:-1:flags=lanczos,split=3[x][y][z];[z]crop=70:40:115:168,scale=320:-1[m];[x][m]vstack[pin];' +
    '[pin]palettegen=max_colors=100:stats_mode=full[p];[y][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0', gif,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr}`);
  console.log(`GIF: ${n} frames captured, ${n - FADE} in the loop (${(((n - FADE) * STEP) / 1000).toFixed(1)} s), ${Math.round(fs.statSync(gif).size / 1024)} KB`);

  // ---- avatar page with controls and the consent panel open, caught mid-word ----
  // Tall enough that About opens below its button, so the face stays in view; the shot ends under the panel.
  const p2 = await openAvatar(browser, { width: 600, height: 1200 }, '?tts=0&idle=0&blink=0');
  await p2.page.fill('#text', 'Hello. I am an AI clone of a painting.');
  await p2.page.click('#infoBtn');
  await p2.page.clock.runFor(800);
  await p2.page.evaluate(() => {
    window.selfclone.say('Hello. I am an AI clone of a painting.', { tts: false });
  });
  for (let i = 0; i < 80; i++) {
    await p2.page.clock.runFor(20);
    const st = await p2.page.evaluate(() => window.selfclone.state());
    if (i > 10 && st.params.jaw > 0.4) break;
  }
  const bottom = await p2.page.evaluate(() => Math.ceil(Math.max(document.getElementById('info').getBoundingClientRect().bottom, document.getElementById('controls').getBoundingClientRect().bottom)) + 16);
  await p2.page.screenshot({ path: path.join(MEDIA, 'avatar-page.png'), clip: { x: 0, y: 0, width: 600, height: bottom } });
  await p2.context.close();

  // ---- game page from the fictional example ----
  const gameFile = path.join(ROOT, 'examples', 'maya', 'workspace', 'can-you-tell.html');
  if (!AVATAR_ONLY && fs.existsSync(gameFile)) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 760 }, colorScheme: 'dark', deviceScaleFactor: 1 });
    const p3 = await ctx.newPage();
    await p3.setContent(fs.readFileSync(gameFile, 'utf8'));
    await p3.click('button.reply >> nth=1');
    await p3.evaluate(() => document.activeElement && document.activeElement.blur());
    await p3.mouse.move(2, 2);
    await p3.waitForTimeout(800); // the tags and the verdict materialise on springs
    await p3.screenshot({ path: path.join(MEDIA, 'game.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
}

// The enrolment page while it records a clip (from the e2e evidence), or the still-frame checks.
const enrol = ['evidence-enrol-clip-recording.png', 'evidence-enrol-checks.png'].map((f) => path.join(ROOT, 'tests', 'output', f)).find((f) => fs.existsSync(f));
if (enrol && !AVATAR_ONLY) fs.copyFileSync(enrol, path.join(MEDIA, 'enrol.png'));
for (const f of fs.readdirSync(MEDIA)) console.log(`${f}: ${Math.round(fs.statSync(path.join(MEDIA, f)).size / 1024)} KB`);
