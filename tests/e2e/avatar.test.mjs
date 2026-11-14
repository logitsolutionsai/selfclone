// Browser tests for the face: bake from a still photo, then drive the offline
// avatar in headless Chrome (installed Chrome, never a downloaded one).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bakeFromPhoto } from '../../src/face/bake.mjs';
import { launchChrome } from '../../src/face/chrome.mjs';
import { startAvatarServer, sayText, sayAudio } from '../../src/face/server.mjs';
import { OUT, FIXTURE, ROOT, decodePng, meanDiff, makeWav, sleep } from './helpers.mjs';
import { labelCoverage, labelOk } from '../../src/face/video.mjs';

const AVATAR = path.join(OUT, 'avatar.html');
const FAKE = 'http://avatar.local/avatar.html';
let browser;
let html;
let bakeResult;

before(async () => {
  bakeResult = await bakeFromPhoto({
    photo: FIXTURE,
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

/** Open the avatar from a fake origin with every other request blocked. */
async function openOffline(query = '', opts = {}) {
  const page = await browser.newPage({ viewport: { width: 560, height: 820 } });
  // A controllable page clock (time still flows until a test pauses it), for animations that must be sampled
  // at exact moments rather than at whatever speed screenshots happen to run.
  if (opts.clock) await page.clock.install({ time: 0 });
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

test('bake from the fixture photo produces 478 landmarks and a standalone avatar', () => {
  assert.equal(bakeResult.landmarks, 478);
  assert.equal(bakeResult.bake.landmarks.length, 478);
  assert.ok(bakeResult.triangles > 800, `triangles ${bakeResult.triangles}`);
  assert.ok(fs.statSync(AVATAR).size < 1.5 * 1024 * 1024);
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
  assert.ok(!/(?:src|href)=["']https?:/i.test(html), 'no external src or href');
  assert.match(html, /AI CLONE/);
  const data = JSON.parse(html.match(/<script id="selfclone-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.landmarks.length, 478);
  assert.equal(data.consent.method, 'photo');
  assert.match(data.consent.photoSha256, /^[0-9a-f]{64}$/);
  assert.match(data.image, /^data:image\/jpeg;base64,/);
});

test('the CLI refuses to bake without consent', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'selfclone.mjs'), 'bake', '--photo', FIXTURE, '--dir', path.join(OUT, 'noconsent')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to bake without consent/);
  assert.ok(!fs.existsSync(path.join(OUT, 'noconsent', 'avatar.html')));
});

test('avatar opens offline with no errors, no requests, and a visible badge', async (t) => {
  const { page, problems, blocked } = await openOffline('?idle=0&blink=0&tts=0&volume=0');
  try {
    const st = await page.evaluate(() => window.selfclone.state());
    assert.ok(['webgl', '2d'].includes(st.renderer));
    const badge = await page.evaluate(() => {
      const b = document.getElementById('badge');
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return { text: b.textContent, w: r.width, h: r.height, opacity: cs.opacity, display: cs.display, visibility: cs.visibility };
    });
    assert.equal(badge.text, 'AI CLONE');
    assert.ok(badge.w > 20 && badge.h > 10);
    assert.equal(badge.opacity, '1');
    assert.equal(badge.visibility, 'visible');
    await shot(page, (await page.evaluate(() => window.selfclone.regions())).canvas, `evidence-rest-${st.renderer}.png`);
    await sleep(300);
    assert.deepEqual(blocked, [], 'no network requests');
    assert.deepEqual(problems, [], 'no console errors or warnings');
    t.diagnostic(`renderer: ${st.renderer}`);
  } finally {
    await page.close();
  }
});

test('avatar also works opened straight from disk (file://) with no requests', async (t) => {
  const page = await browser.newPage({ viewport: { width: 560, height: 820 } });
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
    await page.evaluate(() => {
      window.selfclone.say('File mode works.', { tts: false });
    });
    await page.waitForFunction(() => window.selfclone.state().params.jaw > 0.1, null, { timeout: 5000 });
    t.diagnostic(`file:// renderer: ${await page.evaluate(() => window.selfclone.renderer)}`);
    assert.deepEqual(requests, []);
    assert.deepEqual(problems, []);
  } finally {
    await page.close();
  }
});

test('the badge comes back if removed or hidden', async (t) => {
  const { page } = await openOffline('?idle=0&blink=0&tts=0');
  try {
    await page.evaluate(() => document.getElementById('badge').remove());
    await sleep(1300);
    assert.equal(await page.evaluate(() => document.getElementById('badge')?.textContent), 'AI CLONE');
    await page.evaluate(() => (document.getElementById('badge').style.display = 'none'));
    await sleep(1300);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById('badge')).display), 'none');
  } finally {
    await page.close();
  }
});

test('the badge is a near-black chip with white letters on the photo in both themes', async () => {
  const { page } = await openOffline('?idle=0&blink=0&tts=0');
  try {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      const cs = await page.evaluate(() => {
        const s = getComputedStyle(document.getElementById('badge'));
        return { bg: s.backgroundColor, fg: s.color, ring: s.boxShadow, page: getComputedStyle(document.body).backgroundColor };
      });
      assert.equal(cs.bg, 'rgb(17, 17, 16)', `${scheme}: fill`);
      assert.equal(cs.fg, 'rgb(255, 255, 255)', `${scheme}: letters`);
      assert.match(cs.ring, /rgba\(255, 255, 255, 0\.25\) 0px 0px 0px 1px/, `${scheme}: ring`);
      assert.equal(cs.page, scheme === 'light' ? 'rgb(247, 247, 245)' : 'rgb(14, 14, 13)', `${scheme}: Ink page`);
    }
  } finally {
    await page.close();
  }
});

test('the video label check finds the chin label in a rendered export frame, and fails when it is clipped away', async () => {
  const { page } = await openOffline('?export=circle&controls=0&tts=0&idle=0&blink=0&seed=video');
  try {
    await page.setViewportSize({ width: 320, height: 320 });
    await sleep(400);
    const box = await page.evaluate(() => {
      const r = document.getElementById('badge').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const frame = async (name) => decodePng(await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 320 }, path: path.join(OUT, name) }));
    const withLabel = labelCoverage(await frame('evidence-export-label.png'), box);
    assert.ok(labelOk(withLabel), `label found: fill ${withLabel.fill.toFixed(2)}, white ${withLabel.white.toFixed(2)}`);
    // clip-path hides the label from the frame without tripping the page's own guard (it checks display,
    // visibility, opacity and size), so only the frame check stands between this frame and the encoder.
    await page.evaluate(() => document.getElementById('badge').style.setProperty('clip-path', 'inset(50%)'));
    await sleep(1300);
    const without = labelCoverage(await frame('evidence-export-nolabel.png'), box);
    assert.ok(!labelOk(without), `no label: fill ${without.fill.toFixed(2)}, white ${without.white.toFixed(2)}`);
  } finally {
    await page.close();
  }
});

test('About opens as a sheet anchored to its button and closes back into it', async () => {
  const { page } = await openOffline('?idle=0&blink=0&tts=0');
  try {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.click('#infoBtn');
    await page.waitForFunction(() => !document.getElementById('info').hidden && getComputedStyle(document.getElementById('info')).opacity === '1', null, { timeout: 3000 });
    const st = await page.evaluate(() => {
      const b = document.getElementById('infoBtn').getBoundingClientRect();
      const i = document.getElementById('info');
      const r = i.getBoundingClientRect();
      return { expanded: document.getElementById('infoBtn').getAttribute('aria-expanded'), gap: Math.min(Math.abs(r.top - b.bottom), Math.abs(b.top - r.bottom)), origin: getComputedStyle(i).transformOrigin, scrim: document.getElementById('scrim').hidden };
    });
    assert.equal(st.expanded, 'true');
    assert.ok(st.gap < 12, `sheet sits next to its button (gap ${st.gap}px)`);
    assert.ok(st.scrim, 'no scrim on a wide screen');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('info').hidden, null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.getElementById('infoBtn').getAttribute('aria-expanded')), 'false');
  } finally {
    await page.close();
  }
});

test('under 600 px About is a bottom sheet: a flick down on the grab bar closes it, a small drag springs back', async () => {
  const { page } = await openOffline('?idle=0&blink=0&tts=0');
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click('#infoBtn');
    await page.waitForFunction(() => {
      const i = document.getElementById('info');
      return !i.hidden && !document.getElementById('scrim').hidden && Math.abs(i.getBoundingClientRect().bottom - innerHeight) < 1;
    }, null, { timeout: 3000 });
    const g = await page.locator('#grab').boundingBox();
    const x = g.x + g.width / 2;
    const y = g.y + g.height / 2;
    // A short, slow drag: it follows the pointer, then springs back open.
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 5; k++) {
      await page.mouse.move(x, y + 8 * k);
      await sleep(60);
    }
    const followed = await page.evaluate(() => document.getElementById('info').style.transform);
    // 1:1 tracking of a 40 px drag gives a whole number (translateY(40px)); a frame mid-update can give a fraction.
    assert.match(followed, /translateY\((3\d|4\d)(\.\d+)?px\)/, `the sheet tracks the pointer (${followed})`);
    await sleep(200);
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(document.getElementById('info').getBoundingClientRect().bottom - innerHeight) < 1, null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.getElementById('info').hidden), false, 'still open');
    // Dragged up past open, it resists (rubber band) instead of following 1:1.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 120, { steps: 6 });
    const up = await page.evaluate(() => Number((document.getElementById('info').style.transform.match(/-?[\d.]+/) || [0])[0]));
    assert.ok(up < 0 && up > -80, `rubber band above open (${up})`);
    await page.mouse.up();
    await sleep(500);
    // A quick flick down closes it.
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 4; k++) {
      await page.mouse.move(x, y + 30 * k);
      await sleep(16);
    }
    await page.mouse.up();
    await page.waitForFunction(() => document.getElementById('info').hidden && document.getElementById('scrim').hidden, null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.getElementById('infoBtn').getAttribute('aria-expanded')), 'false');
  } finally {
    await page.close();
  }
});

async function speechDiffTest(t, query, start, label) {
  const { page, problems, blocked } = await openOffline(query);
  try {
    const reg = await page.evaluate(() => window.selfclone.regions());
    const box = { x: reg.mouth.x, y: reg.mouth.y, width: reg.mouth.width, height: reg.mouth.height };
    const rest = await shot(page, box, `evidence-${label}-rest.png`);
    await start(page);
    let maxDiff = 0;
    let best = null;
    for (let i = 0; i < 10; i++) {
      await sleep(120);
      const buf = await page.screenshot({ clip: box });
      const d = meanDiff(rest, decodePng(buf));
      if (d > maxDiff) {
        maxDiff = d;
        best = buf;
      }
    }
    if (best) fs.writeFileSync(path.join(OUT, `evidence-${label}-speaking.png`), best);
    await page.waitForFunction(() => !window.selfclone.state().speaking, null, { timeout: 20000 });
    await sleep(700);
    const after = await shot(page, box, `evidence-${label}-after.png`);
    const back = meanDiff(rest, after);
    const st = await page.evaluate(() => window.selfclone.state());
    t.diagnostic(`${label}: max mouth diff while speaking ${maxDiff.toFixed(2)}, after ${back.toFixed(2)}, renderer ${st.renderer}`);
    assert.ok(maxDiff > 3, `mouth should change while speaking (max diff ${maxDiff.toFixed(2)})`);
    assert.ok(back < 1, `mouth should return to rest (diff ${back.toFixed(2)})`);
    assert.deepEqual(blocked, []);
    assert.deepEqual(problems.filter((p) => !/AudioContext was not allowed/.test(p)), []);
    return st;
  } finally {
    await page.close();
  }
}

test('audio mode: a speech-like WAV drives the mouth, which returns to rest after', async (t) => {
  const wav = makeWav({ seconds: 1.6 }).toString('base64');
  fs.writeFileSync(path.join(OUT, 'test-tone.wav'), Buffer.from(wav, 'base64'));
  await speechDiffTest(t, '?idle=0&blink=0&tts=0&volume=0', async (page) => {
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      window.selfclone.sayAudio(new Blob([bytes], { type: 'audio/wav' }));
    }, wav);
  }, 'audio');
});

test('text mode: typed text drives visemes, which return to rest after', async (t) => {
  const st = await speechDiffTest(t, '?idle=0&blink=0&volume=0', async (page) => {
    await page.fill('#text', 'Hello there, I am an AI clone. Nice to meet you.');
    await page.click('#sayBtn');
  }, 'text');
  const seen = Object.keys(st.visemesSeen);
  assert.ok(seen.length >= 4, `several visemes used: ${seen.join(', ')}`);
});

test('Canvas2D fallback renders and animates', async (t) => {
  const st = await speechDiffTest(t, '?idle=0&blink=0&tts=0&volume=0&renderer=2d', async (page) => {
    await page.evaluate(() => {
      window.selfclone.say('Open wide, say ah, then oh and ooh.', { tts: false });
    });
  }, 'canvas2d');
  assert.equal(st.renderer, '2d');
});

test('blink changes the eye region and then reopens', async (t) => {
  // The blink lasts about 170 ms (50 ms closing, 30 ms closed, 90 ms reopening). Sampling it with real-time
  // screenshots made this test depend on how fast the machine renders a screenshot, so the page clock is paused
  // and stepped to exact moments instead: fully closed at 60 ms, long reopened at 560 ms.
  const { page } = await openOffline('?idle=0&blink=0&tts=0', { clock: true });
  try {
    await page.clock.pauseAt(5000);
    await page.clock.runFor(100);
    const reg = await page.evaluate(() => window.selfclone.regions());
    const e0 = reg.eyes[0];
    const e1 = reg.eyes[1];
    const box = { x: e0.x, y: Math.min(e0.y, e1.y) - 6, width: e1.x + e1.width - e0.x, height: Math.max(e0.height, e1.height) + 12 };
    const open = await shot(page, box, 'evidence-eyes-open.png');
    await page.evaluate(() => window.selfclone.blink());
    await page.clock.runFor(60);
    const closed = await shot(page, box, 'evidence-eyes-blink.png');
    const d = meanDiff(open, closed);
    await page.clock.runFor(500);
    const reopened = await shot(page, box);
    const back = meanDiff(open, reopened);
    t.diagnostic(`blink diff ${d.toFixed(2)}, after ${back.toFixed(2)}`);
    assert.ok(d > 2, `eyes should change during a blink (${d.toFixed(2)})`);
    assert.ok(back < 0.8, `eyes should reopen (${back.toFixed(2)})`);
  } finally {
    await page.close();
  }
});

test('idle head motion stays within the cap even when pushed', async (t) => {
  const { page } = await openOffline('?blink=0&tts=0&headamp=4');
  try {
    await sleep(3500);
    const st = await page.evaluate(() => window.selfclone.state());
    const caps = await page.evaluate(() => window.selfclone.caps);
    const size = await page.evaluate(() => window.selfclone.regions().canvas.width / window.selfclone.regions().scale);
    t.diagnostic(`max yaw ${st.max.yaw.toFixed(2)}, pitch ${st.max.pitch.toFixed(2)}, roll ${st.max.roll.toFixed(2)}, nose shift ${st.max.noseShift.toFixed(1)} px of ${size}`);
    assert.ok(st.max.yaw <= caps.yaw + 1e-6 && st.max.pitch <= caps.pitch + 1e-6 && st.max.roll <= caps.roll + 1e-6);
    assert.ok(caps.yaw <= 8 && caps.pitch <= 8);
    assert.ok(st.max.yaw > 1, 'the head does move');
    assert.ok(st.max.noseShift < 0.1 * size, 'nose moves less than 10% of the frame');
    await shot(page, await page.evaluate(() => window.selfclone.regions().canvas), 'evidence-head-pushed.png');
  } finally {
    await page.close();
  }
});

test('selfclone serve + say: the open avatar speaks text sent from the CLI side', async (t) => {
  const dir = path.join(OUT, 'serve-ws');
  const srv = await startAvatarServer({ dir, port: 0, open: false, avatar: AVATAR, quiet: true });
  const page = await browser.newPage({ viewport: { width: 560, height: 820 } });
  try {
    await page.goto(`${srv.url}/?idle=0&blink=0&tts=0`);
    await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3);
    for (let i = 0; i < 50 && srv.clients() < 1; i++) await sleep(100);
    const r = await sayText({ dir, text: 'Hello from the command line.' });
    assert.equal(r.clients, 1);
    await page.waitForFunction(() => window.selfclone.state().mode === 'text', null, { timeout: 5000 });
    await page.waitForFunction(() => window.selfclone.state().params.jaw > 0.1, null, { timeout: 5000 });
  } finally {
    await page.close();
    await srv.close();
  }
  assert.ok(!fs.existsSync(path.join(dir, 'serve.json')), 'serve.json is removed on close');
});

test('selfclone serve + say --audio: the open avatar plays audio sent from the CLI side', async () => {
  const dir = path.join(OUT, 'serve-audio-ws');
  const srv = await startAvatarServer({ dir, port: 0, open: false, avatar: AVATAR, quiet: true });
  const page = await browser.newPage({ viewport: { width: 560, height: 820 } });
  const wav = path.join(dir, 'my reply (take 1).wav');
  fs.writeFileSync(wav, makeWav({ seconds: 1.6 }));
  try {
    await page.goto(`${srv.url}/?idle=0&blink=0&tts=0&volume=0`);
    await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3);
    for (let i = 0; i < 50 && srv.clients() < 1; i++) await sleep(100);
    const r = await sayAudio({ dir, file: wav });
    assert.equal(r.clients, 1);
    await page.waitForFunction(() => window.selfclone.state().mode === 'audio', null, { timeout: 5000 });
    await page.waitForFunction(() => window.selfclone.state().params.jaw > 0.1, null, { timeout: 5000 });
  } finally {
    await page.close();
    await srv.close();
  }
});
