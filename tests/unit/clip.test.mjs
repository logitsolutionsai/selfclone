// Clip enrolment: alignment math and keyframe selection, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fitSimilarity, fitAffine, applyTransform, alignToRest, alignmentResidual, selectKeyframes, frameGeometry,
  STABLE_POINTS, ENROL_PHRASE, CLIP_CLASSES,
} from '../../face/lib/clip.js';
import { textToVisemes, MOUTH_PATCH_POINTS, MOUTH_RING, LIPS_OUTER, EYE_REGIONS, buildMesh, INNER_LIP_RING } from '../../face/lib/geometry.js';
import { buildAvatarHtml, buildClip } from '../../src/face/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'mona-lisa-landmarks.json'), 'utf8'));
const L = fx.landmarks;
const rec = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'mona-lisa-clip-frames.json'), 'utf8'));

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const transform = (T, pts) => pts.map((p) => [...applyTransform(T, p), p[2] || 0]);

test('fitSimilarity recovers a known rotation, scale and shift', () => {
  const ang = (7 * Math.PI) / 180;
  const k = 1.3;
  const T = { a: k * Math.cos(ang), b: k * Math.sin(ang), c: -k * Math.sin(ang), d: k * Math.cos(ang), tx: 41.5, ty: -12.25 };
  const src = STABLE_POINTS.map((i) => L[i]);
  const dst = transform(T, src);
  const F = fitSimilarity(src, dst);
  for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty']) near(F[key], T[key], 1e-6, key);
  near(alignmentResidual(F, src, dst), 0, 1e-6, 'residual');
});

test('fitSimilarity is least squares: small noise moves the fit a little, not a lot', () => {
  const ang = (-4 * Math.PI) / 180;
  const T = { a: 0.8 * Math.cos(ang), b: 0.8 * Math.sin(ang), c: -0.8 * Math.sin(ang), d: 0.8 * Math.cos(ang), tx: 10, ty: 20 };
  const src = STABLE_POINTS.map((i) => L[i]);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const dst = transform(T, src).map((p) => [p[0] + rnd(), p[1] + rnd()]);
  const F = fitSimilarity(src, dst);
  near(Math.hypot(F.a, F.b), 0.8, 0.01, 'scale');
  near(Math.atan2(F.b, F.a), ang, 0.01, 'angle');
  assert.ok(alignmentResidual(F, src, dst) < 1.2);
});

test('fitAffine recovers a known affine map, shear included', () => {
  const T = { a: 1.1, b: 0.05, c: -0.2, d: 0.9, tx: 3, ty: -7 };
  const src = STABLE_POINTS.map((i) => L[i]);
  const F = fitAffine(src, transform(T, src));
  for (const key of Object.keys(T)) near(F[key], T[key], 1e-6, key);
});

test('alignment uses stable points only: an open jaw does not disturb it', () => {
  const ang = (3 * Math.PI) / 180;
  const T = { a: 0.9 * Math.cos(ang), b: 0.9 * Math.sin(ang), c: -0.9 * Math.sin(ang), d: 0.9 * Math.cos(ang), tx: -25, ty: 14 };
  const moved = transform(T, L);
  // Open the mouth and close the eyes in the moved frame.
  for (const i of [...LIPS_OUTER, ...INNER_LIP_RING, 152, 148, 377]) if (moved[i][1] > moved[13][1]) moved[i][1] += 12;
  const stable = new Set(STABLE_POINTS);
  for (const e of EYE_REGIONS) for (const i of e.contour) if (!stable.has(i)) moved[i][1] += 3;
  const { T: F, residual } = alignToRest(moved, L);
  assert.ok(residual < 1e-6, `residual ${residual}`);
  // Mapping the moved frame back recovers the rest landmarks on a stable point.
  const back = applyTransform(F, moved[168]);
  near(back[0], L[168][0], 1e-6, 'x');
  near(back[1], L[168][1], 1e-6, 'y');
});

test('the enrol phrase covers every clip mouth shape', () => {
  const tl = textToVisemes(ENROL_PHRASE);
  // The avatar shows I (see, cheap) and L with the E patch, so any of them exercises the spread lips.
  const cls = { I: 'E', L: 'E' };
  const seen = new Set(tl.segments.map((s) => (s.v === 'rest' && s.word >= 0 ? 'MBP' : cls[s.v] || s.v)));
  for (const v of ['AA', 'E', 'O', 'U', 'MBP', 'FV']) assert.ok(seen.has(v), `phrase hits ${v}`);
  assert.deepEqual(CLIP_CLASSES, ['AA', 'E', 'O', 'U', 'MBP', 'FV']);
});

test('patch point sets are real landmark rings around the lips and the eyes', () => {
  const fr = frameGeometry(L);
  assert.ok(fr.iod > 50);
  const c = [(L[13][0] + L[14][0]) / 2, (L[13][1] + L[14][1]) / 2];
  const dist = (i) => Math.hypot(L[i][0] - c[0], L[i][1] - c[1]);
  const lipMax = Math.max(...LIPS_OUTER.map(dist));
  const ringMin = Math.min(...MOUTH_RING.map(dist));
  assert.ok(ringMin > 0.5 * lipMax, 'the mouth ring lies around the lips');
  assert.ok(MOUTH_PATCH_POINTS.every((i) => i < 468) && new Set(MOUTH_PATCH_POINTS).size === MOUTH_PATCH_POINTS.length);
  for (const e of EYE_REGIONS) {
    const ec = e.contour.reduce((s, i) => [s[0] + L[i][0] / e.contour.length, s[1] + L[i][1] / e.contour.length], [0, 0]);
    const r = (i) => Math.hypot(L[i][0] - ec[0], L[i][1] - ec[1]);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(mean(e.ring2.map(r)) > mean(e.ring1.map(r)) && mean(e.ring1.map(r)) > mean(e.contour.map(r)) * 0.95, 'rings grow outward');
  }
});

// ---- keyframe selection on synthetic sequences built from real landmarks ----

function frame(over = {}) {
  const lm = L.map((p) => [p[0], p[1], p[2] || 0]);
  const f = { lm, bs: {}, pose: { yaw: 2, pitch: -1 }, sharp: 500, ok: true, ...over };
  if (over.edit) over.edit(f.lm);
  delete f.edit;
  return f;
}
const openJaw = (px) => (lm) => {
  for (const i of [14, 87, 178, 88, 95, 317, 402, 318, 324, 17, 84, 181, 91, 146, 314, 405, 321, 375]) lm[i][1] += px;
};
const narrow = (k) => (lm) => {
  const cx = (lm[61][0] + lm[291][0]) / 2;
  for (const i of [...LIPS_OUTER, ...INNER_LIP_RING]) lm[i][0] = cx + (lm[i][0] - cx) * k;
};
const closeEyes = (lm) => {
  for (const [up, low] of [[159, 145], [386, 374]]) lm[up][1] = lm[low][1] - 0.5;
};

test('selectKeyframes picks the clearest frame per shape and refuses blurred, turned and moving frames', () => {
  const frames = [
    frame({ t: 0 }), frame({ t: 0.1 }), frame({ t: 0.2 }), // still rest stretch
    frame({ t: 0.3, bs: { jawOpen: 0.45 }, edit: openJaw(9) }), // AA, fair
    frame({ t: 0.4, bs: { jawOpen: 0.7 }, edit: openJaw(14) }), // AA, best usable
    frame({ t: 0.5, bs: { jawOpen: 0.9 }, edit: openJaw(16), sharp: 40 }), // AA but blurred
    frame({ t: 0.6, bs: { jawOpen: 0.95 }, edit: openJaw(17), pose: { yaw: 19, pitch: -1 } }), // AA but head turned
    frame({ t: 0.7, bs: { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, jawOpen: 0.1 }, edit: narrow(1.15) }), // E
    frame({ t: 0.8, bs: { mouthFunnel: 0.6, jawOpen: 0.3 }, edit: (lm) => { narrow(0.85)(lm); openJaw(6)(lm); } }), // O
    frame({ t: 0.9, bs: { mouthPucker: 0.8 }, edit: narrow(0.75) }), // U
    frame({ t: 1.0, bs: { mouthPressLeft: 0.5, mouthPressRight: 0.5, mouthClose: 0.2 } }), // MBP
    frame({ t: 1.1, bs: { mouthRollLower: 0.6, mouthUpperUpLeft: 0.2, mouthUpperUpRight: 0.2 } }), // FV
    frame({ t: 1.2, bs: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.85 }, edit: closeEyes }), // blink
    frame({ t: 1.3 }), frame({ t: 1.4 }),
  ];
  const sel = selectKeyframes(frames);
  assert.ok([0, 1, 2, 13, 14].includes(sel.rest), `rest ${sel.rest}`);
  assert.equal(sel.keys.AA.index, 4, 'the blurred and the turned frames are refused');
  assert.equal(sel.keys.E.index, 7);
  assert.equal(sel.keys.O.index, 8);
  assert.equal(sel.keys.U.index, 9);
  assert.equal(sel.keys.MBP.index, 10);
  assert.equal(sel.keys.FV.index, 11);
  assert.equal(sel.blink.index, 12);
  // `available` limits the choice to frames whose pixels were kept.
  const sel2 = selectKeyframes(frames.map((f) => ({ ...f, geo: null, motion: null })), { available: new Set([0, 1, 2, 3, 7, 8, 9, 12, 13]) });
  assert.equal(sel2.keys.AA.index, 3);
  assert.equal(sel2.keys.MBP, undefined, 'no kept frame shows pressed lips, so that shape falls back to the drawn mouth');
});

test('selectKeyframes: a still rest stretch beats a closed frame in the middle of a word', () => {
  const frames = [
    frame({ t: 0, bs: { jawOpen: 0.05 } }), frame({ t: 0.1, bs: { jawOpen: 0.05 } }), frame({ t: 0.2, bs: { jawOpen: 0.05 } }),
    frame({ t: 0.3, bs: { jawOpen: 0.6 }, edit: openJaw(12) }),
    frame({ t: 0.4 }), // perfectly closed, but between two open frames
    frame({ t: 0.5, bs: { jawOpen: 0.6 }, edit: openJaw(12) }),
  ];
  const sel = selectKeyframes(frames);
  assert.ok(sel.rest <= 2, `rest ${sel.rest}`);
});

test('selectKeyframes on the recorded synthetic clip finds rest, mouth shapes and the blink', () => {
  const frames = rec.frames.map((f) => {
    if (!f.ok) return f;
    const lm = [];
    rec.keep.forEach((k, j) => (lm[k] = [f.lm[2 * j], f.lm[2 * j + 1]]));
    return { ...f, lm };
  });
  assert.equal(frames.length, 150);
  const sel = selectKeyframes(frames);
  const t = (i) => frames[i].t;
  // The clip: still until 0.6 s, the phrase until about 4 s (with pauses), blinks near 4.9 s and
  // 5.7 s, then still. Rest must be a closed mouth inside a still stretch: the start, a pause, or the end.
  for (const i of [sel.rest - 1, sel.rest, sel.rest + 1]) assert.ok(frames[i].geo.gap < 0.02, `rest at ${t(sel.rest)} s is inside a closed, still stretch`);
  for (const k of ['AA', 'E', 'U']) {
    assert.ok(sel.keys[k], `found ${k}`);
    assert.ok(t(sel.keys[k].index) > 0.6 && t(sel.keys[k].index) < 4.2, `${k} at ${t(sel.keys[k].index)} s, inside the phrase`);
  }
  assert.ok(sel.blink, 'found the blink');
  assert.ok(t(sel.blink.index) > 4.6 && t(sel.blink.index) < 6, `blink at ${t(sel.blink.index)} s`);
  // Every chosen frame aligns to the rest frame closely on the stable points.
  for (const k of Object.values(sel.keys)) assert.ok(k.residual < 0.05);
});

test('buildClip keeps valid patches, refuses bad ones, and measures displacements in the lower face only', () => {
  const { points, kinds } = buildMesh(L, fx.size);
  const patch = (x, y) => ({ image: 'data:image/webp;base64,UklGRg==', x, y, w: 60, h: 40 });
  const aa = L.map((p) => [p[0], p[1]]);
  openJaw(10)(aa);
  for (const i of [152, 148, 176, 377, 400]) aa[i][1] += 8;
  const clip = {
    source: 'video',
    frames: 150,
    keys: {
      AA: { landmarks: aa, patch: patch(200, 280) },
      E: { landmarks: aa, patch: { ...patch(200, 280), image: 'javascript:alert(1)' } },
      O: { landmarks: aa, patch: patch(500, 280) },
      U: { landmarks: aa.map((p) => [p[0] + 400, p[1]]), patch: patch(200, 280) },
    },
  };
  const out = buildClip(clip, L, points, kinds, fx.size);
  assert.deepEqual(Object.keys(out.shapes), ['AA'], 'bad image, out-of-frame patch and an implausible shift are refused');
  const d = out.shapes.AA.d;
  const moved = new Set();
  for (let k = 0; k < d.length; k += 3) moved.add(d[k]);
  assert.ok(moved.has(14) && moved.has(152), 'lower lip and chin move');
  assert.ok(!moved.has(159) && !moved.has(10), 'eyes and forehead stay');
  assert.equal(out.shapes.AA.pts.length, MOUTH_PATCH_POINTS.length * 2);
  assert.equal(out.source, 'video');
  // The whole avatar build accepts a clip bake and records it.
  const image = 'data:image/jpeg;base64,' + Buffer.from('fake').toString('base64');
  const { html, clip: info } = buildAvatarHtml({
    bake: { size: fx.size, image, landmarks: L, clip },
    consent: { name: 'Test', statement: 'Test fixture, public domain painting.', method: 'video' },
  });
  assert.deepEqual(info.shapes, ['AA']);
  const data = JSON.parse(html.match(/<script id="selfclone-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.consent.method, 'video');
  assert.ok(data.clip.shapes.AA);
});
