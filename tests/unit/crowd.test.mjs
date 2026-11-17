// selfclone studio: crowds, networks, pinned items and music ducking. No browser, no voice, no ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCrowd, crowdSvg, spreadOrder, checkNetwork, networkSvg } from '../../src/studio/crowd.mjs';
import { checkScenes, buildTimeline, explainerHtml, encodeArgs } from '../../src/studio/explainer.mjs';
import { sfxEvents } from '../../src/studio/sfx.mjs';
import { musicGraph } from '../../src/studio/explainer.mjs';

const timings = (spec) => spec.scenes.map((s, i) => {
  const start = i * 10;
  return { start, end: start + 10, lines: s.say.map((_, j) => ({ start: start + 1 + j * 3, end: start + 3.5 + j * 3 })) };
});

test('crowd: defaults, limits and readable errors', () => {
  const c = checkCrowd('item', { count: 25 });
  assert.equal(c.count, 25);
  assert.equal(c.spread, null);
  assert.throws(() => checkCrowd('item', { count: 0 }), /count/);
  assert.throws(() => checkCrowd('item', { count: 3, homes: [[0.1, 0.1]] }), /homes/);
  assert.throws(() => checkCrowd('item', { count: 3, spread: { badge: 'banana' } }), /badge/);
  assert.throws(() => checkCrowd('item', { count: 3, gather: { to: [2, 0] } }), /gather to/);
});

test('crowd: everyone is drawn, the news reaches exactly "to" people, in time order, from someone who knew', () => {
  const c = checkCrowd('item', { count: 25, seed: 'town', spread: { from: 4, to: 13, at: 1, dur: 5 } });
  const { svg, knowAt } = crowdSvg(c);
  assert.equal((svg.match(/class="cm"/g) || []).length, 25);
  assert.equal((svg.match(/class="cbad"/g) || []).length, 13);
  assert.equal((svg.match(/class="cw"/g) || []).length, 12);
  assert.equal(knowAt.length, 12);
  for (let k = 1; k < knowAt.length; k++) assert.ok(knowAt[k] >= knowAt[k - 1]);
  assert.ok(knowAt[knowAt.length - 1] <= 1 + 0.35 + 5 + 1e-9);
  const homes = Array.from({ length: 25 }, (_, k) => [k * 40, (k % 5) * 100]);
  const order = spreadOrder(c, homes);
  assert.equal(order[0].who, 4);
  assert.equal(new Set(order.map((e) => e.who)).size, 13);
  const known = new Set([4]);
  for (const e of order.slice(1)) { assert.ok(known.has(e.from)); known.add(e.who); }
  // Same seed, same picture.
  assert.equal(crowdSvg(c).svg, svg);
});

test('crowd: gathering and a ring are marked on the right people', () => {
  const c = checkCrowd('item', { count: 10, seed: 's', ring: 2, spread: { from: 2, to: 6 }, gather: { count: 3, to: [0.5, 0.5], at: 2 } });
  const { svg } = crowdSvg(c);
  assert.equal((svg.match(/class="cring"/g) || []).length, 1);
  assert.equal((svg.match(/data-gt="2"/g) || []).length, 3);
  assert.match(svg, /data-i="2"[^>]*data-ring="0"/);
});

test('network: ties at the start and end match the densities', () => {
  const n = checkNetwork('item', { nodes: 25, from: 0.167, to: 0.74, dur: 4 });
  const { svg, ties } = networkSvg(n);
  assert.deepEqual(ties, [50, 222]);
  assert.equal((svg.match(/<line /g) || []).length, 222);
  assert.equal((svg.match(/class="ne"/g) || []).length, 172);
  assert.throws(() => checkNetwork('item', { nodes: 5, from: 0.6, to: 0.2 }), /at least/);
});

test('scene file: crowd and network items, sentence anchors, pins and pops', () => {
  const spec = checkScenes({
    title: 'Town',
    scenes: [{
      say: [{ who: 'narrator', text: 'One.' }, { who: 'narrator', text: 'Two.' }],
      characters: false,
      items: [
        { crowd: { count: 8, spread: { from: 0, to: 4, line: 1, at: 0.2, dur: 2 }, gather: { count: 2, to: [0.5, 0.5], lineEnd: 1 } }, w: 1 },
        { network: { nodes: 6, from: 0.2, to: 0.8 }, w: 0.5 },
        { text: '{n} know', count: { from: 1, to: 4 }, pin: true },
      ],
    }],
  });
  const [crowd, net, label] = spec.scenes[0].items;
  assert.equal(crowd.kind, 'crowd');
  assert.equal(net.kind, 'network');
  assert.equal(label.pin, true);
  const tl = buildTimeline(spec, timings(spec));
  const it = tl[0].items[0];
  // The spread starts on sentence 2 (t = 4), the gathering at its end (t = 6.5); the crowd itself at t = 0.
  assert.equal(it.crowdShift.spread, 4);
  assert.equal(it.crowdShift.gather, 6.5);
  assert.equal(it.crowdShift.ring, 0);
  const pops = sfxEvents(tl).filter((e) => e.kind === 'pop' && e.t > 4);
  assert.equal(pops.length, 3);
  const html = explainerHtml({ spec, timeline: tl, cast: {}, tracks: {}, fps: 24, width: 720, height: 1280 });
  assert.match(html, /<div class="hud">.*\{n\}|<div class="hud"><div class="item/);
  assert.match(html, /svg class="crowd"/);
  assert.match(html, /svg class="network"/);
  assert.throws(() => checkScenes({ title: 't', scenes: [{ say: 'Hi.', items: [{ crowd: { count: 3 }, enter: 'draw' }] }] }), /not "draw"/);
});

test('music: "musicDuck" dips by that many dB during the lines, otherwise sidechain compression', () => {
  const ducked = musicGraph({ musicIn: '[2:a]', voiceIn: '[1:a]', musicVolume: 0.4, seconds: 20, duck: { db: 6, lines: [[1, 3], [4, 6]] } });
  assert.match(ducked, /volume='1-\(1-0\.5012\)\*min\(1,/);
  assert.doesNotMatch(ducked, /sidechaincompress/);
  const plain = musicGraph({ musicIn: '[2:a]', voiceIn: '[1:a]', musicVolume: 0.4, seconds: 20 });
  assert.match(plain, /sidechaincompress/);
  const args = encodeArgs({ fps: 24, audio: 'a.wav', music: 'm.mp3', musicVolume: 0.4, seconds: 20, meta: {}, out: 'o.mp4', duck: { db: 5, lines: [[1, 2]] } });
  assert.ok(args.join(' ').includes("eval=frame"));
  const spec = checkScenes({ title: 't', musicDuck: 5, scenes: [{ say: 'Hi.' }] });
  assert.equal(spec.musicDuck, 5);
  assert.throws(() => checkScenes({ title: 't', musicDuck: 99, scenes: [{ say: 'Hi.' }] }), /musicDuck/);
});
