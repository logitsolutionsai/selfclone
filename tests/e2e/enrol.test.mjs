// Webcam enrolment, end to end, with Chrome's fake camera fed by the fixture
// painting (converted to a .y4m clip with ffmpeg). Skips if ffmpeg is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchChrome } from '../../src/face/chrome.mjs';
import { startEnrolServer } from '../../src/face/server.mjs';
import { OUT, FIXTURE } from './helpers.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

test('webcam enrolment: checks, consent gate, bake and save', { skip: hasFfmpeg ? false : 'ffmpeg not installed' }, async (t) => {
  const y4m = path.join(OUT, 'fake-camera.y4m');
  if (!fs.existsSync(y4m)) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', FIXTURE, '-t', '1', '-r', '5', '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2', '-pix_fmt', 'yuv420p', y4m]);
    assert.equal(r.status, 0, 'ffmpeg made the fake camera clip');
  }
  const dir = path.join(OUT, 'enrol-ws');
  fs.rmSync(dir, { recursive: true, force: true });
  const srv = await startEnrolServer({ dir, port: 0, open: false, quiet: true });
  const browser = await launchChrome({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--mute-audio'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${srv.url}/`);
    await page.waitForFunction(() => window.__enrolReady === true);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('captureBtn').disabled, null, { timeout: 120000 });
    const checks = await page.evaluate(() => [...document.querySelectorAll('#checks li')].map((li) => `${li.className}:${li.textContent}`));
    t.diagnostic(`live checks: ${checks.join(' | ')}`);
    assert.ok(checks[0].startsWith('ok:'), 'exactly one face found');
    await page.screenshot({ path: path.join(OUT, 'evidence-enrol-checks.png') });
    await page.click('#captureBtn');
    await page.waitForSelector('#step2:not([hidden])');
    assert.equal(await page.isDisabled('#bakeBtn'), true, 'bake is disabled until consent');
    await page.check('#agree');
    assert.equal(await page.isDisabled('#bakeBtn'), true, 'still disabled without a typed name');
    await page.fill('#fullName', 'Lisa Gherardini');
    assert.equal(await page.isDisabled('#bakeBtn'), false);
    await page.click('#bakeBtn');
    await page.waitForFunction(() => window.__enrolDone, null, { timeout: 30000 });
    const saved = path.join(dir, 'avatar.html');
    assert.ok(fs.existsSync(saved));
    const html = fs.readFileSync(saved, 'utf8');
    const data = JSON.parse(html.match(/<script id="selfclone-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.consent.name, 'Lisa Gherardini');
    assert.equal(data.consent.method, 'webcam');
    assert.equal(data.landmarks.length, 478);
    assert.deepEqual(errors, []);
    // The server refuses a bake without consent.
    const res = await fetch(`${srv.url}/api/bake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bake: {}, consent: { agreed: false } }) });
    assert.equal(res.status, 400);
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('enrolment turns the camera off again when the face model cannot load', async () => {
  const dir = path.join(OUT, 'enrol-modelfail-ws');
  const srv = await startEnrolServer({ dir, port: 0, open: false, quiet: true });
  // Chrome's built-in fake camera (a test pattern) is enough: the model download is made to fail.
  const browser = await launchChrome({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.route('**/mp/**', (r) => r.fulfill({ status: 502, body: 'offline' }));
    await page.goto(`${srv.url}/`);
    await page.waitForFunction(() => window.__enrolReady === true);
    await page.click('#startBtn');
    await page.waitForFunction(() => document.getElementById('msg1').className.includes('err'), null, { timeout: 30000 });
    const st = await page.evaluate(() => ({
      msg: document.getElementById('msg1').textContent,
      live: !!(document.getElementById('video').srcObject && document.getElementById('video').srcObject.getTracks().some((t) => t.readyState === 'live')),
      start: document.getElementById('startBtn').disabled,
    }));
    assert.match(st.msg, /could not start/);
    assert.equal(st.live, false, 'the camera is released');
    assert.equal(st.start, false, 'the user can try again');
  } finally {
    await browser.close();
    await srv.close();
  }
});

test('webcam clip enrolment: countdown, phrase, in-memory recording, patches and a clip consent record', { skip: hasFfmpeg ? false : 'ffmpeg not installed' }, async (t) => {
  // The fake camera plays the synthetic clip (the painting reading the phrase and blinking).
  const y4m = path.join(OUT, 'fake-camera-clip.y4m');
  if (!fs.existsSync(y4m)) {
    const clip = path.join(path.dirname(FIXTURE), 'mona-lisa-clip.webm');
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip, '-pix_fmt', 'yuv420p', y4m]);
    assert.equal(r.status, 0, 'ffmpeg made the fake camera clip');
  }
  const dir = path.join(OUT, 'enrol-clip-ws');
  fs.rmSync(dir, { recursive: true, force: true });
  const srv = await startEnrolServer({ dir, port: 0, open: false, quiet: true });
  const browser = await launchChrome({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--mute-audio'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 1300 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Count any attempt to record the camera to a file: there must be none.
    await page.addInitScript(() => {
      window.__recorders = 0;
      const MR = window.MediaRecorder;
      if (MR) {
        window.MediaRecorder = function (...a) {
          window.__recorders++;
          return new MR(...a);
        };
      }
    });
    await page.goto(`${srv.url}/`);
    await page.waitForFunction(() => window.__enrolReady === true);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('clipBtn').disabled, null, { timeout: 120000 });
    await page.click('#clipBtn');
    await page.waitForSelector('#countdown:not([hidden])');
    assert.match(await page.textContent('#phrase'), /why would you move a big cheap boat/);
    await page.waitForSelector('#recBadge:not([hidden])', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'evidence-enrol-clip-recording.png') });
    await page.waitForSelector('#step2:not([hidden])', { timeout: 60000 });
    const summary = await page.textContent('#clipSummary');
    t.diagnostic(summary);
    assert.match(summary, /frames/);
    assert.match(summary, /not saved/);
    assert.equal(await page.evaluate(() => window.__recorders), 0, 'no MediaRecorder: the clip is never recorded to a file');
    assert.equal(await page.isDisabled('#bakeBtn'), true, 'bake is disabled until consent');
    await page.check('#agree');
    await page.fill('#fullName', 'Lisa Gherardini');
    await page.click('#bakeBtn');
    await page.waitForFunction(() => window.__enrolDone, null, { timeout: 30000 });
    const html = fs.readFileSync(path.join(dir, 'avatar.html'), 'utf8');
    const data = JSON.parse(html.match(/<script id="selfclone-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.consent.method, 'clip');
    assert.ok(Object.keys(data.clip.shapes).length >= 1, `mouth patches: ${Object.keys(data.clip.shapes).join(', ')}`);
    assert.equal(data.clip.source, 'clip');
    assert.deepEqual(errors, []);
    assert.deepEqual(fs.readdirSync(dir), ['avatar.html'], 'nothing but the avatar is written');
  } finally {
    await browser.close();
    await srv.close();
  }
});
