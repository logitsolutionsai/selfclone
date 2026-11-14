// selfclone video, end to end: bake the test painting, export a 3-second clip lip-synced to a
// speech-like test waveform, and check the file with ffprobe and by decoding its frames.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bakeFromPhoto } from '../../src/face/bake.mjs';
import { readAvatarData } from '../../src/face/build.mjs';
import { labelCoverage, labelOk } from '../../src/face/video.mjs';
import { VERSION } from '../../src/util.mjs';
import { OUT, ROOT, FIXTURE, makeWav } from './helpers.mjs';

const CLI = path.join(ROOT, 'scripts', 'selfclone.mjs');
const WS = path.join(OUT, 'video-ws');
const AVATAR = path.join(WS, 'avatar.html');
const WAV = path.join(WS, 'voice.wav');
const CONSENT = 'Test fixture: public domain painting, used to test the video export.';
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }).stdout);

/** Decoded RGBA frames by index (the libvpx decoder keeps the alpha plane of a VP9 WebM). */
function frames(file, size, idx, vp9) {
  const sel = idx.map((n) => `eq(n\\,${n})`).join('+');
  const r = spawnSync('ffmpeg', [...(vp9 ? ['-c:v', 'libvpx-vp9'] : []), '-v', 'error', '-i', file, '-vf', `select=${sel}`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, String(r.stderr));
  const n = size * size * 4;
  assert.equal(r.stdout.length, n * idx.length, 'every requested frame decoded');
  return idx.map((_, k) => ({ width: size, height: size, data: r.stdout.subarray(k * n, (k + 1) * n) }));
}

function evidence(file, index, name, vp9) {
  spawnSync('ffmpeg', ['-y', ...(vp9 ? ['-c:v', 'libvpx-vp9'] : []), '-v', 'error', '-i', file, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', path.join(OUT, name)]);
}

let regionAt;
before(async () => {
  fs.rmSync(WS, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  await bakeFromPhoto({ photo: FIXTURE, consent: CONSENT, name: 'Lisa Gherardini (painting)', out: AVATAR });
  fs.writeFileSync(WAV, makeWav({ seconds: 3 }));
  const data = readAvatarData(fs.readFileSync(AVATAR, 'utf8'));
  regionAt = (size, idx, padK) => {
    const k = size / data.size;
    const xs = idx.map((i) => data.landmarks[i][0] * k);
    const ys = idx.map((i) => data.landmarks[i][1] * k);
    const pad = padK * size;
    const x = Math.floor(Math.min(...xs) - pad / 2);
    const y = Math.floor(Math.min(...ys) - pad / 2);
    return { x, y, w: Math.ceil(Math.max(...xs) - x + pad / 2), h: Math.ceil(Math.max(...ys) - y + pad) };
  };
});

test('video: a transparent round WebM at the smallest size, labelled on every frame, tagged, with audio', (t) => {
  const file = path.join(WS, 'pip.webm');
  const r = run(['video', '--audio', WAV, '--avatar', AVATAR, '--size', '240', '-o', file]);
  t.diagnostic(r.stdout.trim());
  assert.equal(r.status, 0, r.stderr);
  const info = probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.codec_name, 'vp9');
  assert.equal(v.width, 240);
  assert.equal(String(v.tags && (v.tags.alpha_mode || v.tags.ALPHA_MODE)), '1', 'the WebM carries an alpha channel');
  assert.ok(a, 'an audio stream is present');
  assert.equal(a.codec_name, 'opus');
  const dur = Number(info.format.duration);
  t.diagnostic(`duration ${dur} s, ${fs.statSync(file).size} bytes`);
  assert.ok(Math.abs(dur - 3) < 0.12, `duration ${dur}`);
  const tags = Object.fromEntries(Object.entries(info.format.tags || {}).map(([k, x]) => [k.toLowerCase(), x]));
  assert.match(tags.comment, /^AI CLONE: this video shows an AI clone made with selfclone/);
  assert.equal(tags.selfclone_consent, CONSENT);
  assert.ok(Number.isFinite(Date.parse(tags.selfclone_consent_date)));
  assert.equal(tags.selfclone_version, VERSION);
  assert.equal(tags.selfclone_ai_generated, 'true');
  // The sidecar holds the same and the hash of the file.
  const prov = JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8'));
  assert.equal(prov.video.sha256, createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  assert.equal(prov.consent.statement, CONSENT);
  assert.equal(prov.tool.version, VERSION);
  assert.equal(prov.comment, tags.comment);
  assert.equal(prov.label.burnedIn, true);
  assert.equal(prov.audio.sha256, createHash('sha256').update(fs.readFileSync(WAV)).digest('hex'));
  // The label: in the first, middle and last frames, over the chin, inside the circle, legible size.
  const n = prov.video.frames;
  assert.equal(n, 90);
  const box = prov.label.box;
  t.diagnostic(`label box ${JSON.stringify(box)}, font ${prov.label.fontPx} px`);
  assert.ok(box.height >= 14 && prov.label.fontPx >= 12, 'legible at 240 px');
  assert.ok(box.y > 0.55 * 240 && box.y + box.height < 0.97 * 240, 'on the lower face, away from the corners');
  assert.ok(Math.abs(box.x + box.width / 2 - 120) < 0.15 * 240, 'centred on the face');
  const [first, mid, last] = frames(file, 240, [0, Math.floor(n / 2), n - 1], true);
  for (const [name, f] of [['first', first], ['middle', mid], ['last', last]]) {
    const c = labelCoverage(f, box);
    t.diagnostic(`${name} frame label: red ${c.red.toFixed(2)}, white ${c.white.toFixed(2)}`);
    assert.ok(labelOk(c), `label in the ${name} frame`);
  }
  // Transparent outside the circle, opaque inside.
  const alpha = (f, x, y) => f.data[(y * 240 + x) * 4 + 3];
  assert.equal(alpha(mid, 3, 3), 0, 'corner is transparent');
  assert.equal(alpha(mid, 236, 236), 0, 'corner is transparent');
  assert.equal(alpha(mid, 120, 100), 255, 'face is opaque');
  // The mouth opens while there is sound. The test waveform is loud from 0.05 to 0.25 s, 0.5 to 0.75 s,
  // 1.0 to 1.25 s and so on, and silent in between: compare a frame late in each silence with a frame in
  // the next burst. The head also nods while talking, so the measure is the number of dark pixels (the
  // opening) inside a generous box around the lips, which a small shift of the face does not change.
  const pairs = [[13, 20], [28, 35], [43, 50]];
  const got = frames(file, 240, pairs.flat(), true);
  const m = regionAt(240, [61, 291, 0, 17, 37, 267, 84, 314, 13, 14], 0.1);
  const dark = (f) => {
    let c = 0;
    for (let y = m.y; y < m.y + m.h; y++) {
      for (let x = m.x; x < m.x + m.w; x++) {
        const o = (y * 240 + x) * 4;
        if (0.299 * f.data[o] + 0.587 * f.data[o + 1] + 0.114 * f.data[o + 2] < 60) c++;
      }
    }
    return c;
  };
  const counts = pairs.map((_, k) => [dark(got[2 * k]), dark(got[2 * k + 1])]);
  t.diagnostic(`dark mouth pixels, silence then sound: ${counts.map((c) => c.join(' -> ')).join(', ')}`);
  // (The painting has dark shadows at the corners of the mouth, so a closed mouth is not zero.)
  for (const [quiet, loud] of counts) assert.ok(loud >= quiet + 30 && loud > 1.5 * quiet, `the mouth opens with the sound (${quiet} -> ${loud})`);
  evidence(file, 0, 'evidence-video-first.png', true);
  evidence(file, 19, 'evidence-video-speaking.png', true);
});

test('video: an MP4 with a solid background, square, tagged, labelled', (t) => {
  const file = path.join(WS, 'pip.mp4');
  const r = run(['video', '--audio', WAV, '--avatar', AVATAR, '--size', '320', '--shape', 'square', '--background', '#1e1e1e', '-o', file]);
  assert.equal(r.status, 0, r.stderr);
  const info = probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.ok(info.streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac'));
  assert.ok(Math.abs(Number(info.format.duration) - 3) < 0.12, `duration ${info.format.duration}`);
  const tags = Object.fromEntries(Object.entries(info.format.tags || {}).map(([k, x]) => [k.toLowerCase(), x]));
  assert.match(tags.comment, /AI clone made with selfclone/);
  assert.equal(tags.selfclone_consent, CONSENT);
  assert.equal(tags.selfclone_version, VERSION);
  const prov = JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8'));
  const [mid] = frames(file, 320, [45], false);
  assert.ok(labelOk(labelCoverage(mid, prov.label.box)), 'label in the middle frame');
  evidence(file, 45, 'evidence-video-mp4.png', false);
  t.diagnostic(`mp4 ${fs.statSync(file).size} bytes`);
});

test('video refuses a face whose consent does not match it, and audio over the length cap', () => {
  const html = fs.readFileSync(AVATAR, 'utf8');
  const tampered = path.join(WS, 'tampered.html');
  fs.writeFileSync(tampered, html.replace(/"photoSha256":"[0-9a-f]{64}"/, `"photoSha256":"${'0'.repeat(64)}"`));
  const out = path.join(WS, 'refused.webm');
  const r1 = run(['video', '--audio', WAV, '--avatar', tampered, '-o', out]);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /consent record does not match the face/);
  const r2 = run(['video', '--audio', WAV, '--avatar', AVATAR, '--max-minutes', '0.02', '-o', out]);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /the limit is 0.02 minutes/);
  assert.ok(!fs.existsSync(out) && !fs.existsSync(`${out}.provenance.json`), 'nothing written');
});
