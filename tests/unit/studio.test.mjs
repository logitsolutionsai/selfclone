// selfclone studio: the drawn character, narration assembly, scene checks, lip-sync and blink tracks.
// No browser, no voice model and no ffmpeg needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { characterFromFace, characterSvg, checkCharacter, sampleDisc, MOUTHS, GESTURES, MOOD_FACES, MOODS, HAIR_STYLES } from '../../src/studio/character.mjs';
import { splitSentences, parseVoice, assemble, proportionalTimings, wavBytes, trimSilence, SR } from '../../src/studio/speech.mjs';
import { checkScenes, buildTimeline, mouthTrack, blinkTrack, emphasisTrack, srt, explainerHtml, encodeArgs } from '../../src/studio/explainer.mjs';
import * as sfxModule from '../../src/studio/sfx.mjs';
const { sfxEvents, synthSfx, mixSfx } = sfxModule;
import { sheetHtml } from '../../src/studio/page.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'mona-lisa-landmarks.json'), 'utf8'));

// A synthetic photo: grey background, a warm face oval, darker hair above it, red lips.
function synthImage({ grey = false } = {}) {
  const width = fx.size;
  const height = fx.size;
  const data = Buffer.alloc(width * height * 3);
  const lm = fx.landmarks;
  const top = lm[10];
  const chin = lm[152];
  const cx = (lm[234][0] + lm[454][0]) / 2;
  const rx = Math.abs(lm[454][0] - lm[234][0]) / 2;
  const cy = (top[1] + chin[1]) / 2;
  const ry = (chin[1] - top[1]) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = [90, 110, 130];
      if (((x - cx) / (rx * 1.25)) ** 2 + ((y - cy + ry * 0.35) / (ry * 1.1)) ** 2 < 1 && y < top[1] + ry * 0.05) c = [70, 45, 30];
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) c = [225, 180, 150];
      if (Math.abs(y - (lm[13][1] + lm[14][1]) / 2) < 7 && Math.abs(x - lm[13][0]) < 22) c = [180, 70, 80];
      if (grey) c = c.map(() => Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]));
      data.set(c, (y * width + x) * 3);
    }
  }
  return { width, height, data };
}

const consent = { name: 'Test', statement: 'Test fixture: public domain painting', date: '2026-11-16T00:00:00.000Z', method: 'photo' };

test('character from face: proportions in range, colours from the photo, defaults for the rest', () => {
  const c = characterFromFace({ landmarks: fx.landmarks, size: fx.size, checks: {} }, synthImage(), { hairStyle: 'bun' });
  assert.equal(c.version, 1);
  assert.equal(c.hairStyle, 'bun');
  assert.equal(c.facialHair, 'none');
  assert.equal(c.glasses, false);
  assert.equal(c.source.grey, false);
  for (const v of Object.values(c.colors)) assert.match(v, /^#[0-9a-f]{6}$/);
  // The skin is warm (red above blue) and the hair is darker than the skin.
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [sr, , sb] = rgb(c.colors.skin);
  assert.ok(sr > sb, `skin ${c.colors.skin} should be warm`);
  const lum = (h) => rgb(h).reduce((a, b) => a + b, 0);
  assert.ok(lum(c.colors.hair) < lum(c.colors.skin), 'hair darker than skin');
  for (const [k, v] of Object.entries(c.face)) assert.ok(Number.isFinite(v), k);
  checkCharacter({ ...c, consent });
});

test('character from a black and white photo keeps the lightness and picks a skin tone', () => {
  const c = characterFromFace({ landmarks: fx.landmarks, size: fx.size, checks: { glassesLikely: true } }, synthImage({ grey: true }));
  assert.equal(c.source.grey, true);
  assert.equal(c.glasses, true);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.colors.skin.slice(i, i + 2), 16));
  assert.ok(r > g && g > b, 'a skin tone from the ramp, not grey');
  const [hr, hg, hb] = [1, 3, 5].map((i) => parseInt(c.colors.hair.slice(i, i + 2), 16));
  assert.ok(Math.abs(hr - hb) < 20 && Math.abs(hr - hg) < 20, 'grey hair stays grey');
});

test('sampleDisc takes the median, ignoring a few outliers', () => {
  const img = { width: 10, height: 10, data: Buffer.alloc(300, 100) };
  img.data.set([255, 255, 255], (5 * 10 + 5) * 3);
  assert.deepEqual(sampleDisc(img, 5, 5, 2), [100, 100, 100]);
  assert.equal(sampleDisc(img, -50, -50, 2), null);
});

test('character SVG has every mouth, both eye states and every pose, with ids unique per instance', () => {
  const base = characterFromFace({ landmarks: fx.landmarks, size: fx.size, checks: {} }, synthImage());
  for (const hairStyle of HAIR_STYLES) {
    for (const facialHair of ['none', 'beard']) {
      const svg = characterSvg({ ...base, hairStyle, facialHair, glasses: true }, { id: 'x1' });
      assert.match(svg, /^<svg [^>]*viewBox="0 0 600 720"/);
      for (const m of MOUTHS) assert.ok(svg.includes(`id="x1-mouth-${m}"`), m);
      for (const id of ['eyes-open', 'eyes-half', 'eyes-closed', 'head', 'face', 'hairfront', 'body', 'arms', 'browR', 'browL', 'armRt', 'armLt', 'foreRt', 'foreLt']) {
        assert.ok(svg.includes(`id="x1-${id}"`), id);
      }
      for (const k of ['Rt', 'Lt']) for (const h of ['rest', 'open', 'point']) assert.ok(svg.includes(`id="x1-hand${k}-${h}"`), `${k} ${h}`);
      assert.ok(!/NaN|undefined/.test(svg), `${hairStyle}/${facialHair} draws only numbers`);
      // clip paths are prefixed, so two characters on one page do not share ids
      for (const [, id] of svg.matchAll(/clipPath id="([^"]+)"/g)) assert.ok(id.startsWith('x1-'), id);
    }
  }
  // Only the rest mouth, the open eyes and the idle pose are shown by default.
  const svg = characterSvg(base);
  assert.equal((svg.match(/class="mouth"[^>]*display="none"/g) || []).length, MOUTHS.length - 1);
});

test('checkCharacter requires consent and valid fields', () => {
  const c = characterFromFace({ landmarks: fx.landmarks, size: fx.size, checks: {} }, synthImage());
  assert.throws(() => checkCharacter(c), /no consent record/);
  assert.throws(() => checkCharacter({ ...c, consent, hairStyle: 'mohawk' }), /hairStyle/);
  assert.throws(() => checkCharacter({ ...c, consent, colors: { ...c.colors, skin: 'red' } }), /colors.skin/);
  assert.throws(() => checkCharacter({ ...c, consent, face: { ...c.face, aspect: 3 } }), /face.aspect/);
});

test('voices: kokoro by default, providers parsed, unknown ones refused', () => {
  assert.deepEqual(parseVoice(), { provider: 'kokoro', voice: 'af_heart' });
  assert.deepEqual(parseVoice('kokoro:bf_emma'), { provider: 'kokoro', voice: 'bf_emma' });
  assert.deepEqual(parseVoice('openai'), { provider: 'openai', voice: 'alloy' });
  assert.deepEqual(parseVoice('elevenlabs:abc123'), { provider: 'elevenlabs', voice: 'abc123' });
  assert.throws(() => parseVoice('elevenlabs'), /voice id/);
  assert.throws(() => parseVoice('acme:bob'), /Unknown voice provider/);
});

test('sentences split on end punctuation, not on abbreviations in lower case', () => {
  assert.deepEqual(splitSentences('One. Two!  Three? four e.g. five.'), ['One.', 'Two!', 'Three? four e.g. five.']);
  assert.deepEqual(splitSentences('   '), []);
});

test('assemble: lead, pauses and tail; exact line marks; holds extend the scene', () => {
  const tone = (s) => new Float32Array(Math.round(s * SR)).fill(0.5);
  const a = assemble([[tone(1), tone(0.5)], [tone(2)]], { gaps: { lead: 0.25, line: 0.5, tail: 0.25 }, holds: [0, 1] });
  assert.equal(a.scenes.length, 2);
  assert.deepEqual(a.scenes[0].lines.map((l) => [l.start, l.end]), [[0.25, 1.25], [1.75, 2.25]]);
  assert.equal(a.scenes[0].end, 2.5);
  assert.equal(a.scenes[1].start, 2.5);
  assert.deepEqual([a.scenes[1].lines[0].start, a.scenes[1].lines[0].end], [2.75, 4.75]);
  assert.equal(a.seconds, 6);
  assert.equal(a.samples.length, 6 * SR);
  assert.equal(a.samples[Math.round(0.1 * SR)], 0);
  assert.equal(a.samples[Math.round(0.5 * SR)], 0.5);
});

test('recorded narration: timings proportional to text, covering the whole file', () => {
  const t = proportionalTimings([['aaaa', 'aaaa'], ['aaaaaaaa']], 16);
  assert.deepEqual(t.map((s) => [s.start, s.end]), [[0, 8], [8, 16]]);
  assert.deepEqual(t[0].lines.map((l) => [l.start, l.end]), [[0, 4], [4, 8]]);
});

test('WAV: 16-bit mono header and samples; silence trimmed at the ends', () => {
  const b = wavBytes(new Float32Array([0, 1, -1, 0.5]), 24000);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.readUInt32LE(24), 24000);
  assert.equal(b.readUInt16LE(22), 1);
  assert.equal(b.readUInt32LE(40), 8);
  assert.deepEqual([b.readInt16LE(44), b.readInt16LE(46), b.readInt16LE(48)], [0, 32767, -32767]);
  const x = new Float32Array(SR).fill(0);
  x.fill(0.3, SR * 0.4, SR * 0.6);
  const y = trimSilence(x);
  assert.ok(y.length < SR * 0.35 && y.length > SR * 0.2, String(y.length));
});

const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
const scene = (extra = {}) => ({ character: 'random', scenes: [{ say: 'Hello there. And again.', ...extra }] });

test('scene checks: defaults, sentence split, cues and camera', () => {
  const s = checkScenes(scene({ items: [{ svg, line: 1 }, { text: '1896' }] }));
  const sc = s.scenes[0];
  assert.deepEqual(sc.say.map((l) => l.text), ['Hello there.', 'And again.']);
  assert.equal(sc.character.gesture, 'rest');
  assert.equal(sc.character.mood, 'neutral');
  assert.equal(sc.character.auto, true);
  assert.equal(sc.transition, 'cut');
  assert.equal(sc.items[0].loop, 'none');
  assert.equal(checkScenes(scene({ character: { pose: 'idle' } })).scenes[0].character.gesture, 'rest');
  assert.equal(sc.camera.to.zoom, 1);
  assert.equal(sc.items[0].kind, 'svg');
  assert.equal(sc.items[0].enter, 'pop');
  assert.equal(sc.items[1].enter, 'write');
  assert.equal(sc.background.length, 2);
  assert.equal(checkScenes(scene({ character: false })).scenes[0].character, null);
});

test('scene checks refuse scripts, external links, bad cues and empty scenes', () => {
  assert.throws(() => checkScenes({}), /scenes/);
  assert.throws(() => checkScenes({ scenes: [{ say: '' }] }), /nothing to say/);
  for (const bad of [
    '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 1 1" onload="x()"></svg>',
    '<svg viewBox="0 0 1 1"><image href="https://example.com/a.png"/></svg>',
    '<svg viewBox="0 0 1 1"><use href="https://example.com/s.svg#a"/></svg>',
    '<svg viewBox="0 0 1 1"><rect style="fill:url(https://x.test/a)"/></svg>',
    '<svg viewBox="0 0 1 1"><foreignObject></foreignObject></svg>',
  ]) assert.throws(() => checkScenes(scene({ items: [{ svg: bad }] })), /only plain drawing/, bad);
  assert.doesNotThrow(() => checkScenes(scene({ items: [{ svg: '<svg viewBox="0 0 1 1"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>' }] })));
  assert.throws(() => checkScenes(scene({ items: [{ svg: '<svg><rect/></svg>' }] })), /viewBox/);
  assert.throws(() => checkScenes(scene({ items: [{ svg, line: 5 }] })), /line must be/);
  assert.throws(() => checkScenes(scene({ items: [{ svg, enter: 'explode' }] })), /enter must be/);
  assert.throws(() => checkScenes(scene({ character: { pose: 'dance' } })), /gesture/);
  assert.throws(() => checkScenes(scene({ character: { mood: 'angry' } })), /mood/);
  assert.throws(() => checkScenes(scene({ character: { cues: [{ line: 4, gesture: 'wave' }] } })), /line must be/);
  assert.throws(() => checkScenes(scene({ items: [{ svg, loop: 'twirl' }] })), /loop/);
  assert.throws(() => checkScenes(scene({ items: [{ svg, exit: { anim: 'melt' } }] })), /exit anim/);
  assert.throws(() => checkScenes(scene({ items: [{ text: 'x', enter: 'draw' }] })), /for drawings/);
  assert.throws(() => checkScenes(scene({ transition: 'spin' })), /transition/);
  assert.throws(() => checkScenes(scene({ camera: { keys: [{ zoom: 9 }] } })), /zoom/);
  assert.throws(() => checkScenes(scene({ camera: { to: { zoom: 0.5 } } })), /zoom/);
  assert.throws(() => checkScenes(scene({ background: 'blue' })), /colour/);
});

test('mouth track: rests outside speech, opens with loudness, rounds dark sounds, changes on twos', () => {
  const hop = 0.01;
  const n = 300;
  const rms = new Array(n).fill(0);
  const centroid = new Array(n).fill(0);
  for (let i = 50; i < 100; i++) [rms[i], centroid[i]] = [0.2, 1500]; // loud, neutral
  for (let i = 100; i < 150; i++) [rms[i], centroid[i]] = [0.2, 700]; // loud, dark
  for (let i = 150; i < 200; i++) [rms[i], centroid[i]] = [0.2, 3000]; // loud, bright
  const m = mouthTrack({ hop, rms, centroid }, 24, 72, [{ start: 0.4, end: 2.1 }]);
  assert.equal(m.length, 72);
  assert.equal(m[2], 'rest');
  assert.equal(m[18], 'open');
  assert.equal(m[30], 'round');
  assert.equal(m[42], 'wide');
  assert.equal(m[60], 'rest');
  for (let f = 1; f < 72; f += 2) assert.equal(m[f], m[f - 1], 'held for two frames');
});

test('blink track: seeded, a blink every few seconds, half shut, shut, half shut', () => {
  const b = blinkTrack(24 * 30, 24, 'x');
  assert.deepEqual(b, blinkTrack(24 * 30, 24, 'x'));
  const starts = b.map((v, i) => (v && !b[i - 1] ? i : -1)).filter((i) => i >= 0);
  assert.ok(starts.length >= 5 && starts.length <= 14, String(starts.length));
  for (const s of starts) {
    assert.equal(b[s], 1, 'starts half shut');
    assert.equal(b[s + 1], 2, 'then shut');
  }
  assert.ok(b.every((v) => v === 0 || v === 1 || v === 2));
});

test('captions (.srt) and the page: one cue per line, label and data in the page', () => {
  const spec = checkScenes({ title: 'T <x>', scenes: [{ say: ['One.', 'Two?'], items: [{ text: 'A&B' }] }] });
  assert.equal(spec.scenes[0].characters.length, 0, 'no cast, nobody on screen');
  const timings = [{ start: 0, end: 3, lines: [{ start: 0.35, end: 1.2 }, { start: 1.5, end: 2.5 }] }];
  const s = srt(spec, timings);
  assert.match(s, /^1\n00:00:00,350 --> 00:00:01,400\nOne\.\n/);
  assert.match(s, /2\n00:00:01,500 --> 00:00:02,700\nTwo\?/);
  const c = { ...characterFromFace({ landmarks: fx.landmarks, size: fx.size, checks: {} }, synthImage()), consent };
  const timeline = buildTimeline(spec, timings);
  assert.equal(timeline[0].lines[1].question, true);
  const html = explainerHtml({ spec, timeline, cast: {}, tracks: {}, fps: 24, width: 640, height: 360 });
  assert.ok(!html.includes('id="badge"') && !html.includes('AI-GENERATED'), 'no visible label on studio videos');
  assert.ok(html.includes('A&amp;B') && html.includes('T &lt;x&gt;'));
  assert.ok(!/<script[^>]*src=|<link[^>]*href=|https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '').replace(/http:\/\/studio\.local\//g, '')), 'no external references');
  assert.ok(sheetHtml(c).includes('id="k0-armRt"'));
});

const T2 = [{ start: 0, end: 6, lines: [{ start: 0.35, end: 2 }, { start: 2.3, end: 5.5 }] }];

test('timeline: line plus at offsets, camera keys, exits and moves in absolute seconds', () => {
  const spec = checkScenes({ scenes: [{
    say: ['One.', 'Two.'],
    camera: { from: { zoom: 1.2, x: 0.3 }, keys: [{ line: 1, zoom: 1, x: 0.5, dur: 2 }] },
    items: [{ svg, line: 1, at: 0.5, exit: { line: 1, at: 2 }, move: { x: 0.9, at: 3 } }, { text: 'hi', at: 1 }],
  }] });
  const [s] = buildTimeline(spec, T2);
  assert.equal(s.items[0].t, 2.8);
  assert.deepEqual(s.items[0].exit, { anim: 'fade', t: 4.3 });
  assert.deepEqual(s.items[0].move, { x: 0.9, y: 0.5, t: 3, dur: 0.8 });
  assert.equal(s.items[1].t, 1);
  assert.ok(s.items[1].enterDur >= 0.6);
  assert.deepEqual(s.camera.map((k) => [k.t, k.zoom, k.x]), [[0, 1.2, 0.3], [2.3, 1, 0.5]]);
  const plain = buildTimeline(checkScenes({ scenes: [{ say: ['One.', 'Two.'], camera: { to: { zoom: 1.1 } } }] }), T2)[0];
  assert.deepEqual(plain.camera.map((k) => [k.t, k.zoom, k.dur]), [[0, 1, 0], [0, 1.1, 6]]);
});

test('timeline: the host gestures per sentence, points at items beside it, glances at every item', () => {
  const spec = checkScenes({ title: 'x', character: 'random', scenes: [{ say: ['One.', 'Two.'], character: { x: 0.3 }, items: [{ svg, x: 0.8, y: 0.4, at: 3 }, { svg, x: 0.32, y: 0.4, at: 1, look: false }] }] });
  const c = buildTimeline(spec, T2)[0].character;
  assert.deepEqual(c.gestures.filter((g) => g.t === 3).map((g) => g.g), ['point'], 'points toward the item on its right');
  assert.ok(c.gestures.some((g) => g.t === 4.5), 'and drops the point 1.5 s later');
  assert.ok(c.gestures.every((g, k) => k === 0 || g.t - c.gestures[k - 1].t >= 0.8), 'no two changes closer than 0.8 s');
  assert.equal(c.looks.length, 1, 'glances only at items that ask for it');
  assert.ok(c.looks[0].x > 0.9, 'looks right');
  // Flipped, the same item is to its left.
  const flipped = buildTimeline(checkScenes({ title: 'x', character: 'random', scenes: [{ say: ['One.', 'Two.'], character: { x: 0.3, flip: true }, items: [{ svg, x: 0.8, y: 0.4, at: 3 }] }] }), T2)[0].character;
  assert.ok(flipped.gestures.some((g) => g.g === 'point-left'));
  assert.ok(flipped.looks[0].x < 0);
});

test('timeline: written cues win, moods change on cue, automatic gestures can be turned off', () => {
  const spec = checkScenes({ character: 'random', scenes: [{ say: ['One.', 'Two.'], character: { mood: 'happy', cues: [{ line: 1, gesture: 'shrug', mood: 'curious' }] }, items: [{ svg, x: 0.9, at: 2.4 }] }] });
  const c = buildTimeline(spec, T2)[0].character;
  assert.ok(c.gestures.some((g) => g.g === 'shrug' && g.t === 2.3));
  assert.ok(!c.gestures.some((g) => g.g === 'explain' || g.g === 'present'), 'no automatic sentence gestures');
  assert.deepEqual(c.moods.map((m) => m.m), ['happy', 'curious']);
  const off = buildTimeline(checkScenes({ character: 'random', scenes: [{ say: ['One.', 'Two.'], character: { auto: false } }] }), T2)[0].character;
  assert.deepEqual(off.gestures.map((g) => g.g), ['rest']);
  for (const g of Object.values(GESTURES)) assert.ok(g.right.length === 3 && g.left.length === 3);
  for (const m of MOODS) assert.equal(MOOD_FACES[m].brows.length, 2);
});

test('emphasis: bumps at loudness peaks inside speech, none in silence', () => {
  const hop = 0.01;
  const n = 400;
  const rms = new Array(n).fill(0.02);
  for (const p of [80, 200]) for (let k = -3; k <= 3; k++) rms[p + k] = 0.2;
  const e = emphasisTrack({ hop, rms, centroid: new Array(n).fill(1500) }, 24, 96, [{ start: 0.5, end: 3.5 }]);
  assert.equal(e.length, 96);
  assert.ok(e[Math.round(0.8 * 24)] > 0.8 && e[Math.round(2.0 * 24)] > 0.8, 'peaks at 0.8 s and 2.0 s');
  assert.equal(e[Math.round(1.4 * 24)], 0);
  assert.equal(e[2], 0, 'nothing before speech');
});

test('sound effects: one per entrance and transition, quiet, deterministic, mixed without clipping', () => {
  const spec = checkScenes({ scenes: [
    { say: 'One.', items: [{ svg }, { text: 'abc', at: 1 }, { svg, enter: 'none', at: 2 }, { svg, at: 2, sound: false }] },
    { say: 'Two.', transition: 'push', items: [{ svg, enter: 'slide-left' }] },
  ] });
  const tl = buildTimeline(spec, [{ start: 0, end: 3, lines: [{ start: 0.3, end: 2.8 }] }, { start: 3, end: 5, lines: [{ start: 3.3, end: 4.8 }] }]);
  const ev = sfxEvents(tl);
  assert.deepEqual(ev.map((e) => e.kind), ['pop', 'scribble', 'whoosh', 'whoosh']);
  const a = synthSfx(ev, 5, 's');
  assert.deepEqual(a, synthSfx(ev, 5, 's'));
  const peak = a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.05 && peak < 0.6, `peak ${peak}`);
  assert.ok(mixSfx(new Float32Array(a.length).fill(0.95), a).every((v) => Math.abs(v) <= 1));
});

test('encode arguments: music loops, fades and ducks under the voice; none without music', () => {
  const meta = { title: 't' };
  const plain = encodeArgs({ fps: 24, audio: 'a.wav', seconds: 10, meta, out: 'o.mp4' });
  assert.ok(!plain.includes('-filter_complex'));
  assert.ok(plain.includes('1:a:0'));
  const withMusic = encodeArgs({ fps: 24, audio: 'a.wav', music: 'm.mp3', musicVolume: 0.1, seconds: 10, meta, out: 'o.mp4' });
  const fc = withMusic[withMusic.indexOf('-filter_complex') + 1];
  assert.match(fc, /sidechaincompress/);
  assert.match(fc, /afade=t=out:st=8\.00/);
  assert.match(fc, /volume=0\.1/);
  assert.ok(withMusic.includes('-stream_loop') && withMusic.includes('[a]'));
});

test('scenery: every backdrop and particle kind draws seeded SVG of the right size; unknown names refused', async () => {
  const { backdropSvg, particlesSvg, BACKDROPS, PARTICLES, BACKDROP_OVERSCAN } = await import('../../src/studio/backdrops.mjs');
  for (const b of BACKDROPS.filter((x) => x !== 'none')) {
    const s = backdropSvg(b, '#7fb6d6', { width: 640, height: 360, seed: 'a' });
    assert.match(s, new RegExp(`^<svg [^>]*width="${640 * BACKDROP_OVERSCAN}" height="${360 * BACKDROP_OVERSCAN}"`), b);
    assert.ok(!/NaN|undefined/.test(s), b);
    assert.equal(s, backdropSvg(b, '#7fb6d6', { width: 640, height: 360, seed: 'a' }), `${b} is seeded`);
  }
  for (const p of PARTICLES.filter((x) => x !== 'none')) {
    const s = particlesSvg(p, { width: 640, height: 360, seed: 'a' });
    assert.ok((s.match(/class="p"/g) || []).length >= 10, p);
    assert.ok(!/NaN|undefined/.test(s), p);
  }
  assert.equal(backdropSvg('none', '#7fb6d6', { width: 10, height: 10 }), '');
  const sc = checkScenes({ scenes: [{ say: 'Hi.', backdrop: 'stars', particles: 'dust' }] }).scenes[0];
  assert.deepEqual([sc.backdrop, sc.particles], ['stars', 'dust']);
  assert.throws(() => checkScenes({ scenes: [{ say: 'Hi.', backdrop: 'jungle' }] }), /backdrop/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'Hi.', particles: 'fire' }] }), /particles/);
});

test('counters and marks: checked, timed after the entrance, with a pencil sound', () => {
  const spec = checkScenes({ scenes: [{ say: 'One.', items: [
    { text: 'about {n} years', count: { from: 0, to: 5730 }, at: 1 },
    { svg, mark: 'circle', at: 0.5, markAt: 2 },
    { text: 'plain', mark: 'underline' },
  ] }] });
  const items = spec.scenes[0].items;
  assert.deepEqual(items[0].count, { from: 0, to: 5730, dur: 1.4, decimals: 0 });
  assert.equal(items[2].markColor, '#e2604f');
  const [s] = buildTimeline(spec, [{ start: 0, end: 4, lines: [{ start: 0.3, end: 3.5 }] }]);
  assert.equal(s.items[0].markT, null);
  assert.equal(s.items[1].markT, 2.5);
  assert.ok(s.items[2].markT > s.items[2].t + s.items[2].enterDur, 'the mark comes after the writing');
  assert.equal(sfxEvents([s]).filter((e) => e.kind === 'scribble').length, 4, 'two text writes and two marks');
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', items: [{ text: 'no slot', count: { to: 3 } }] }] }), /\{n\}/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', items: [{ text: '{n}', count: { from: 1 } }] }] }), /"to"/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', items: [{ svg, mark: 'star' }] }] }), /mark/);
});


test('cast: your own, random or nobody; dialogue lines name their speaker and voice', async () => {
  const { sceneVoices, sceneLines } = await import('../../src/studio/scenes.mjs');
  const spec = checkScenes({
    voice: 'kokoro:af_heart',
    cast: { host: { character: 'random:a' }, guest: { character: 'random:b', voice: 'kokoro:am_michael', body: 'full' } },
    scenes: [
      { say: ['Hi there.', { who: 'guest', text: 'Hello!' }, { who: 'narrator', text: 'Meanwhile.' }], characters: { host: {}, guest: { x: 0.8 } } },
      { say: 'Nobody here.', characters: false },
    ],
  });
  assert.deepEqual(spec.scenes[0].say.map((l) => l.who), ['host', 'guest', 'narrator']);
  assert.deepEqual(sceneVoices(spec, 'kokoro:af_heart')[0], ['kokoro:af_heart', 'kokoro:am_michael', 'kokoro:af_heart']);
  assert.deepEqual(sceneLines(spec)[0], ['Hi there.', 'Hello!', 'Meanwhile.']);
  assert.equal(spec.scenes[0].characters[1].body, 'full');
  assert.equal(spec.scenes[1].characters.length, 0);
  assert.throws(() => checkScenes({ cast: { host: { character: 'random' } }, scenes: [{ say: [{ who: 'ghost', text: 'Boo.' }] }] }), /not in the cast/);
  assert.throws(() => checkScenes({ cast: { narrator: { character: 'random' } }, scenes: [{ say: 'x' }] }), /narrator/);
  const none = checkScenes({ scenes: [{ say: 'Just a narrator.' }] });
  assert.equal(none.scenes[0].characters.length, 0);
  assert.equal(none.scenes[0].say[0].who, 'narrator');
});

test('dialogue timeline: listeners turn to the speaker, walks move the character, bubbles sit by the speaker', () => {
  const spec = checkScenes({
    cast: { host: { character: 'random:a' }, guest: { character: 'random:b', body: 'full' } },
    scenes: [{ say: ['Hi.', { who: 'guest', text: 'Are you sure?' }], characters: { host: { x: 0.25 }, guest: { x: 0.75, enter: 'walk-right', walk: { x: 0.6, line: 1 } } }, items: [{ bubble: 'Hm?', who: 'guest', line: 1 }] }],
  });
  const [s] = buildTimeline(spec, T2);
  const host = s.characters.find((c) => c.who === 'host');
  const guest = s.characters.find((c) => c.who === 'guest');
  assert.ok(host.looks.some((l) => l.t === 2.3 && l.x > 0), 'the host turns right toward the guest when the guest speaks');
  assert.ok(guest.looks.some((l) => l.t === 0.35 && l.x < 0), 'the guest turns left toward the host');
  assert.equal(guest.walk[0].x, 1.25, 'walks in from the right');
  assert.deepEqual(guest.walk.slice(1).map((w) => w.x), [0.75, 0.6]);
  assert.ok(guest.gestures.some((g) => g.g === 'shrug'), 'a question gets a shrug');
  assert.ok(guest.moods.some((m) => m.m === 'curious'), 'and a curious look');
  const b = s.items[0];
  assert.ok(b.x < 0.75 && b.y < 0.5, 'the bubble sits beside and above the guest');
});

test('gestures and moods from the words', async () => {
  const { gestureFor, moodFor } = await import('../../src/studio/scenes.mjs');
  assert.equal(gestureFor('Hello and welcome.'), 'wave');
  assert.equal(gestureFor('Look at this graph.'), 'point');
  assert.equal(gestureFor('Why does it happen?'), 'shrug');
  assert.equal(gestureFor('Imagine a tiny box.'), 'think');
  assert.equal(gestureFor('It covers the whole world.'), 'present');
  assert.equal(gestureFor('But there is a catch.'), 'explain');
  assert.equal(gestureFor('Plain words.'), null);
  assert.equal(moodFor('That is amazing!'), 'happy');
  assert.equal(moodFor('This is dangerous.'), 'serious');
  assert.equal(moodFor('Surprisingly, it works.'), 'surprised');
});

test('random characters: seeded, valid, fictional, varied', async () => {
  const { randomCharacter } = await import('../../src/studio/character.mjs');
  assert.deepEqual({ ...randomCharacter('x'), consent: null }, { ...randomCharacter('x'), consent: null });
  const many = Array.from({ length: 30 }, (_, k) => randomCharacter(`s${k}`));
  for (const c of many) {
    checkCharacter(c);
    assert.equal(c.consent.method, 'random');
    assert.match(c.consent.statement, /fictional/);
  }
  assert.ok(new Set(many.map((c) => c.hairStyle)).size >= 6, 'many hair styles');
  assert.ok(new Set(many.map((c) => c.outfit)).size >= 4, 'many outfits');
  const svgFull = characterSvg(many[0], { id: 'f', body: 'full' });
  for (const id of ['legRt', 'legLt', 'shinRt', 'shinLt', 'chin']) assert.ok(svgFull.includes(`id="f-${id}"`), id);
  assert.ok(!/NaN|undefined/.test(svgFull));
});

test('props, charts and items of every kind are checked and drawn', async () => {
  const { PROPS } = await import('../../src/studio/props.mjs');
  const { chartSvg, checkChart } = await import('../../src/studio/charts.mjs');
  assert.ok(PROPS.length >= 50);
  const spec = checkScenes({ scenes: [{ say: 'x', items: [
    { prop: 'lightbulb', color: '#ff0000' },
    { chart: { type: 'bar', values: [1, 2, 3], labels: ['a', 'b', 'c'], unit: '$' } },
    { chart: { type: 'line', values: [3, 1, 2] } },
    { chart: { type: 'pie', values: [1, 1, 2], labels: ['x', 'y', 'z'] } },
    { bubble: 'Hi', x: 0.5, y: 0.2 },
    { image: 'photo.png' },
  ] }] });
  const it = spec.scenes[0].items;
  assert.deepEqual(it.map((x) => x.kind), ['svg', 'chart', 'chart', 'chart', 'bubble', 'image']);
  assert.ok(it[0].svg.includes('#ff0000'));
  assert.equal(it[1].enter, 'grow');
  assert.ok(it[1].svg.includes('$3') && (it[1].svg.match(/g-bar/g) || []).length === 3);
  assert.ok(it[2].svg.includes('g-line'));
  assert.equal((it[3].svg.match(/g-pie/g) || []).length, 3);
  assert.throws(() => checkChart('c', { type: 'radar', values: [1] }), /chart type/);
  assert.throws(() => checkChart('c', { type: 'pie', values: [-1] }), /negative/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', items: [{ prop: 'unicorn' }] }] }), /prop/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', items: [{ image: 'run.exe' }] }] }), /image/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', items: [{ bubble: 'Hi' }] }] }), /x and y/);
  for (const name of PROPS) assert.ok(!/NaN|undefined/.test(chartSvg({ type: 'bar', values: [1], labels: [], colors: [], unit: '' })) && name);
});

test('manim blocks are checked; image backdrops are accepted', () => {
  const s = checkScenes({ scenes: [{ say: 'x', manim: { code: 'class A(Scene):\n    def construct(self): pass' }, backdrop: { image: 'bg.jpg', dim: 0.3 } }] }).scenes[0];
  assert.equal(s.manim.scene, 'A');
  assert.deepEqual(s.backdropImage, { file: 'bg.jpg', dim: 0.3 });
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', manim: { code: 'print(1)' } }] }), /Scene class/);
  assert.throws(() => checkScenes({ scenes: [{ say: 'x', backdrop: { image: 'bg.svg' } }] }), /backdrop image/);
});

test('lip sync from the text: closed lips on M and B, teeth on the lip for F, rounding on O', () => {
  const hop = 0.01;
  const n = 300;
  const rms = new Array(n).fill(0.2);
  const centroid = new Array(n).fill(1500);
  const m = mouthTrack({ hop, rms, centroid }, 24, 72, [{ start: 0, end: 3, text: 'Mama, fofo boom.' }]);
  assert.ok(m.includes('rest') && m.includes('fv') && (m.includes('round') || m.includes('pucker')) && m.includes('open'), m.join(' '));
  const quiet = mouthTrack({ hop, rms: new Array(n).fill(0.001).map((v, i) => (i < 150 ? 0.2 : v)), centroid }, 24, 72, [{ start: 0, end: 3, text: 'Ah ah ah ah ah ah.' }]);
  assert.equal(quiet[60], 'rest', 'silence in the audio closes the mouth whatever the text says');
});

test('recorded narration: sentences aligned to the pauses in the recording', async () => {
  const { alignRecording, SR: rate } = await import('../../src/studio/speech.mjs');
  const x = new Float32Array(rate * 6);
  const tone = (a, b) => { for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) x[i] = 0.3 * Math.sin(i / 5); };
  tone(0.2, 1.0); tone(1.5, 4.2); tone(4.8, 5.6);
  const t = alignRecording(x, [['Short.', 'A much much longer sentence here.'], ['End.']]);
  const marks = t.flatMap((s) => s.lines);
  assert.ok(Math.abs(marks[0].end - 1.0) < 0.05 && Math.abs(marks[1].start - 1.5) < 0.05, JSON.stringify(marks));
  assert.ok(Math.abs(marks[1].end - 4.2) < 0.05 && Math.abs(marks[2].start - 4.8) < 0.05, JSON.stringify(marks));
});

test('painted backdrops: a prompt needs an API key; nothing is sent without one', async () => {
  const { paintBackdrops } = await import('../../src/studio/explainer.mjs');
  const spec = checkScenes({ scenes: [{ say: 'x', backdrop: { prompt: 'a quiet laboratory at night', dim: 0.3 } }] });
  assert.deepEqual(spec.scenes[0].backdropImage, { file: null, prompt: 'a quiet laboratory at night', dim: 0.3 });
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(paintBackdrops(spec, fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))), /OPENAI_API_KEY/);
  } finally {
    if (saved) process.env.OPENAI_API_KEY = saved;
  }
});

test('ambient music: seeded, the right length, soft, faded at both ends', () => {
  const { ambientMusic } = sfxModule;
  const a = ambientMusic(10, 'x');
  assert.equal(a.length, 10 * SR);
  assert.deepEqual(a.slice(0, 1000), ambientMusic(10, 'x').slice(0, 1000));
  let peak = 0;
  let sum = 0;
  for (const v of a) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / a.length);
  assert.ok(peak < 0.95 && rms > 0.02 && rms < 0.4, `peak ${peak}, rms ${rms}`);
  assert.equal(a[0], 0);
  assert.ok(Math.abs(a[a.length - 1]) < 1e-3);
});

test('storyboard warnings: overlaps, off the frame, captions, empty and rushed scenes; layering is allowed', async () => {
  const { lintStoryboard } = await import('../../src/studio/lint.mjs');
  const spec = checkScenes({ character: 'random', scenes: [
    { say: 'One two three.', items: [{ prop: 'coin', x: 0.6, y: 0.4, w: 0.2 }, { prop: 'star', x: 0.65, y: 0.42, w: 0.2 }, { prop: 'sun', x: 1.1, y: 0.4, w: 0.2 }, { prop: 'moon', x: 0.6, y: 0.95, w: 0.1 }, { prop: 'heart', x: 0.5, y: 0.6, w: 0.15 }] },
    { say: 'Nothing here.', characters: false },
    { say: 'Glow.', characters: false, items: [{ prop: 'sun', x: 0.3, y: 0.3, w: 0.3 }, { prop: 'lightbulb', x: 0.3, y: 0.3, w: 0.1 }] },
  ] });
  const T = [{ start: 0, end: 4, lines: [{ start: 0.3, end: 3 }] }, { start: 4, end: 6, lines: [{ start: 4.3, end: 5.5 }] }, { start: 6, end: 8, lines: [{ start: 6.3, end: 7.5 }] }];
  const w = lintStoryboard(spec, buildTimeline(spec, T));
  assert.ok(w.some((x) => /scene 1: items 1 and 2 overlap/.test(x)), w.join('\n'));
  assert.ok(w.some((x) => /scene 1 item 3 .* runs off the frame/.test(x)));
  assert.ok(w.some((x) => /scene 1 item 4 sits where the captions go/.test(x)));
  assert.ok(w.some((x) => /scene 1 item 5 covers host/.test(x)));
  assert.ok(w.some((x) => /scene 2 has nothing to look at/.test(x)));
  assert.ok(!w.some((x) => /scene 3/.test(x)), 'items on one centre are layered on purpose');
});

test('round two: thumbs and count gestures from words, name tags, title cards, contrasting random colours', async () => {
  const { gestureFor, buildTimeline: bt } = await import('../../src/studio/scenes.mjs');
  const { randomCharacter } = await import('../../src/studio/character.mjs');
  assert.equal(gestureFor('Great job.'), 'thumbs');
  assert.equal(gestureFor('There are two kinds.'), 'count');
  const spec = checkScenes({ character: 'random', scenes: [{ say: 'One. Two.', title: 'Chapter 1', character: { name: 'Dr. Maya', x: 0.3 } }] });
  const it = spec.scenes[0].items;
  assert.deepEqual(it.map((x) => x.kind), ['text', 'tag']);
  assert.equal(it[0].text, 'Chapter 1');
  assert.equal(it[0].mark, 'underline');
  assert.equal(it[1].text, 'Dr. Maya');
  const [s] = bt(spec, [{ start: 0, end: 6, lines: [{ start: 0.3, end: 2 }, { start: 2.3, end: 5 }] }]);
  assert.deepEqual(s.items[1].exit, { anim: 'fade', t: 4.5 });
  assert.ok(characterSvg(randomCharacter('x'), { id: 'z' }).includes('id="z-handRt-thumb"'));
  const d2 = (a, b) => [1, 3, 5].reduce((q, i) => q + (parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) ** 2, 0);
  for (let k = 0; k < 40; k++) {
    const c = randomCharacter(`contrast${k}`);
    assert.ok(d2(c.colors.clothes, c.colors.skin) > 80 * 80, `clothes stand out from the skin (${k})`);
  }
});

test('round three: chalkboard and notebook backdrops, word captions, head-turn groups', async () => {
  const { backdropSvg } = await import('../../src/studio/backdrops.mjs');
  for (const b of ['chalkboard', 'notebook']) assert.ok(backdropSvg(b, '#2f5a46', { width: 640, height: 360 }).length > 500, b);
  assert.equal(checkScenes({ captions: 'words', scenes: [{ say: 'x' }] }).captions, 'words');
  assert.equal(checkScenes({ captions: false, scenes: [{ say: 'x' }] }).captions, false);
  const svg = characterSvg(characterFromFace({ landmarks: fx.landmarks, size: fx.size, checks: {} }, synthImage()), { id: 'q' });
  for (const id of ['ears', 'hairback', 'nose']) assert.ok(svg.includes(`id="q-${id}"`), id);
});

test('scaffold: a valid starter for every host mode and aspect', async () => {
  const { scaffold } = await import('../../src/studio/scaffold.mjs');
  for (const host of ['own', 'random', 'dialogue', 'none']) {
    for (const aspect of ['16:9', '9:16']) {
      const spec = checkScenes(scaffold({ topic: 'Tides', host, aspect }));
      assert.equal(spec.scenes.length, 4);
      assert.equal(spec.scenes[0].characters.length, host === 'none' ? 0 : host === 'dialogue' ? 2 : 1, `${host} ${aspect}`);
    }
  }
  assert.throws(() => scaffold({ host: 'robot' }), /--host/);
});

test('phoneme lip sync: IPA from the phonemizer, pauses kept, used by the mouth track', async (t) => {
  const { phonemeSegments } = await import('../../src/studio/tracks.mjs');
  const segs = await phonemeSegments('Though, one.');
  if (!segs) {
    t.skip('the phonemizer (installed with kokoro-js) is not available');
    return;
  }
  const v = segs.map((s) => s.v);
  assert.ok(v.includes('O'), 'though has an O');
  assert.ok(segs.some((s) => s.v === 'rest' && s.word === -1 && s.end - s.start >= 200), 'the comma pause survives');
  assert.ok(v.includes('U'), 'one starts with a W (rounded)');
  const hop = 0.01;
  const m = mouthTrack({ hop, rms: new Array(300).fill(0.2), centroid: new Array(300).fill(1500) }, 24, 72, [{ start: 0, end: 2.5, text: 'Though, one.', segs }]);
  assert.ok(m.includes('round') || m.includes('pucker'));
});

test('every example scene file is valid; the scene schema parses and names every scene field', () => {
  const root = path.join(here, '..', '..');
  const show = path.join(root, 'examples', 'showcase');
  const files = [path.join(root, 'examples', 'explainer', 'scenes.json'),
    ...fs.readdirSync(show).filter((f) => f.endsWith('.json')).map((f) => path.join(show, f))];
  assert.ok(files.length >= 14, 'the explainer, ten showcase films and their three base files');
  for (const f of files) {
    const spec = checkScenes(JSON.parse(fs.readFileSync(f, 'utf8')));
    assert.ok(spec.scenes.length >= 3, f);
  }
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'studio-scenes.v1.schema.json'), 'utf8'));
  const sceneProps = Object.keys(schema.$defs.scene.properties);
  for (const k of ['say', 'title', 'backdrop', 'particles', 'characters', 'camera', 'items', 'manim', 'transition', 'hold']) assert.ok(sceneProps.includes(k), k);
  assert.ok(schema.$defs.item.properties.enter.enum.includes('grow'));
});
