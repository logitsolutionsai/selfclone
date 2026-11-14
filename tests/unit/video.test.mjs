// selfclone video: the argument checks and safeguards that need no browser or ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkVideoArgs, checkConsent, checkLength, labelCoverage, labelOk, provenanceComment, VIDEO_LIMITS } from '../../src/face/video.mjs';
import { readAvatarData, buildAvatarHtml } from '../../src/face/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', '..', 'scripts', 'selfclone.mjs');
const fx = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'mona-lisa-landmarks.json'), 'utf8'));
const image = 'data:image/jpeg;base64,' + Buffer.from('a face, for the test').toString('base64');
const goodData = () => readAvatarData(buildAvatarHtml({
  bake: { size: fx.size, image, landmarks: fx.landmarks },
  consent: { name: 'Test Person', statement: 'This is my own face. Test Person', method: 'photo' },
}).html);

test('video refuses to run without your own audio, and never takes text', () => {
  assert.throws(() => checkVideoArgs({ _: [] }), /without your own audio/);
  assert.throws(() => checkVideoArgs({ _: [], audio: true }), /without your own audio/);
  assert.throws(() => checkVideoArgs({ _: ['hello there'], audio: 'v.wav' }), /does not turn text into speech/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', text: 'hello' }), /does not turn text into speech/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', say: 'hello' }), /does not turn text into speech/);
});

test('video options: defaults, size range, shape, background and output format', () => {
  const d = checkVideoArgs({ _: [], audio: 'v.wav' }, { dir: 'ws' });
  assert.deepEqual(
    { size: d.size, fps: d.fps, shape: d.shape, background: d.background, transparent: d.transparent, maxMinutes: d.maxMinutes, format: d.format },
    { size: 480, fps: 30, shape: 'circle', background: 'transparent', transparent: true, maxMinutes: 10, format: 'webm' },
  );
  assert.equal(d.out, path.join('ws', 'avatar-video.webm'));
  assert.equal(d.avatar, path.join('ws', 'avatar.html'));
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', size: '240' }).size, VIDEO_LIMITS.minSize);
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', size: '1080' }).size, 1080);
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', size: '481' }).size % 2, 0, 'even sizes for the encoder');
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', size: '239' }), /--size must be a number from 240 to 1080/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', size: '1081' }), /--size/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', size: 'big' }), /--size/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', shape: 'star' }), /--shape must be circle or square/);
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', shape: 'square' }).shape, 'square');
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', background: 'red' }), /--background must be transparent or a colour/);
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', background: '#0f0' }).background, '#00ff00');
  const mp4 = checkVideoArgs({ _: [], audio: 'v.wav', background: '#1e1e1e' }, { dir: 'ws' });
  assert.equal(mp4.out, path.join('ws', 'avatar-video.mp4'));
  assert.equal(mp4.format, 'mp4');
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', out: 'a.mp4' }), /MP4 cannot be transparent/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', out: 'a.mp4', background: 'transparent' }), /MP4 cannot be transparent/);
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', out: 'a.mp4', background: '#000000' }).format, 'mp4');
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', out: 'a.gif' }), /\.webm .* or \.mp4/);
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', out: 'x/a.webm', background: '#123456' }).transparent, false);
});

test('video length cap: 10 minutes by default, configurable up to 60, never unlimited', () => {
  assert.equal(checkVideoArgs({ _: [], audio: 'v.wav', maxMinutes: '2' }).maxMinutes, 2);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', maxMinutes: '61' }), /--max-minutes must be a number from 0.01 to 60/);
  assert.throws(() => checkVideoArgs({ _: [], audio: 'v.wav', maxMinutes: '0' }), /--max-minutes/);
  assert.doesNotThrow(() => checkLength(600, 10));
  assert.throws(() => checkLength(601, 10), /10\.0 minutes long; the limit is 10 minutes/);
  assert.throws(() => checkLength(3, 0.02), /the limit is 0.02 minutes/);
  assert.throws(() => checkLength(0, 10), /zero length/);
});

test('video consent check: needs a record, a statement, a date, and the hash of this face', () => {
  const ok = checkConsent(goodData());
  assert.equal(ok.statement, 'This is my own face. Test Person');
  assert.equal(ok.name, 'Test Person');
  assert.equal(ok.photoSha256, createHash('sha256').update(Buffer.from('a face, for the test')).digest('hex'));
  const without = goodData();
  delete without.consent;
  assert.throws(() => checkConsent(without), /no consent record/);
  const blank = goodData();
  blank.consent.statement = '  ';
  assert.throws(() => checkConsent(blank), /no consent statement/);
  const undated = goodData();
  undated.consent.date = 'someday';
  assert.throws(() => checkConsent(undated), /no valid date/);
  // Consent baked for one face does not cover another: swapping the photo breaks the hash.
  const swapped = goodData();
  swapped.image = 'data:image/jpeg;base64,' + Buffer.from('somebody else').toString('base64');
  assert.throws(() => checkConsent(swapped), /does not match the face/);
  const noHash = goodData();
  delete noHash.consent.photoSha256;
  assert.throws(() => checkConsent(noHash), /does not match the face/);
  assert.throws(() => readAvatarData('<html>not an avatar</html>'), /not a selfclone avatar/);
});

test('provenance comment names the tool, says it is an AI clone, and quotes the consent', () => {
  const c = provenanceComment({ statement: 'This is my own face. Test Person', date: '2026-11-14T09:00:00.000Z' });
  assert.match(c, /^AI CLONE: /);
  assert.match(c, /made with selfclone \d+\.\d+\.\d+/);
  assert.match(c, /not a recording of the person/);
  assert.match(c, /"This is my own face\. Test Person" \(2026-11-14\)/);
});

test('label check: finds the red label with white lettering, and nothing in its place', () => {
  const w = 40;
  const h = 20;
  const img = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  const fill = (fn) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set([...fn(x, y), 255], (y * w + x) * 4);
  };
  fill((x, y) => (y > 6 && y < 13 && x % 4 === 0 ? [255, 255, 255] : [217, 45, 32]));
  assert.ok(labelOk(labelCoverage(img, { x: 0, y: 0, width: w, height: h })));
  fill(() => [190, 150, 90]); // skin, no label
  assert.ok(!labelOk(labelCoverage(img, { x: 0, y: 0, width: w, height: h })));
  fill(() => [217, 45, 32]); // a red box with no lettering is not a label
  assert.ok(!labelOk(labelCoverage(img, { x: 0, y: 0, width: w, height: h })));
});

test('CLI: selfclone video refuses without --audio, with text, and without a consented avatar', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-video-'));
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  const r1 = run(['video']);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /without your own audio/);
  const r2 = run(['video', 'say this for me', '--audio', 'v.wav']);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /does not turn text into speech/);
  fs.writeFileSync(path.join(cwd, 'v.wav'), 'not really audio');
  const r3 = run(['video', '--audio', 'v.wav']);
  assert.equal(r3.status, 1);
  assert.match(r3.stderr, /No avatar at/);
  const data = goodData();
  delete data.consent;
  fs.mkdirSync(path.join(cwd, '.selfclone'));
  fs.writeFileSync(path.join(cwd, '.selfclone', 'avatar.html'), `<script id="selfclone-data" type="application/json">${JSON.stringify(data)}</script>`);
  const r4 = run(['video', '--audio', 'v.wav', '-o', 'talk.webm']);
  assert.equal(r4.status, 1);
  assert.match(r4.stderr, /no consent record/);
  assert.ok(!fs.existsSync(path.join(cwd, 'talk.webm')));
  const r5 = run(['video', '--audio', 'v.wav', '-o', 'talk.mp4']);
  assert.match(r5.stderr, /MP4 cannot be transparent/);
});
