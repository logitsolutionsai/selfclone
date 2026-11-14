import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  delaunay, buildMesh, createRig, pointInPolygon, textToVisemes, visemeAt, VISEMES, INNER_LIP_RING,
  UPPER_INNER, LOWER_INNER, NOSE_TIP, HEAD_CAP_DEG, faceFrame,
} from '../../face/lib/geometry.js';
import { buildAvatarHtml, stripExports } from '../../src/face/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'mona-lisa-landmarks.json'), 'utf8'));
const L = fx.landmarks;
const S = fx.size;

test('Delaunay triangulates a square grid without overlaps', () => {
  const pts = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) pts.push([x * 10, y * 10]);
  const tris = delaunay(pts);
  assert.equal(tris.length, 2 * 4 * 4);
  let area = 0;
  for (const [a, b, c] of tris) area += Math.abs((pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1])) / 2;
  assert.ok(Math.abs(area - 1600) < 1e-6, `total area ${area}`);
});

test('face mesh covers the frame and never bridges the mouth opening', () => {
  const { points, triangles } = buildMesh(L, S);
  assert.ok(points.length > 468 && triangles.length > 800);
  const up = new Set(UPPER_INNER);
  const low = new Set(LOWER_INNER);
  for (const [a, b, c] of triangles) {
    assert.ok(!((up.has(a) || up.has(b) || up.has(c)) && (low.has(a) || low.has(b) || low.has(c))), 'no triangle joins upper and lower inner lip');
  }
  // Open the jaw: no triangle centroid may fall inside the opened mouth.
  const rig = createRig({ points, kinds: buildMesh(L, S).kinds, landmarks: L, size: S });
  const { pos } = rig.deform({ jaw: 1 });
  const P = (i) => [pos[2 * i], pos[2 * i + 1]];
  const openRing = INNER_LIP_RING.map(P);
  for (const [a, b, c] of triangles) {
    const cx = (pos[2 * a] + pos[2 * b] + pos[2 * c]) / 3;
    const cy = (pos[2 * a + 1] + pos[2 * b + 1] + pos[2 * c + 1]) / 3;
    assert.ok(!pointInPolygon([cx, cy], openRing), 'triangle inside the open mouth');
  }
  // Total area of the mesh is the whole frame minus the (closed) mouth sliver.
  let area = 0;
  for (const [a, b, c] of triangles) area += Math.abs((points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) - (points[c][0] - points[a][0]) * (points[b][1] - points[a][1])) / 2;
  assert.ok(area > 0.98 * S * S && area <= S * S + 1, `mesh area ${area}`);
});

test('rig: jaw opens the mouth downward, blink closes the eye, rest is identity', () => {
  const { points, kinds } = buildMesh(L, S);
  const rig = createRig({ points, kinds, landmarks: L, size: S });
  const fr = faceFrame(L);
  const rest = rig.deform({});
  for (let i = 0; i < points.length; i++) {
    assert.ok(Math.abs(rest.pos[2 * i] - points[i][0]) < 1e-3 && Math.abs(rest.pos[2 * i + 1] - points[i][1]) < 1e-3);
  }
  const open = rig.deform({ jaw: 1 });
  const down = (i) => (open.pos[2 * i] - L[i][0]) * fr.ey[0] + (open.pos[2 * i + 1] - L[i][1]) * fr.ey[1];
  assert.ok(down(14) > 0.3 * fr.mw, 'lower lip drops');
  assert.ok(Math.abs(down(13)) < 0.02 * fr.mw, 'upper lip stays');
  assert.ok(down(152) > 0.25 * fr.mw, 'chin follows the jaw');
  assert.ok(Math.abs(down(10)) < 0.5, 'forehead does not move');
  const rig2 = createRig({ points, kinds, landmarks: L, size: S });
  const closed = rig2.deform({ blinkR: 1, blinkL: 1 });
  const gapBefore = Math.abs(L[159][1] - L[145][1]);
  const gapAfter = Math.abs(closed.pos[2 * 159 + 1] - closed.pos[2 * 145 + 1]);
  assert.ok(gapAfter < 0.15 * gapBefore, `eye closes (${gapBefore.toFixed(1)} -> ${gapAfter.toFixed(1)})`);
  const glasses = createRig({ points, kinds, landmarks: L, size: S, glasses: true }).deform({ blinkR: 1, blinkL: 1 });
  assert.ok(Math.abs(glasses.pos[2 * 159 + 1] - L[159][1]) < 1e-3, 'glasses freeze the eyes');
});

test('rig: head motion at the cap moves the face but not the frame', () => {
  const { points, kinds } = buildMesh(L, S);
  const rig = createRig({ points, kinds, landmarks: L, size: S });
  const r = Math.PI / 180;
  const { pos } = rig.deform({ yaw: HEAD_CAP_DEG.yaw * r, pitch: HEAD_CAP_DEG.pitch * r, roll: HEAD_CAP_DEG.roll * r });
  const shift = Math.hypot(pos[2 * NOSE_TIP] - L[NOSE_TIP][0], pos[2 * NOSE_TIP + 1] - L[NOSE_TIP][1]);
  assert.ok(shift > 5 && shift < 0.1 * S, `nose shift ${shift.toFixed(1)} px`);
  for (let i = 0; i < points.length; i++) {
    if (kinds[i] === 3) assert.ok(Math.abs(pos[2 * i] - points[i][0]) < 1e-6 && Math.abs(pos[2 * i + 1] - points[i][1]) < 1e-6, 'frame anchors are static');
  }
});

test('text to visemes covers the viseme set with sensible rules', () => {
  const tl = textToVisemes('Bob ate five apples, then we shook it. Wow!');
  const seq = tl.segments.map((s) => s.v);
  assert.equal(seq[0], 'rest', 'b closes the lips');
  for (const v of ['AA', 'E', 'I', 'O', 'U', 'FV', 'L', 'rest']) assert.ok(seq.includes(v), `uses ${v}`);
  assert.ok(Object.keys(VISEMES).length === 8);
  assert.equal(tl.words.length, 9);
  assert.equal(tl.words[1].charIndex, 4);
  assert.ok(tl.total > 1000 && tl.total < 6000);
  assert.equal(visemeAt(tl, -1), 'rest');
  assert.equal(visemeAt(tl, tl.total + 1), 'rest');
  // Unknown scripts and digits still animate.
  const other = textToVisemes('你好 123');
  assert.ok(other.segments.some((s) => s.v === 'AA'));
  assert.equal(textToVisemes('').segments.length, 1);
});

test('buildAvatarHtml embeds data, strips exports, and loads nothing from the network', () => {
  const img = fs.readFileSync(path.join(here, '..', 'fixtures', 'mona-lisa.jpg')).toString('base64');
  const bake = { size: S, landmarks: L, image: `data:image/jpeg;base64,${img}`, checks: { frontal: false } };
  const { html, triangles, landmarks } = buildAvatarHtml({ bake, consent: { name: 'Test Person', statement: 'This is my own face.' } });
  assert.equal(landmarks, 478);
  assert.ok(triangles > 800);
  assert.ok(!/^\s*export\s/m.test(html.split('<script>')[1] || ''), 'no export keywords in the inline script');
  assert.ok(!/(?:src|href)=["']https?:/i.test(html));
  assert.ok(!/\bfetch\(\s*["']https?:/.test(html));
  assert.match(html, /<title>Test Person: AI clone<\/title>/);
  assert.match(html, /AI CLONE/);
  assert.equal(stripExports('export const a = 1;\nexport function f() {}'), 'const a = 1;\nfunction f() {}');
  assert.throws(() => buildAvatarHtml({ bake, consent: { statement: '' } }), /Consent/);
  assert.throws(() => buildAvatarHtml({ bake: { ...bake, landmarks: L.slice(0, 10) }, consent: { statement: 'This is my own face.' } }), /landmarks/);
});
