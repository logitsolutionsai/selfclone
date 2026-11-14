// Clip enrolment, end to end: bake from the synthetic fixture clip (the test painting reading the
// enrol phrase, see tests/fixtures/SOURCE.md), then check that the avatar draws real patches for
// the mouth and the eyes, offline, in both renderers. The landmarker reads the clip's drawn O and U
// clearly but its drawn AA and E as nearly closed (see SOURCE.md), so the patch checks use O.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bakeFromPhoto } from '../../src/face/bake.mjs';
import { launchChrome } from '../../src/face/chrome.mjs';
import { OUT, ROOT, decodePng, meanDiff, makeWav, sleep } from './helpers.mjs';

const CLIP = path.join(ROOT, 'tests', 'fixtures', 'mona-lisa-clip.webm');
const AVATAR = path.join(OUT, 'clip-avatar.html');
const FAKE = 'http://avatar.local/avatar.html';
let browser;
let html;
let res;

before(async () => {
  res = await bakeFromPhoto({
    video: CLIP,
    consent: 'Test fixture: public domain painting, used to test the avatar.',
    name: 'Lisa Gherardini (painting)',
    out: AVATAR,
  });
  html = fs.readFileSync(AVATAR, 'utf8');
  browser = await launchChrome({ args: ['--mute-audio'] });
});

after(async () => {
  if (browser) await browser.close();
});

const dataOf = (h) => JSON.parse(h.match(/<script id="selfclone-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);

async function openOffline(query = '') {
  const page = await browser.newPage({ viewport: { width: 560, height: 820 } });
  const problems = [];
  const blocked = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u === FAKE || u.startsWith(FAKE + '?')) return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
    blocked.push(u);
    return route.abort();
  });
  await page.goto(`${FAKE}${query}`);
  await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3, null, { timeout: 30000 });
  return { page, problems, blocked };
}

async function shot(page, box, name) {
  const buf = await page.screenshot({ clip: box });
  if (name) fs.writeFileSync(path.join(OUT, name), buf);
  return decodePng(buf);
}

async function mouthBox(page) {
  const r = await page.evaluate(() => window.selfclone.regions());
  return { x: r.mouth.x, y: r.mouth.y, width: r.mouth.width, height: r.mouth.height };
}

test('bake --video: the avatar holds a rest photo plus small mouth and eye patches, and no video', () => {
  assert.ok(res.clip, 'clip summary returned');
  assert.ok(res.clip.shapes.includes('O') && res.clip.shapes.includes('U'), `shapes ${res.clip.shapes.join(', ')}`);
  assert.ok(res.clip.shapes.length >= 2, `at least two mouth shapes found: ${res.clip.shapes.join(', ')}`);
  assert.equal(res.clip.blink, true, 'a closed-eyes frame was found');
  const data = dataOf(html);
  assert.equal(data.consent.method, 'video');
  assert.equal(data.landmarks.length, 478);
  assert.equal(data.clip.source, 'video');
  assert.equal(data.clip.frames, 150);
  for (const [k, s] of Object.entries(data.clip.shapes)) {
    assert.match(s.image, /^data:image\/(webp|jpeg);base64,/, k);
    assert.ok(s.w < 200 && s.h < 200, `${k} patch is small (${s.w}x${s.h})`);
    assert.ok(s.d.length > 30, `${k} has measured displacements`);
  }
  assert.equal(data.clip.blink.eyes.length, 2);
  const clipBytes = Buffer.byteLength(JSON.stringify(data.clip));
  assert.ok(clipBytes < 250 * 1024, `clip data ${Math.round(clipBytes / 1024)} KB`);
  assert.ok(fs.statSync(AVATAR).size < 1.5 * 1024 * 1024);
  assert.ok(!/data:video|webm|<video/i.test(html), 'the video itself is not in the avatar');
  assert.ok(!/(?:src|href)=["']https?:/i.test(html), 'no external src or href');
});

test('speaking O draws the mouth from the clip patch, not the drawn mouth', async (t) => {
  const { page, problems, blocked } = await openOffline('?idle=0&blink=0&tts=0&volume=0');
  let drawnO;
  try {
    const box = await mouthBox(page);
    const rest = await shot(page, box, 'evidence-clip-rest.png');
    await page.evaluate(() => window.selfclone.pose({ viseme: 'O' }));
    await sleep(400);
    const st = await page.evaluate(() => window.selfclone.state());
    assert.equal(st.mouthPath, 'patch');
    assert.equal(st.patchShape, 'O');
    const o = await shot(page, box, 'evidence-clip-O.png');
    const d = meanDiff(rest, o);
    t.diagnostic(`clip O vs rest ${d.toFixed(2)}`);
    assert.ok(d > 3, `the mouth changes (${d.toFixed(2)})`);
    // Typed text goes through the patch path too, and back to rest after.
    await page.evaluate(() => window.selfclone.pose(null));
    const before = (await page.evaluate(() => window.selfclone.state())).pathFrames.patch;
    await page.evaluate(() => {
      window.selfclone.say('Oh, who knew? Oh, you do.', { tts: false });
    });
    await page.waitForFunction((n) => window.selfclone.state().pathFrames.patch > n + 3, before, { timeout: 5000 });
    await page.waitForFunction(() => !window.selfclone.state().speaking, null, { timeout: 20000 });
    await sleep(600);
    const after = await shot(page, box);
    assert.ok(meanDiff(rest, after) < 1, 'back to rest');
    const st2 = await page.evaluate(() => window.selfclone.state());
    t.diagnostic(`frames by path while speaking: ${JSON.stringify(st2.pathFrames)}`);
    assert.ok(st2.pathFrames.patch > before + 3);
    assert.deepEqual(blocked, []);
    assert.deepEqual(problems, []);
    // The same avatar with patches=0 draws O the photo way, and it looks different.
    const p2 = await openOffline('?idle=0&blink=0&tts=0&volume=0&patches=0');
    try {
      await p2.page.evaluate(() => window.selfclone.pose({ viseme: 'O' }));
      await sleep(400);
      assert.equal(await p2.page.evaluate(() => window.selfclone.state().mouthPath), 'drawn');
      drawnO = await shot(p2.page, box, 'evidence-clip-O-drawn.png');
    } finally {
      await p2.page.close();
    }
    const dd = meanDiff(o, drawnO);
    t.diagnostic(`clip O vs drawn O ${dd.toFixed(2)}`);
    assert.ok(dd > 1.5, `patch pixels differ from the drawn mouth (${dd.toFixed(2)})`);
  } finally {
    await page.close();
  }
});

test('audio drives the clip patches by loudness and brightness, then returns to rest', async (t) => {
  const { page, problems } = await openOffline('?idle=0&blink=0&tts=0&volume=0');
  try {
    const box = await mouthBox(page);
    const rest = await shot(page, box);
    const wav = makeWav({ seconds: 1.6 }).toString('base64');
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      window.selfclone.sayAudio(new Blob([bytes], { type: 'audio/wav' }));
    }, wav);
    await page.waitForFunction(() => window.selfclone.state().pathFrames.patch > 3, null, { timeout: 8000 });
    await page.waitForFunction(() => !window.selfclone.state().speaking, null, { timeout: 20000 });
    await sleep(600);
    const st = await page.evaluate(() => window.selfclone.state());
    t.diagnostic(`audio frames by path: ${JSON.stringify(st.pathFrames)}`);
    assert.equal(st.mouthPath, 'rest');
    assert.ok(meanDiff(rest, await shot(page, box)) < 1, 'back to rest');
    assert.deepEqual(problems.filter((p) => !/AudioContext was not allowed/.test(p)), []);
  } finally {
    await page.close();
  }
});

test('a blink shows the closed-eye patches and reopens', async (t) => {
  const { page } = await openOffline('?idle=0&blink=0&tts=0');
  try {
    const reg = await page.evaluate(() => window.selfclone.regions());
    const e0 = reg.eyes[0];
    const e1 = reg.eyes[1];
    const box = { x: e0.x, y: Math.min(e0.y, e1.y) - 6, width: e1.x + e1.width - e0.x, height: Math.max(e0.height, e1.height) + 12 };
    const open = await shot(page, box);
    await page.evaluate(() => window.selfclone.pose({ blink: true }));
    await sleep(150);
    assert.equal(await page.evaluate(() => window.selfclone.state().eyePath), 'patch');
    const closed = await shot(page, box, 'evidence-clip-blink.png');
    await page.evaluate(() => window.selfclone.pose(null));
    await sleep(300);
    const reopened = await shot(page, box);
    const d = meanDiff(open, closed);
    t.diagnostic(`blink diff ${d.toFixed(2)}, after ${meanDiff(open, reopened).toFixed(2)}`);
    assert.ok(d > 2);
    assert.ok(meanDiff(open, reopened) < 0.8);
  } finally {
    await page.close();
  }
});

test('the Canvas2D fallback draws the patches too', async () => {
  const { page, problems } = await openOffline('?idle=0&blink=0&tts=0&renderer=2d');
  try {
    await page.evaluate(() => window.selfclone.pose({ viseme: 'O' }));
    await sleep(400);
    const st = await page.evaluate(() => window.selfclone.state());
    assert.equal(st.renderer, '2d');
    assert.equal(st.mouthPath, 'patch');
    assert.deepEqual(problems, []);
  } finally {
    await page.close();
  }
});

test('opened from disk (file://) with the network off, the clip avatar works with no errors', async (t) => {
  const context = await browser.newContext({ viewport: { width: 560, height: 820 }, offline: true });
  const page = await context.newPage();
  const problems = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    if (!/^(?:file|data|blob):/.test(r.url())) requests.push(r.url());
  });
  try {
    await page.goto(pathToFileURL(AVATAR).href + '?idle=0&blink=0&tts=0');
    await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3, null, { timeout: 30000 });
    await page.evaluate(() => window.selfclone.say('Oh, why would you move a big cheap boat?', { tts: false }));
    await page.waitForFunction(() => window.selfclone.state().pathFrames.patch > 3, null, { timeout: 8000 });
    t.diagnostic(`file:// renderer ${await page.evaluate(() => window.selfclone.renderer)}, clip ${JSON.stringify(await page.evaluate(() => window.selfclone.clip))}`);
    assert.deepEqual(requests, []);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test('the badge and the consent panel say the face came from a clip', async () => {
  const { page } = await openOffline('?idle=0&blink=0&tts=0');
  try {
    await page.click('#infoBtn');
    const info = await page.evaluate(() => {
      const b = document.getElementById('badge');
      return {
        text: b.textContent,
        source: b.dataset.source,
        title: b.title,
        method: document.getElementById('infoMethod').textContent,
        clip: document.getElementById('infoClip').textContent,
        note: document.getElementById('infoNote').textContent,
      };
    });
    assert.equal(info.text, 'AI CLONE');
    assert.equal(info.source, 'clip');
    assert.match(info.title, /video clip/);
    assert.match(info.method, /Video file, processed in memory/);
    assert.match(info.clip, /150 frames read/);
    assert.match(info.clip, /mouth patches for .*O/);
    assert.match(info.note, /short clip/);
    // Removing the badge brings it back with the same record.
    await page.evaluate(() => document.getElementById('badge').remove());
    await sleep(1300);
    assert.equal(await page.evaluate(() => document.getElementById('badge').dataset.source), 'clip');
  } finally {
    await page.close();
  }
});

test('the CLI refuses a video bake without consent, and both --photo and --video at once', () => {
  const cli = path.join(ROOT, 'scripts', 'selfclone.mjs');
  const dir = path.join(OUT, 'clip-noconsent');
  const r = spawnSync(process.execPath, [cli, 'bake', '--video', CLIP, '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to bake without consent/);
  assert.ok(!fs.existsSync(path.join(dir, 'avatar.html')));
  const r2 = spawnSync(process.execPath, [cli, 'bake', '--video', CLIP, '--photo', CLIP, '--consent', 'This is a test consent statement.', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /either --photo or --video/);
});
