// Assemble the standalone avatar.html from a bake record and a consent record.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildMesh, N_FACE, KIND, FACE_OVAL, MOUTH_PATCH_POINTS, EYE_REGIONS, EYE_PATCH_POINTS, faceFrame, smoothstep } from '../../face/lib/geometry.js';
import { CLIP_CLASSES } from '../../face/lib/clip.js';
import { FACE_DIR } from './http.mjs';
import { jsonForScript, escapeHtml, VERSION } from '../util.mjs';

const r1 = (x) => Math.round(x * 10) / 10;

export function stripExports(src) {
  return src.replace(/^export\s+(?=(?:async\s+)?function|const|let|class)/gm, '');
}

export function validateBake(bake) {
  if (!bake || typeof bake !== 'object') throw new Error('Bake record missing');
  if (!Array.isArray(bake.landmarks) || bake.landmarks.length < N_FACE) throw new Error(`Bake record needs at least ${N_FACE} landmarks`);
  if (typeof bake.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(bake.image)) throw new Error('Bake record image must be a data URL');
  if (!(bake.size > 32 && bake.size <= 2048)) throw new Error('Bake record size out of range');
  for (const p of bake.landmarks) if (!Array.isArray(p) || p.length < 2 || !p.every(Number.isFinite)) throw new Error('Bad landmark');
}

export function validateConsent(consent) {
  if (!consent || typeof consent !== 'object') throw new Error('Consent record missing');
  const name = String(consent.name || '').trim();
  const statement = String(consent.statement || '').trim();
  if (statement.length < 8) throw new Error('Consent statement missing');
  return {
    name: name.slice(0, 120),
    statement: statement.slice(0, 600),
    date: consent.date || new Date().toISOString(),
    method: ['webcam', 'clip', 'video'].includes(consent.method) ? consent.method : 'photo',
  };
}

const DATA_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PATCH_CHARS = 200000;

function validPatch(p, size) {
  if (!p || typeof p !== 'object' || typeof p.image !== 'string' || p.image.length > MAX_PATCH_CHARS || !DATA_IMG.test(p.image)) return false;
  const { x, y, w, h } = p;
  if (![x, y, w, h].every(Number.isInteger)) return false;
  return x >= 0 && y >= 0 && w >= 8 && h >= 8 && x + w <= size && y + h <= size;
}

function validLandmarks(lm, size) {
  return Array.isArray(lm) && lm.length >= N_FACE && lm.slice(0, N_FACE).every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) < 4 * size && Math.abs(p[1]) < 4 * size);
}

/**
 * The clip part of the avatar data: for each mouth shape found in the clip, the patch image, its
 * landmarks in patch pixels, and the measured displacement of every mesh point (sparse, in pixels),
 * so the mesh takes the real shape and the patch lands on it without stretching. Shapes whose
 * patch or landmarks are missing or implausible are left out, and the drawn mouth is used for them.
 */
export function buildClip(clip, L, points, kinds, size) {
  if (!clip || typeof clip !== 'object') return null;
  const fr = faceFrame(L);
  const { ey, mw } = fr;
  const M = fr.mouth;
  const tOf = (p) => (p[0] - M[0]) * ey[0] + (p[1] - M[1]) * ey[1];
  const tNose = tOf(L[1]);
  const tLip = tOf(L[0]);
  // 0 at the nose tip and above (skull), 1 from the upper lip down (lips, jaw, chin).
  const lowerW = (p) => smoothstep(tNose, tLip, tOf(p));
  const nearestOval = new Map();
  for (let i = 0; i < points.length; i++) {
    if (kinds[i] !== KIND.RING1 && kinds[i] !== KIND.RING2) continue;
    let best = FACE_OVAL[0];
    let bd = Infinity;
    for (const j of FACE_OVAL) {
      const d = Math.hypot(points[i][0] - L[j][0], points[i][1] - L[j][1]);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    nearestOval.set(i, best);
  }
  const sparse = (lm, weightOf, ringFactor) => {
    const d = [];
    let max = 0;
    for (let i = 0; i < points.length; i++) {
      let j = i;
      let w;
      if (kinds[i] === KIND.FACE) w = weightOf(i);
      else if (ringFactor && nearestOval.has(i)) {
        j = nearestOval.get(i);
        w = weightOf(j) * (kinds[i] === KIND.RING1 ? ringFactor : ringFactor * 0.3);
      } else continue;
      if (!w) continue;
      const dx = (lm[j][0] - L[j][0]) * w;
      const dy = (lm[j][1] - L[j][1]) * w;
      if (Math.hypot(dx, dy) < 0.15) continue;
      max = Math.max(max, Math.hypot(dx, dy));
      d.push(i, r1(dx), r1(dy));
    }
    return { d, max };
  };
  const patchPts = (lm, idx, p) => idx.flatMap((i) => [r1(lm[i][0] - p.x), r1(lm[i][1] - p.y)]);
  const shapes = {};
  for (const cls of CLIP_CLASSES) {
    const k = clip.keys && clip.keys[cls];
    if (!k || !validLandmarks(k.landmarks, size) || !validPatch(k.patch, size)) continue;
    const { d, max } = sparse(k.landmarks, (i) => lowerW(L[i]), 0.5);
    if (max > 0.9 * mw) continue; // implausible: a misaligned frame
    const { image, x, y, w, h } = k.patch;
    shapes[cls] = { image, x, y, w, h, pts: patchPts(k.landmarks, MOUTH_PATCH_POINTS, k.patch), d };
  }
  let blink = null;
  const b = clip.blink;
  if (b && validLandmarks(b.landmarks, size) && Array.isArray(b.eyes) && b.eyes.length === 2 && b.eyes.every((e) => validPatch(e, size))) {
    const eyeW = new Map();
    for (const e of EYE_REGIONS) {
      for (const i of e.contour) eyeW.set(i, 1);
      for (const i of e.ring1) eyeW.set(i, 1);
      for (const i of e.ring2) eyeW.set(i, 0.6);
    }
    const { d, max } = sparse(b.landmarks, (i) => eyeW.get(i) || 0, 0);
    if (max < 0.5 * fr.iod) {
      blink = {
        d,
        eyes: b.eyes.map((e, k) => ({ image: e.image, x: e.x, y: e.y, w: e.w, h: e.h, pts: patchPts(b.landmarks, EYE_PATCH_POINTS[k], e) })),
      };
    }
  }
  const int = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  return {
    version: 1,
    source: clip.source === 'video' ? 'video' : 'clip',
    frames: int(clip.frames),
    usable: int(clip.usable),
    seconds: Number.isFinite(clip.seconds) ? r1(clip.seconds) : 0,
    shapes,
    blink,
  };
}

export function buildAvatarHtml({ bake, consent, glasses = false }) {
  validateBake(bake);
  const c = validateConsent(consent);
  const L = bake.landmarks.map((p) => [r1(p[0]), r1(p[1]), r1(p[2] || 0)]);
  const { points, kinds, triangles } = buildMesh(L, bake.size);
  const photoSha256 = createHash('sha256').update(Buffer.from(bake.image.split(',')[1], 'base64')).digest('hex');
  const clip = bake.clip ? buildClip(bake.clip, L, points, kinds, bake.size) : null;
  const data = {
    version: 1,
    size: bake.size,
    image: bake.image,
    landmarks: L,
    points: points.map((p) => [r1(p[0]), r1(p[1]), r1(p[2] || 0)]),
    kinds,
    triangles: triangles.flat(),
    glasses: !!glasses,
    clip,
    consent: { ...c, photoSha256 },
    checks: bake.checks
      ? {
          pose: bake.checks.pose,
          frontal: bake.checks.frontal,
          mouthClosed: bake.checks.mouthClosed,
          eyesOpen: bake.checks.eyesOpen,
          glassesLikely: bake.checks.glassesLikely,
        }
      : null,
    tool: { name: 'selfclone', version: VERSION, bakedAt: new Date().toISOString() },
  };
  const template = fs.readFileSync(path.join(FACE_DIR, 'avatar.html'), 'utf8');
  const geometry = stripExports(fs.readFileSync(path.join(FACE_DIR, 'lib', 'geometry.js'), 'utf8'));
  const runtime = fs.readFileSync(path.join(FACE_DIR, 'lib', 'runtime.js'), 'utf8');
  const title = c.name ? `${c.name}: AI clone` : 'AI clone';
  const html = template
    .replace('__SELFCLONE_TITLE__', () => escapeHtml(title))
    .replace('"__SELFCLONE_DATA__"', () => jsonForScript(data))
    .replace('/*__SELFCLONE_GEOMETRY__*/', () => geometry.replace(/<\/script/gi, '<\\/script'))
    .replace('/*__SELFCLONE_RUNTIME__*/', () => runtime.replace(/<\/script/gi, '<\\/script'));
  const clipInfo = clip
    ? { shapes: Object.keys(clip.shapes), blink: !!clip.blink, frames: clip.frames, bytes: Buffer.byteLength(JSON.stringify(clip)) }
    : null;
  return { html, triangles: triangles.length, points: points.length, landmarks: bake.landmarks.length, photoSha256, clip: clipInfo };
}
