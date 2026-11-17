// selfclone studio: 3D scenes ("three" blocks). No browser, no voice, no ffmpeg: checks the scene file, the
// timeline, the page markup, which frames get rendered and when the frame cache is reused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScenes, buildTimeline, explainerHtml } from '../../src/studio/explainer.mjs';
import { threeJobs, framesNeeded, moduleFiles, threeDir } from '../../src/studio/three.mjs';
import { lintStoryboard } from '../../src/studio/lint.mjs';

const timings = (spec) => spec.scenes.map((s, i) => {
  const start = i * 10;
  return { start, end: start + 10, lines: s.say.map((_, j) => ({ start: start + 1 + j * 3, end: start + 3.5 + j * 3 })) };
});

function tmpModules() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc3d-'));
  fs.writeFileSync(path.join(dir, 'helper.js'), 'export const k = 1;\n');
  fs.writeFileSync(path.join(dir, 'a.js'), "import { k } from './helper.js';\nexport default { setup() {}, update() {} };\n");
  fs.writeFileSync(path.join(dir, 'b.js'), 'export default { setup() {}, update() {} };\n');
  return dir;
}

test('three: a scene names a module; defaults, shorthand and readable errors', () => {
  const spec = checkScenes({ title: 't', scenes: [
    { say: 'One.', characters: false, three: { module: 'a.js' } },
    { say: 'Two.', characters: false, three: 'b.js', captions: false },
    { say: 'Three.', characters: false, three: { module: 'b.js', x: 0.5, y: 0.3, w: 0.6, transparent: true } },
  ] });
  assert.deepEqual(spec.scenes[0].three, { module: 'a.js', x: 0.5, y: 0.5, w: 1, h: 1, transparent: false });
  assert.equal(spec.scenes[1].three.module, 'b.js');
  assert.equal(spec.scenes[0].captions, true);
  assert.equal(spec.scenes[1].captions, false);
  assert.equal(spec.scenes[2].three.h, 0.6, 'h follows w when only w is given');
  assert.equal(spec.scenes[2].three.transparent, true);
  assert.throws(() => checkScenes({ title: 't', scenes: [{ say: 'x', three: { module: 'scene.py' } }] }), /\.js file/);
  assert.throws(() => checkScenes({ title: 't', scenes: [{ say: 'x', three: {} }] }), /needs "module"/);
  assert.throws(() => checkScenes({ title: 't', scenes: [{ say: 'x', three: 'a.js', manim: { code: 'class A(Scene):\n  pass' } }] }), /one of them/);
});

test('three: the timeline starts the layer with its scene and the page lays it under the items', () => {
  const spec = checkScenes({ title: 't', scenes: [
    { say: ['One.', 'Two.'], characters: false, three: 'a.js', items: [{ text: 'label', x: 0.5, y: 0.2 }] },
    { say: 'Three.', characters: false, transition: 'fade', three: 'b.js' },
  ] });
  const tl = buildTimeline(spec, timings(spec));
  assert.equal(tl[0].three.t, 0);
  assert.equal(tl[1].three.t, 10);
  const html = explainerHtml({ spec, timeline: tl, cast: {}, tracks: {}, three: { 0: { t: 0, frames: 252, ext: 'jpg' }, 1: { t: 10, frames: 240, ext: 'jpg' } }, fps: 24, width: 720, height: 1280 });
  assert.match(html, /<img class="th" id="s0t" style="left:0px;top:0px;width:720px;height:1280px">/);
  // Behind the world layer (items, characters), above the background.
  assert.ok(html.indexOf('id="s0t"') < html.indexOf('id="s0w"'));
  assert.match(html, /studio\.local\/three\//);
  // No warning about an empty scene when the scene is 3D.
  const warnings = lintStoryboard(spec, tl, { width: 720, height: 1280 });
  assert.ok(!warnings.some((w) => /nothing to look at/.test(w)), warnings.join('\n'));
});

test('three: jobs cover the scene plus the next transition, and the cache key follows the code', () => {
  const dir = tmpModules();
  const cacheDir = path.join(dir, '.cache');
  const raw = { title: 't', scenes: [
    { say: ['One.', 'Two.'], characters: false, three: 'a.js' },
    { say: 'Three.', characters: false, transition: 'fade', three: 'b.js' },
    { say: 'Four.', characters: false },
  ] };
  const spec = checkScenes(raw);
  const tl = buildTimeline(spec, timings(spec));
  const opts = { baseDir: dir, fps: 24, width: 720, height: 1280, cacheDir };
  const [a, b] = threeJobs(spec, tl, opts);
  assert.equal(a.frames, Math.ceil((10 + 0.5) * 24), 'scene 1 runs on through the fade into scene 2');
  assert.equal(b.frames, 240, 'scene 2 is followed by a cut');
  assert.equal(a.ext, 'jpg');
  assert.deepEqual(a.info.lines.map((l) => [l.start, l.end]), [[1, 3.5], [4, 6.5]], 'lines are scene-local');
  assert.deepEqual(moduleFiles(path.join(dir, 'a.js')).map((f) => path.basename(f)).sort(), ['a.js', 'helper.js']);
  // Same code, same cache; a change to an imported helper makes a new cache.
  assert.equal(threeJobs(spec, tl, opts)[0].dir, a.dir);
  fs.writeFileSync(path.join(dir, 'helper.js'), 'export const k = 2;\n');
  const [a2, b2] = threeJobs(spec, tl, opts);
  assert.notEqual(a2.dir, a.dir);
  assert.equal(b2.dir, b.dir, 'other modules keep their cache');
  // Preview frames map to the layer's own frames.
  const need = framesNeeded([a2, b2], 24, [0, 120, 250, 245, 300]);
  assert.deepEqual(need.get(a2), [0, 120, 250, 245]);
  assert.deepEqual(need.get(b2), [10, 5, 60], 'scene 2 starts at 10 s');
  assert.equal(framesNeeded([b2], 24).get(b2).length, 240);
  assert.throws(() => threeJobs(checkScenes({ title: 't', scenes: [{ say: 'x', three: 'missing.js' }] }), tl.slice(0, 1), opts), /not found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('three: three.js is installed and the kit files are where the 3D page serves them from', () => {
  assert.ok(fs.existsSync(path.join(threeDir(), 'build', 'three.module.js')));
  assert.ok(fs.existsSync(path.join(threeDir(), 'examples', 'jsm', 'postprocessing', 'UnrealBloomPass.js')));
  const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'studio', 'three');
  for (const f of ['stage.js', 'kit.js', 'index.js', 'probe.js']) assert.ok(fs.existsSync(path.join(kit, f)), f);
  // The kit must stay deterministic: no wall-clock or unseeded randomness.
  const src = fs.readFileSync(path.join(kit, 'kit.js'), 'utf8') + fs.readFileSync(path.join(kit, 'stage.js'), 'utf8');
  assert.doesNotMatch(src, /Math\.random\(|Date\.now\(|performance\.now\(/);
});
