// selfclone studio, end to end: a character from the test painting, then a short two-scene explainer
// narrated by a speech-like test waveform (--audio, so no voice model is needed), checked with ffprobe
// and by decoding its frames.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkCharacter } from '../../src/studio/character.mjs';
import { countFrames } from '../../src/studio/explainer.mjs';
import { OUT, ROOT, FIXTURE, makeWav } from './helpers.mjs';

const CLI = path.join(ROOT, 'scripts', 'selfclone.mjs');
const WS = path.join(OUT, 'studio-ws');
const CONSENT = 'Test fixture: public domain painting, used to test the explainer.';
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }).stdout);

before(() => {
  fs.rmSync(WS, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
  fs.writeFileSync(path.join(WS, 'voice.wav'), makeWav({ seconds: 4 }));
});

test('character: refuses without consent, then draws one from the painting with a preview sheet', (t) => {
  const refused = run(['character', '--photo', FIXTURE, '--dir', WS]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /without consent/);
  const r = run(['character', '--photo', FIXTURE, '--consent', CONSENT, '--name', 'Lisa Gherardini (painting)', '--hair', 'long', '--dir', WS]);
  t.diagnostic(r.stdout.trim());
  assert.equal(r.status, 0, r.stderr);
  const c = checkCharacter(JSON.parse(fs.readFileSync(path.join(WS, 'character.json'), 'utf8')));
  assert.equal(c.hairStyle, 'long');
  assert.equal(c.consent.statement, CONSENT);
  assert.match(c.consent.sourceSha256, /^[0-9a-f]{64}$/);
  assert.ok(fs.statSync(path.join(WS, 'character.png')).size > 10000, 'preview sheet written');
  fs.copyFileSync(path.join(WS, 'character.png'), path.join(OUT, 'studio-character.png'));
});

test('explainer: two scenes, every frame encoded, captions, audio, no sidecar', (t) => {
  const scenes = {
    title: 'Test explainer',
    character: 'character.json',
    scenes: [
      { say: ['Hello there.', 'This is a test.'], background: '#7fb6d6', items: [{ text: '1503', x: 0.2, y: 0.2, line: 1 }] },
      { say: 'Scene two has a prop.', character: { x: 0.25, pose: 'point', scale: 0.8 }, transition: 'fade', items: [{ svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#e2604f" stroke="#2a2346"/></svg>', x: 0.7, y: 0.5, w: 0.2, at: 0.2 }] },
    ],
  };
  const sf = path.join(WS, 'scenes.json');
  fs.writeFileSync(sf, JSON.stringify(scenes));
  const file = path.join(WS, 'test.mp4');
  const r = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--width', '640', '--height', '360', '--out', file, '--dir', WS]);
  t.diagnostic(r.stdout.trim());
  assert.equal(r.status, 0, r.stderr);
  const info = probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'), 'has audio');
  assert.equal(v.width, 640);
  assert.equal(v.height, 360);
  assert.ok(Math.abs(Number(info.format.duration) - 4) < 0.2, `about 4 s, got ${info.format.duration}`);
  assert.match(info.format.tags.comment, /^Made with selfclone \d/);
  assert.ok(!Object.keys(info.format.tags).some((k) => /ai_generated|label|consent/i.test(k)), 'no AI, label or consent tags');
  assert.ok(!fs.existsSync(`${file}.provenance.json`), 'no sidecar file');
  assert.equal(countFrames(file), 96);
  const srt = fs.readFileSync(file.replace(/\.mp4$/, '.srt'), 'utf8');
  // Aligned to the test waveform's bursts: the first line starts where the sound does.
  assert.match(srt, /^1\n00:00:00,0[0-9]{2} --> .*\nHello there\./);
  assert.equal((srt.match(/-->/g) || []).length, 3);
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', '3', '-i', file, '-frames:v', '1', path.join(OUT, 'studio-frame.png')]);
});

test('explainer: gestures, drawn items, transitions, sound effects and music ducked under the voice', (t) => {
  const music = path.join(WS, 'music.wav');
  const g = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-filter_complex', 'amix=inputs=2', music]);
  assert.equal(g.status, 0, String(g.stderr));
  const box = '<svg viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" fill="#f2c14b" stroke="#2a2346" stroke-width="2"/></svg>';
  const scenes = {
    title: 'Motion test',
    character: 'character.json',
    scenes: [
      { say: ['Hello there.', 'Look at this.'], character: { enter: 'rise', cues: [{ line: 0, gesture: 'wave', mood: 'happy' }] }, items: [{ svg: box, x: 0.8, y: 0.4, w: 0.15, line: 1, enter: 'draw', loop: 'float', exit: { at: 1.2, anim: 'pop' } }] },
      { say: 'A second scene.', transition: 'push', character: { x: 0.3, y: 0.96, scale: 0.8, cues: [{ at: 0.2, gesture: 'shrug-left', mood: 'curious' }] }, items: [{ text: 'move', x: 0.6, y: 0.3, move: { x: 0.8, at: 0.5 } }] },
    ],
  };
  const sf = path.join(WS, 'motion.json');
  fs.writeFileSync(sf, JSON.stringify(scenes));
  const file = path.join(WS, 'motion.mp4');
  const r = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--music', music, '--width', '640', '--height', '360', '--out', file, '--dir', WS]);
  t.diagnostic(r.stdout.trim());
  assert.equal(r.status, 0, r.stderr);
  const info = probe(file);
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'), 'has audio');
  assert.ok(Math.abs(Number(info.format.duration) - 4) < 0.2, `about 4 s, got ${info.format.duration}`);
  assert.equal(countFrames(file), 96);
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', 'fps=4,scale=320:180,tile=4x4', '-frames:v', '1', path.join(OUT, 'studio-motion.png')]);
});

test('explainer: random fictional cast in dialogue, a full-body walk, chart, prop, bubble; preview stills', (t) => {
  const scenes = {
    title: 'Cast test',
    cast: { host: { character: 'random:one' }, guest: { character: 'random:two', body: 'full' } },
    scenes: [
      { say: ['Hello there.', { who: 'guest', text: 'Is this a chart?' }], characters: { host: { x: 0.25 }, guest: { x: 0.78, enter: 'walk-right' } },
        items: [{ chart: { type: 'bar', values: [1, 3, 2] }, x: 0.52, y: 0.55, w: 0.3 }, { bubble: 'Hm?', who: 'guest', line: 1 }, { prop: 'lightbulb', x: 0.5, y: 0.2, w: 0.08 }] },
    ],
  };
  const sf = path.join(WS, 'cast.json');
  fs.writeFileSync(sf, JSON.stringify(scenes));
  const file = path.join(WS, 'cast.mp4');
  const pre = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--width', '640', '--height', '360', '--out', file, '--dir', WS, '--preview']);
  assert.equal(pre.status, 0, pre.stderr);
  assert.ok(fs.statSync(file.replace(/\.mp4$/, '.preview.png')).size > 20000, 'preview sheet');
  const r = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--width', '640', '--height', '360', '--out', file, '--dir', WS, '--workers', '2']);
  t.diagnostic(r.stdout.trim());
  assert.equal(r.status, 0, r.stderr);
  assert.equal(countFrames(file), 96);
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', 'fps=4,scale=320:180,tile=4x4', '-frames:v', '1', path.join(OUT, 'studio-cast.png')]);
  // The interactive player: one self-contained page with the sound and chapters.
  const h = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--width', '640', '--height', '360', '--out', file, '--dir', WS, '--html']);
  assert.equal(h.status, 0, h.stderr);
  const page = fs.readFileSync(file.replace(/\.mp4$/, '.html'), 'utf8');
  assert.ok(page.includes('<audio id="snd"') && page.includes('data:audio/mp4;base64,') && page.includes('class="ch"'));
  // The same file with nobody on screen.
  const none = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--width', '640', '--height', '360', '--out', path.join(WS, 'nohost.mp4'), '--dir', WS, '--no-host']);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(countFrames(path.join(WS, 'nohost.mp4')), 96);
});

test('explainer: a Manim scene with LaTeX, when Manim is installed', async (t) => {
  const { findManim } = await import('../../src/studio/manim.mjs');
  if (!findManim()) {
    t.skip('Manim is not installed');
    return;
  }
  const scenes = { title: 'Manim test', scenes: [{ say: 'E equals m c squared.', background: '#f2ead6', manim: { code: 'class E(Scene):\n    def construct(self):\n        self.play(Write(MathTex(r"E = mc^2", color=INK).scale(2)), run_time=1)\n' } }] };
  const sf = path.join(WS, 'manim.json');
  fs.writeFileSync(sf, JSON.stringify(scenes));
  const file = path.join(WS, 'manim.mp4');
  const r = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--width', '640', '--height', '360', '--out', file, '--dir', WS]);
  t.diagnostic(r.stdout.trim());
  assert.equal(r.status, 0, r.stderr);
  // The equation is drawn in dark ink in the middle of the frame by the end.
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', '3', '-i', file, '-frames:v', '1', path.join(OUT, 'studio-manim.png')]);
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-ss', '3', '-i', file, '-frames:v', '1', '-vf', 'crop=320:120:160:120', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 24 }).stdout;
  const dark = [...raw].filter((v) => v < 90).length / raw.length;
  assert.ok(dark > 0.01, `ink in the middle (${dark})`);
});

test('explainer refuses unsafe scene drawings and a character without consent', () => {
  const sf = path.join(WS, 'bad.json');
  fs.writeFileSync(sf, JSON.stringify({ character: 'character.json', scenes: [{ say: 'Hi.', items: [{ svg: '<svg viewBox="0 0 1 1"><script>x()</script></svg>' }] }] }));
  const r = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--dir', WS]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /only plain drawing/);
  const c = JSON.parse(fs.readFileSync(path.join(WS, 'character.json'), 'utf8'));
  delete c.consent;
  fs.writeFileSync(path.join(WS, 'noconsent.json'), JSON.stringify(c));
  fs.writeFileSync(sf, JSON.stringify({ character: 'noconsent.json', scenes: [{ say: 'Hi.' }] }));
  const r2 = run(['explainer', sf, '--audio', path.join(WS, 'voice.wav'), '--dir', WS]);
  assert.notEqual(r2.status, 0);
  assert.match(r2.stderr, /no consent record/);
});
