// Browser-side face detection for enrolment and photo baking.
// Loads MediaPipe Face Landmarker from `base` (the local server proxies and
// caches the pinned CDN files), runs the live checks, and turns one frame
// into the bake record that the Node side assembles into avatar.html.

import { MOUTH_RING, MOUTH_PATCH_POINTS, EYE_PATCH_POINTS, N_FACE } from './geometry.js';
import { CLIP_CLASSES, CLIP_FPS, ENROL_PHRASE, selectKeyframes, alignToRest, applyTransform, frameGeometry, stableMotion, shapeScores, frameQuality, clipReference } from './clip.js';

export const OUTPUT_SIZE = 512;

export async function loadLandmarker(base = '/mp', mode = 'IMAGE') {
  const vision = await import(`${base}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
  const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate: 'CPU' },
    runningMode: mode,
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  return landmarker;
}

const deg = (r) => (r * 180) / Math.PI;

export function poseFromMatrix(m) {
  // Column-major 4x4. Small-angle Euler extraction; signs are not important here.
  const R = (r, c) => m[c * 4 + r];
  const yaw = Math.asin(Math.max(-1, Math.min(1, R(0, 2))));
  const pitch = Math.atan2(-R(1, 2), R(2, 2));
  const roll = Math.atan2(-R(0, 1), R(0, 0));
  return { yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) };
}

export function blendMap(result) {
  const out = {};
  const cats = result.faceBlendshapes?.[0]?.categories || [];
  for (const c of cats) out[c.categoryName] = c.score;
  return out;
}

const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Heuristic glasses score: strong horizontal edges across the nose bridge,
 * where a frame's bridge sits. Returns a ratio; above ~2.4 suggests glasses.
 */
export function glassesScore(ctx, lm, w, h) {
  const p = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const eyeL = p(362);
  const eyeR = p(133);
  const iod = D(eyeL, eyeR);
  const top = p(168);
  const bottom = p(6);
  const cx = (top.x + bottom.x) / 2;
  const x0 = Math.max(0, Math.round(cx - 0.15 * iod));
  const x1 = Math.min(w - 1, Math.round(cx + 0.15 * iod));
  const y0 = Math.max(1, Math.round(top.y - 0.15 * iod));
  const y1 = Math.min(h - 2, Math.round(bottom.y));
  if (x1 - x0 < 3 || y1 - y0 < 4) return { score: 0, edge: 0 };
  const data = ctx.getImageData(x0, y0 - 1, x1 - x0 + 1, y1 - y0 + 3).data;
  const W = x1 - x0 + 1;
  const lum = (x, y) => {
    const k = (y * W + x) * 4;
    return 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
  };
  const rows = [];
  for (let y = 1; y <= y1 - y0 + 1; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) s += Math.abs(lum(x, y + 1) - lum(x, y - 1));
    rows.push(s / W);
  }
  const sorted = rows.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  return { score: max / (median + 2), edge: max };
}

/** Mean luma (0-255) over the face box, sampled every few pixels. */
export function faceLight(ctx, lm, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 468; i++) {
    x0 = Math.min(x0, lm[i].x * w); y0 = Math.min(y0, lm[i].y * h);
    x1 = Math.max(x1, lm[i].x * w); y1 = Math.max(y1, lm[i].y * h);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
  if (x1 - x0 < 4 || y1 - y0 < 4) return 0;
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let s = 0, n = 0;
  for (let k = 0; k < d.length; k += 4 * 5) {
    s += 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
    n++;
  }
  return n ? s / n : 0;
}

/** Variance of the Laplacian of luma over the mouth region: low values mean a blurred frame. */
export function mouthSharpness(ctx, lm, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of MOUTH_RING) {
    x0 = Math.min(x0, lm[i][0]); y0 = Math.min(y0, lm[i][1]);
    x1 = Math.max(x1, lm[i][0]); y1 = Math.max(y1, lm[i][1]);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
  const W = x1 - x0;
  const H = y1 - y0;
  if (W < 5 || H < 5) return 0;
  const d = ctx.getImageData(x0, y0, W, H).data;
  const Y = new Float32Array(W * H);
  for (let k = 0, j = 0; j < Y.length; k += 4, j++) Y[j] = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const j = y * W + x;
      const v = Y[j - 1] + Y[j + 1] + Y[j - W] + Y[j + W] - 4 * Y[j];
      s += v; s2 += v * v; n++;
    }
  }
  return n ? s2 / n - (s / n) ** 2 : 0;
}

/** Live and capture checks for one detection result. */
export function checkFrame(result, ctx, w, h) {
  const faces = result.faceLandmarks?.length || 0;
  const checks = { faces, oneFace: faces === 1 };
  if (faces !== 1) return checks;
  const lm = result.faceLandmarks[0];
  const pose = result.facialTransformationMatrixes?.[0] ? poseFromMatrix(result.facialTransformationMatrixes[0].data) : { yaw: 0, pitch: 0, roll: 0 };
  const bs = blendMap(result);
  const px = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const mw = D(px(61), px(291));
  const lipGap = D(px(13), px(14)) / (mw || 1);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of lm) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  const faceWidthPx = (maxX - minX) * w;
  const g = ctx ? glassesScore(ctx, lm, w, h) : { score: 0, edge: 0 };
  const blink = Math.max(bs.eyeBlinkLeft ?? 0, bs.eyeBlinkRight ?? 0);
  const light = ctx ? faceLight(ctx, lm, w, h) : 128;
  Object.assign(checks, {
    pose,
    frontal: Math.abs(pose.yaw) <= 10 && Math.abs(pose.pitch) <= 10,
    lipGap,
    jawOpen: bs.jawOpen ?? 0,
    mouthClosed: (bs.jawOpen ?? 0) < 0.15 && lipGap < 0.08,
    eyeBlink: blink,
    eyesOpen: blink < 0.5,
    faceWidthPx,
    resolutionOk: faceWidthPx >= 160,
    light,
    lightOk: light >= 50,
    glassesScore: g.score,
    glassesEdge: g.edge,
    glassesLikely: g.score > 2.4 && g.edge > 12,
  });
  checks.ok = checks.oneFace && checks.frontal && checks.mouthClosed && checks.eyesOpen && checks.resolutionOk;
  return checks;
}

/**
 * Crop a square around the face, resize to at most OUTPUT_SIZE, and return
 * the bake record: image data URL, 478 landmarks in output pixels, checks.
 */
export function makeBakeRecord(source, result, checks, { quality = 0.9 } = {}) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const lm = result.faceLandmarks[0];
  const oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  let cx = 0;
  let cy = 0;
  for (const i of oval) {
    cx += lm[i].x * w;
    cy += lm[i].y * h;
  }
  cx /= oval.length;
  cy /= oval.length;
  const faceH = D({ x: lm[10].x * w, y: lm[10].y * h }, { x: lm[152].x * w, y: lm[152].y * h });
  let side = Math.round(2.0 * faceH);
  // Keep the face a little above centre so shoulders show.
  let sx = Math.round(cx - side / 2);
  let sy = Math.round(cy - side * 0.46);
  const out = Math.min(OUTPUT_SIZE, side);
  const scale = out / side;
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const c = canvas.getContext('2d');
  // Fill with the average border colour in case the crop extends past the photo.
  const tmp = document.createElement('canvas');
  tmp.width = 8;
  tmp.height = 8;
  const tc = tmp.getContext('2d');
  tc.drawImage(source, 0, 0, 8, 8);
  const td = tc.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let k = 0; k < td.length; k += 4) {
    r += td[k];
    g += td[k + 1];
    b += td[k + 2];
  }
  const nPix = td.length / 4;
  c.fillStyle = `rgb(${Math.round(r / nPix)},${Math.round(g / nPix)},${Math.round(b / nPix)})`;
  c.fillRect(0, 0, out, out);
  c.imageSmoothingQuality = 'high';
  c.drawImage(source, sx, sy, side, side, 0, 0, out, out);
  const landmarks = lm.map((p) => [
    Math.round(((p.x * w - sx) * scale) * 10) / 10,
    Math.round(((p.y * h - sy) * scale) * 10) / 10,
    Math.round(p.z * w * scale * 10) / 10,
  ]);
  return {
    version: 1,
    size: out,
    image: canvas.toDataURL('image/jpeg', quality),
    landmarks,
    checks,
    blendshapes: blendMap(result),
    source: { width: w, height: h, crop: { x: sx, y: sy, side } },
  };
}

export async function imageFromUrl(url) {
  const img = new Image();
  img.decoding = 'sync';
  img.src = url;
  await img.decode();
  return img;
}

/** Full photo bake: detect, check, crop. Throws on zero or several faces. */
export async function bakePhoto(url, { base = '/mp' } = {}) {
  const img = await imageFromUrl(url);
  const landmarker = await loadLandmarker(base, 'IMAGE');
  try {
    const result = landmarker.detect(img);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const checks = checkFrame(result, ctx, w, h);
    if (checks.faces === 0) throw new Error('No face found in the photo.');
    if (checks.faces > 1) throw new Error('More than one face found. Use a photo with only your face.');
    return makeBakeRecord(img, result, checks);
  } finally {
    landmarker.close();
  }
}

// ---------------------------------------------------------------------------
// Clip enrolment: a short clip of the user reading the enrol phrase and
// blinking. Frames are measured as they arrive; only the few frames that are
// currently the best candidate for some mouth shape keep their pixels, in
// memory. Nothing is recorded or exported: the clip itself is never stored.

const r1 = (x) => Math.round(x * 10) / 10;

export class ClipCollector {
  constructor({ keep = 3 } = {}) {
    this.keep = keep;
    this.frames = [];
    this.snaps = new Map();
    this.top = {};
    this.multi = 0;
    this.lastOk = null;
  }

  /** Measure one frame drawn on `canvas` (context `ctx`) with its landmarker result. Returns the live checks. */
  add(canvas, ctx, result, t) {
    const w = canvas.width;
    const h = canvas.height;
    const checks = checkFrame(result, ctx, w, h);
    if (!checks.oneFace) {
      if (checks.faces > 1) this.multi++;
      this.frames.push({ ok: false, t, faces: checks.faces });
      return checks;
    }
    const lmN = result.faceLandmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const lm = lmN.map((p) => [p.x * w, p.y * h, p.z * w]);
    const f = { t, ok: true, lm, lmN, bs: blendMap(result), pose: checks.pose, checks, w, h };
    f.sharp = mouthSharpness(ctx, lm, w, h);
    f.geo = frameGeometry(lm);
    f.motion = stableMotion(lm, this.lastOk && this.lastOk.lm, f.geo.iod);
    this.lastOk = f;
    const index = this.frames.length;
    this.frames.push(f);
    const ref = clipReference(this.frames);
    const q = checks.lightOk ? frameQuality(f, ref) : 0;
    if (q > 0) {
      const s = shapeScores(f, ref);
      let wanted = false;
      for (const cls of ['rest', ...CLIP_CLASSES, 'blink']) {
        const v = s[cls];
        if (v == null || v <= 0) continue;
        const list = (this.top[cls] = this.top[cls] || []);
        const cap = cls === 'rest' ? this.keep + 2 : this.keep;
        const score = v * q;
        if (list.length < cap || score > list[list.length - 1].score) {
          list.push({ index, score });
          list.sort((a, b) => b.score - a.score);
          list.length = Math.min(list.length, cap);
          if (list.some((x) => x.index === index)) wanted = true;
        }
      }
      if (wanted) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(canvas, 0, 0);
        this.snaps.set(index, c);
        const live = new Set();
        for (const list of Object.values(this.top)) for (const x of list) live.add(x.index);
        for (const k of [...this.snaps.keys()]) if (!live.has(k)) this.snaps.delete(k);
      }
    }
    return checks;
  }

  /** Frames with exactly one face, as a share of all frames. */
  goodShare() {
    return this.frames.length ? this.frames.filter((f) => f.ok).length / this.frames.length : 0;
  }
}

/** Warp a kept frame onto the rest crop with transform T and cut the box around the `idx` points (crop pixels). */
function cutPatch(snap, T, aligned, idx, size, margin) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of idx) {
    x0 = Math.min(x0, aligned[i][0]); y0 = Math.min(y0, aligned[i][1]);
    x1 = Math.max(x1, aligned[i][0]); y1 = Math.max(y1, aligned[i][1]);
  }
  x0 = Math.max(0, Math.floor(x0 - margin)); y0 = Math.max(0, Math.floor(y0 - margin));
  x1 = Math.min(size, Math.ceil(x1 + margin)); y1 = Math.min(size, Math.ceil(y1 + margin));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 8 || h < 8) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(T.a, T.b, T.c, T.d, T.tx - x0, T.ty - y0);
  ctx.drawImage(snap, 0, 0);
  let image = c.toDataURL('image/webp', 0.9);
  if (!image.startsWith('data:image/webp')) image = c.toDataURL('image/jpeg', 0.9);
  return { image, x: x0, y: y0, w, h };
}

/**
 * Turn a finished collector into a bake record: the best rest frame becomes the photo (the same
 * crop as a still photo), and each chosen keyframe is aligned to it and cut into a small patch.
 */
export function clipBakeRecord(col, { phrase = ENROL_PHRASE, source = 'clip' } = {}) {
  const total = col.frames.length;
  if (!total) throw new Error('The clip has no frames.');
  if (col.multi > Math.max(2, 0.1 * total)) throw new Error('More than one face appears in the clip. Use a clip with only your face.');
  if (col.goodShare() < 0.4) throw new Error('Your face was not found in most of the clip. Keep one face in view, facing the camera, in good light.');
  const available = new Set(col.snaps.keys());
  const sel = selectKeyframes(col.frames, { available });
  if (sel.rest < 0) throw new Error('No usable frame in the clip: face the camera in good light and keep still.');
  const rf = col.frames[sel.rest];
  const fake = { faceLandmarks: [rf.lmN], faceBlendshapes: [{ categories: Object.entries(rf.bs).map(([categoryName, score]) => ({ categoryName, score })) }] };
  const base = makeBakeRecord(col.snaps.get(sel.rest), fake, rf.checks);
  const restLm = base.landmarks;
  const align = (f) => {
    const { T } = alignToRest(f.lm, restLm);
    return { T, aligned: f.lm.slice(0, N_FACE).map((p) => applyTransform(T, p)) };
  };
  const keys = {};
  for (const [cls, k] of Object.entries(sel.keys)) {
    const f = col.frames[k.index];
    const { T, aligned } = align(f);
    const patch = cutPatch(col.snaps.get(k.index), T, aligned, MOUTH_PATCH_POINTS, base.size, 4);
    if (!patch) continue;
    keys[cls] = { t: r1(f.t), score: Math.round(k.score * 1000) / 1000, residual: Math.round(k.residual * 10000) / 10000, landmarks: aligned.map((p) => [r1(p[0]), r1(p[1])]), patch };
  }
  let blink = null;
  if (sel.blink) {
    const f = col.frames[sel.blink.index];
    const { T, aligned } = align(f);
    const eyes = EYE_PATCH_POINTS.map((idx) => cutPatch(col.snaps.get(sel.blink.index), T, aligned, idx, base.size, 3));
    if (eyes.every(Boolean)) blink = { t: r1(f.t), score: Math.round(sel.blink.score * 1000) / 1000, landmarks: aligned.map((p) => [r1(p[0]), r1(p[1])]), eyes };
  }
  const okFrames = col.frames.filter((f) => f.ok);
  base.clip = {
    version: 1,
    source,
    phrase,
    frames: total,
    usable: sel.used,
    seconds: okFrames.length ? r1(okFrames[okFrames.length - 1].t - okFrames[0].t) : 0,
    rest: { t: r1(rf.t) },
    keys,
    blink,
  };
  return base;
}

function seek(video, t) {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.onerror = () => reject(new Error('The video could not be read.'));
    video.currentTime = t;
  });
}

/**
 * Bake from a video file at `url` (headless, for selfclone bake --video): decode it with a <video>
 * element, seek through it at CLIP_FPS, measure every frame, and build the clip bake record.
 */
export async function bakeVideo(url, { base = '/mp', fps = CLIP_FPS, maxSeconds = 30 } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('The video could not be read.');
  const blob = await res.blob();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const src = URL.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('This video cannot be decoded by the browser. Convert it to MP4 (H.264) or WebM (VP8 or VP9).'));
      video.src = src;
    });
    const dur = video.duration;
    if (!Number.isFinite(dur) || dur <= 0) throw new Error('The video has no readable duration. Convert it to MP4 or WebM.');
    if (dur > maxSeconds) throw new Error(`The clip is ${Math.round(dur)} s long. Use a clip of about 10 s (at most ${maxSeconds} s).`);
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('The video has no picture.');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const landmarker = await loadLandmarker(base, 'VIDEO');
    const col = new ClipCollector();
    try {
      const n = Math.max(1, Math.floor(dur * fps));
      for (let i = 0; i < n; i++) {
        await seek(video, Math.min(dur - 0.001, (i + 0.5) / fps));
        ctx.drawImage(video, 0, 0, w, h);
        const r = landmarker.detectForVideo(canvas, Math.round((i * 1000) / fps) + 1);
        col.add(canvas, ctx, r, (i + 0.5) / fps);
      }
    } finally {
      landmarker.close();
    }
    return clipBakeRecord(col, { source: 'video' });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(src);
  }
}
