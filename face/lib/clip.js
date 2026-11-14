// selfclone clip enrolment: keyframe selection and alignment math.
// Plain ES module with no DOM access, shared by the browser (enrol page and
// video bake) and Node (unit tests, avatar build). A short clip of the user
// reading ENROL_PHRASE and blinking gives real frames for the open mouth
// shapes and the closed eyes; this file decides which frames to keep and how
// to map them onto the rest frame.

import { RIGHT_EYE_UPPER, RIGHT_EYE_LOWER, LEFT_EYE_UPPER, LEFT_EYE_LOWER } from './geometry.js';

/** Covers AA (ah, fast, vans), E (see, cheap), O (oh, boat), U and W (why, would, you, move), MBP (move, big, boat), FV (five, fast, vans). */
export const ENROL_PHRASE = 'Ah, I see. Oh, why would you move a big cheap boat? Five fast vans.';
export const CLIP_SECONDS = 10;
export const CLIP_FPS = 15;
/** Mouth shapes taken from the clip. Rest is the base photo; blink is handled separately. */
export const CLIP_CLASSES = ['AA', 'E', 'O', 'U', 'MBP', 'FV'];

/** Points that move with the skull, not with the mouth or the eyelids: eye corners, nose bridge, forehead, upper face contour. */
export const STABLE_POINTS = [33, 133, 362, 263, 168, 6, 197, 195, 5, 4, 10, 151, 9, 8, 234, 454, 127, 356, 162, 389, 21, 251, 54, 284, 103, 332, 109, 338, 67, 297];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- alignment ----

/**
 * Least-squares similarity transform (rotation, uniform scale, translation) mapping src onto dst.
 * Returns {a, b, tx, ty}: x' = a x - b y + tx, y' = b x + a y + ty.
 */
export function fitSimilarity(src, dst) {
  const n = Math.min(src.length, dst.length);
  if (n < 2) throw new Error('fitSimilarity needs at least two points');
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1];
  }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx;
    const py = src[i][1] - sy;
    const qx = dst[i][0] - dx;
    const qy = dst[i][1] - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  if (den < 1e-9) throw new Error('fitSimilarity: degenerate points');
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, c: -b, d: a, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

/** Least-squares affine transform mapping src onto dst. Returns {a, b, c, d, tx, ty}: x' = a x + c y + tx, y' = b x + d y + ty. */
export function fitAffine(src, dst) {
  const n = Math.min(src.length, dst.length);
  if (n < 3) throw new Error('fitAffine needs at least three points');
  // Normal equations for [x y 1] -> x' and -> y'.
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0;
  let bx = [0, 0, 0];
  let by = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y;
    bx = [bx[0] + x * u, bx[1] + y * u, bx[2] + u];
    by = [by[0] + x * v, by[1] + y * v, by[2] + v];
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const solve = (rhs) => {
    const A = M.map((r, i) => [...r, rhs[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      if (Math.abs(A[c][c]) < 1e-12) throw new Error('fitAffine: degenerate points');
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
      }
    }
    return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
  };
  const [a, c, tx] = solve(bx);
  const [b, d, ty] = solve(by);
  return { a, b, c, d, tx, ty };
}

export function applyTransform(T, p) {
  return [T.a * p[0] + T.c * p[1] + T.tx, T.b * p[0] + T.d * p[1] + T.ty];
}

/** Root mean square distance between T(src) and dst. */
export function alignmentResidual(T, src, dst) {
  let s = 0;
  for (let i = 0; i < src.length; i++) {
    const q = applyTransform(T, src[i]);
    s += (q[0] - dst[i][0]) ** 2 + (q[1] - dst[i][1]) ** 2;
  }
  return Math.sqrt(s / Math.max(1, src.length));
}

/** Similarity transform from a frame's landmarks onto the rest landmarks, fitted on the stable points only. */
export function alignToRest(lm, restLm, points = STABLE_POINTS) {
  const src = points.map((i) => lm[i]);
  const dst = points.map((i) => restLm[i]);
  const T = fitSimilarity(src, dst);
  return { T, residual: alignmentResidual(T, src, dst) };
}

// ---- per-frame measurements ----

const centroid = (L, idx) => {
  let x = 0, y = 0;
  for (const i of idx) {
    x += L[i][0]; y += L[i][1];
  }
  return [x / idx.length, y / idx.length];
};

/** Geometry of one frame from pixel landmarks: inter-ocular distance, mouth width and gap, eye openness. */
export function frameGeometry(lm) {
  const eyeR = centroid(lm, RIGHT_EYE_UPPER.concat(RIGHT_EYE_LOWER));
  const eyeL = centroid(lm, LEFT_EYE_UPPER.concat(LEFT_EYE_LOWER));
  const iod = D(eyeL, eyeR) || 1;
  const mw = D(lm[61], lm[291]);
  const gap = D(lm[13], lm[14]);
  const eyeOpen = (D(lm[159], lm[145]) / (D(lm[33], lm[133]) || 1) + D(lm[386], lm[374]) / (D(lm[263], lm[362]) || 1)) / 2;
  return { iod, width: mw / iod, gap: gap / (mw || 1), height: D(lm[0], lm[17]) / iod, eyeOpen };
}

/** Root mean square motion of the stable points between two frames, in inter-ocular distances. */
export function stableMotion(a, b, iod) {
  if (!a || !b) return 0;
  let s = 0;
  for (const i of STABLE_POINTS) s += (a[i][0] - b[i][0]) ** 2 + (a[i][1] - b[i][1]) ** 2;
  return Math.sqrt(s / STABLE_POINTS.length) / (iod || 1);
}

/**
 * Raw shape scores for one frame (higher means a clearer example of that shape; null when the
 * frame does not show the shape at all). `ref` holds clip medians: {width, eyeOpen}.
 */
export function shapeScores(f, ref = {}) {
  const b = (k) => (f.bs && Number.isFinite(f.bs[k]) ? f.bs[k] : 0);
  const g = f.geo || frameGeometry(f.lm);
  const jaw = b('jawOpen');
  const funnel = b('mouthFunnel');
  const pucker = b('mouthPucker');
  const smile = (b('mouthSmileLeft') + b('mouthSmileRight')) / 2;
  const stretch = (b('mouthStretchLeft') + b('mouthStretchRight')) / 2;
  const press = (b('mouthPressLeft') + b('mouthPressRight')) / 2;
  const close = b('mouthClose');
  const rollL = b('mouthRollLower');
  const rollU = b('mouthRollUpper');
  const upperUp = (b('mouthUpperUpLeft') + b('mouthUpperUpRight')) / 2;
  const blinkMin = Math.min(b('eyeBlinkLeft'), b('eyeBlinkRight'));
  const blinkMax = Math.max(b('eyeBlinkLeft'), b('eyeBlinkRight'));
  const wRef = ref.width || g.width;
  // M, B, P and F, V are measured against the rest frame once it is known: a relaxed mouth already
  // presses a little, and only a clear change from rest is worth a patch.
  const restPressed = ref.restPressed || 0;
  const restRoll = ref.restRoll || 0;
  const wide = g.width / wRef - 1; // >0 wider than usual, <0 narrower
  const eRef = ref.eyeOpen || g.eyeOpen || 1;
  const s = {};
  // Rest: everything relaxed, lips together, eyes open.
  s.rest = 1 - (jaw + funnel + pucker + smile + stretch + press + rollL + rollU + blinkMax + 4 * g.gap + 2 * Math.abs(wide));
  // AA: jaw clearly open, lips not rounded.
  // Geometry counts as much as the blendshape: jawOpen under-reads some faces and lighting.
  s.AA = jaw > 0.12 || g.gap > 0.15 ? jaw + g.gap - 0.3 * funnel - 0.3 * pucker - Math.max(0, -wide) : null;
  // E: lips spread wide (smile or stretch), mouth a little open.
  const spread = smile + stretch + 2.5 * Math.max(0, wide);
  s.E = spread > 0.18 && funnel < 0.35 && pucker < 0.35 ? spread + 0.3 * Math.min(g.gap, 0.3) + 0.3 * upperUp - 0.5 * (funnel + pucker) : null;
  // O: rounded and open.
  const narrow = Math.max(0, -wide);
  s.O = (funnel > 0.15 || narrow > 0.06) && (jaw > 0.08 || g.gap > 0.12) ? funnel + 2 * narrow + 0.4 * Math.min(jaw, 0.5) + 0.2 * Math.min(g.gap, 0.4) - 0.5 * smile : null;
  // U and W: pursed, nearly closed.
  s.U = pucker > 0.2 || narrow > 0.12 ? pucker + 2.5 * narrow - 0.6 * jaw - 0.4 * smile : null;
  // M, B, P: lips pressed together.
  const pressed = press + close + 0.5 * (rollL + rollU);
  s.MBP = pressed - restPressed > 0.1 && g.gap < 0.06 && jaw < 0.25 ? pressed - restPressed - 2 * g.gap - jaw : null;
  // F and V: lower lip rolled in under the upper teeth.
  s.FV = rollL - restRoll > 0.2 && pucker < 0.5 ? rollL - restRoll + 0.4 * upperUp - 0.4 * pucker - 0.3 * funnel : null;
  // Blink: both eyes closed.
  const shut = 1 - g.eyeOpen / eRef;
  // The lids must close by at least 30% of their usual opening; the most closed frame wins.
  s.blink = shut > 0.3 && (blinkMin > 0.15 || shut > 0.6) ? blinkMin + 0.5 * shut : null;
  s.pressed = pressed;
  s.roll = rollL;
  return s;
}

/**
 * Frame quality in [0, 1]: sharp (Laplacian variance of the mouth region against the clip median;
 * a motion-blurred frame drops far below it), in the clip's usual head pose, and not moving.
 */
export function frameQuality(f, ref = {}) {
  if (f.ok === false) return 0;
  const yaw = f.pose?.yaw || 0;
  const pitch = f.pose?.pitch || 0;
  // Head turned away from where it usually is in this clip.
  const dev = Math.abs(yaw - (ref.yaw || 0)) + Math.abs(pitch - (ref.pitch || 0));
  if (dev > 10) return 0;
  const sharpRef = ref.sharp || f.sharp || 1;
  const sharp = Number.isFinite(f.sharp) ? f.sharp / sharpRef : 1;
  if (sharp < 0.2) return 0;
  const sharpF = clamp(0.5 + 0.5 * sharp, 0, 1);
  const poseF = (1 - dev / 25) * (1 - Math.min(0.3, (Math.abs(yaw) + Math.abs(pitch)) / 100));
  const motionF = 1 / (1 + (f.motion || 0) / 0.04);
  return sharpF * poseF * motionF;
}

/** Clip medians used as references by the scores. */
export function clipReference(frames) {
  const good = frames.filter((f) => f && f.ok !== false && f.lm);
  const geo = good.map((f) => f.geo || frameGeometry(f.lm));
  return {
    width: median(geo.map((g) => g.width)),
    eyeOpen: median(geo.map((g) => g.eyeOpen)),
    sharp: median(good.map((f) => f.sharp)),
    iod: median(geo.map((g) => g.iod)),
    yaw: median(good.map((f) => f.pose?.yaw || 0)),
    pitch: median(good.map((f) => f.pose?.pitch || 0)),
  };
}

/**
 * Pick the keyframes of a clip. `frames`: [{lm: [[x, y, z]...] pixels, bs: {blendshape: score},
 * pose: {yaw, pitch}, sharp, ok}]. Options: `available` (Set of indices that may be chosen,
 * for example those whose pixels were kept), `maxResidual` (stable-point misfit after alignment
 * to the rest frame, in inter-ocular distances, above which a frame is refused).
 * Returns {rest, keys: {AA: {index, score, residual}, ...}, blink, ref, used}.
 */
export function selectKeyframes(frames, { available = null, maxResidual = 0.05 } = {}) {
  const ok = (i) => frames[i] && frames[i].ok !== false && frames[i].lm && (!available || available.has(i));
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f || !f.lm) continue;
    f.geo = f.geo || frameGeometry(f.lm);
    if (f.motion == null) {
      const prev = i > 0 && frames[i - 1] && frames[i - 1].lm ? frames[i - 1].lm : null;
      const next = i + 1 < frames.length && frames[i + 1] && frames[i + 1].lm ? frames[i + 1].lm : null;
      f.motion = Math.max(stableMotion(f.lm, prev, f.geo.iod), stableMotion(f.lm, next, f.geo.iod));
    }
  }
  const ref = clipReference(frames);
  const scored = [];
  for (let i = 0; i < frames.length; i++) {
    if (!ok(i)) continue;
    const q = frameQuality(frames[i], ref);
    if (q <= 0) continue;
    scored.push({ i, q, s: shapeScores(frames[i], ref) });
  }
  if (!scored.length) return { rest: -1, keys: {}, blink: null, ref, used: 0 };
  // Rest first: it becomes the base photo, and every other frame is aligned to it. A good rest
  // frame sits inside a still, relaxed stretch, so it takes the worst rest score of itself and its
  // neighbours (a frame between two syllables can look closed and still be mid-word).
  const restRaw = frames.map((f) => (f && f.ok !== false && f.lm ? shapeScores(f, ref).rest : -Infinity));
  let rest = null;
  for (const c of scored) {
    const near = [restRaw[c.i]];
    if (c.i > 0) near.push(restRaw[c.i - 1]);
    if (c.i + 1 < frames.length) near.push(restRaw[c.i + 1]);
    const v = Math.min(...near) * c.q;
    if (!rest || v > rest.v) rest = { i: c.i, v };
  }
  const restLm = frames[rest.i].lm;
  const iod = frames[rest.i].geo.iod;
  const restS = scored.find((c) => c.i === rest.i).s;
  const ref2 = { ...ref, restPressed: restS.pressed, restRoll: restS.roll };
  for (const c of scored) c.s = shapeScores(frames[c.i], ref2);
  const keys = {};
  let blink = null;
  for (const cls of [...CLIP_CLASSES, 'blink']) {
    let best = null;
    for (const c of scored) {
      if (c.i === rest.i) continue;
      const raw = c.s[cls];
      if (raw == null || raw <= 0) continue;
      const { residual } = alignToRest(frames[c.i].lm, restLm);
      const r = residual / iod;
      if (r > maxResidual) continue;
      const v = (raw * c.q) / (1 + r / 0.02);
      if (!best || v > best.score) best = { index: c.i, score: v, raw, residual: r };
    }
    if (cls === 'blink') blink = best;
    else if (best) keys[cls] = best;
  }
  return { rest: rest.i, restScore: rest.v, keys, blink, ref, used: scored.length };
}

/** Index of the frame closest to `t` seconds in a list of frames with `t` fields (for tests and tooling). */
export function frameAt(frames, t) {
  let best = 0;
  for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[best].t - t)) best = i;
  return best;
}
