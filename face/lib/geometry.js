// selfclone face geometry: landmark sets, Delaunay mesh, deformation rig and
// text-to-viseme rules. Plain ES module with no dependencies. Node imports it
// at bake time; the build step inlines it into avatar.html (export keywords
// are stripped), so it must not touch the DOM.

// ---- MediaPipe Face Mesh landmark indices (468 face points + 10 iris points) ----
export const N_FACE = 468;
export const INNER_LIP_RING = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const UPPER_INNER = [191, 80, 81, 82, 13, 312, 311, 310, 415];
export const LOWER_INNER = [95, 88, 178, 87, 14, 317, 402, 318, 324];
export const UPPER_INNER_WITH_CORNERS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
export const LOWER_INNER_WITH_CORNERS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
export const UPPER_SEMI_INNER = [183, 42, 41, 38, 12, 268, 271, 272, 407];
export const LOWER_SEMI_INNER = [96, 89, 179, 86, 15, 316, 403, 319, 325];
export const UPPER_SEMI_OUTER = [184, 74, 73, 72, 11, 302, 303, 304, 408];
export const LOWER_SEMI_OUTER = [77, 90, 180, 85, 16, 315, 404, 320, 307];
export const UPPER_OUTER = [185, 40, 39, 37, 0, 267, 269, 270, 409];
export const LOWER_OUTER = [146, 91, 181, 84, 17, 314, 405, 321, 375];
export const LIP_CORNERS = { 61: 0.38, 291: 0.38, 76: 0.4, 306: 0.4, 62: 0.42, 292: 0.42, 78: 0.45, 308: 0.45 };
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
// The subject's right eye appears on the image left.
export const RIGHT_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const RIGHT_EYE_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133];
export const LEFT_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const LEFT_EYE_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362];
// Regions used by clip enrolment patches (a ring around the lips, and two rings around each eye).
export const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const MOUTH_RING = [164, 167, 165, 92, 186, 57, 43, 106, 182, 83, 18, 313, 406, 335, 273, 287, 410, 322, 391, 393];
export const MOUTH_PATCH_POINTS = [...new Set([...LIPS_OUTER, ...INNER_LIP_RING, ...UPPER_SEMI_INNER, ...LOWER_SEMI_INNER, ...UPPER_SEMI_OUTER, ...LOWER_SEMI_OUTER, 76, 306, 62, 292, ...MOUTH_RING])];
export const EYE_REGIONS = [
  {
    contour: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
    ring1: [247, 30, 29, 27, 28, 56, 190, 243, 112, 26, 22, 23, 24, 110, 25, 130],
    ring2: [113, 225, 224, 223, 222, 221, 189, 244, 233, 232, 231, 230, 229, 228, 31, 226],
  },
  {
    contour: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
    ring1: [467, 260, 259, 257, 258, 286, 414, 463, 341, 256, 252, 253, 254, 339, 255, 359],
    ring2: [342, 445, 444, 443, 442, 441, 413, 464, 453, 452, 451, 450, 449, 448, 261, 446],
  },
];
export const EYE_PATCH_POINTS = EYE_REGIONS.map((e) => [...e.contour, ...e.ring1, ...e.ring2]);
export const NOSE_TIP = 1;
export const NOSE_BRIDGE = 168;
export const CHIN = 152;
export const FOREHEAD = 10;

export const HEAD_CAP_DEG = { yaw: 6, pitch: 6, roll: 3 };
export const KIND = { FACE: 0, RING1: 1, RING2: 2, FRAME: 3 };
const HEAD_WEIGHT = [1, 0.8, 0.3, 0];

// ---- small math helpers ----
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function centroid(L, idx) {
  let x = 0;
  let y = 0;
  for (const i of idx) {
    x += L[i][0];
    y += L[i][1];
  }
  return [x / idx.length, y / idx.length];
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- Delaunay triangulation (Bowyer-Watson) ----
export function delaunay(points) {
  const n = points.length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  const d = Math.max(maxX - minX, maxY - minY) * 20 + 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Tiny deterministic jitter avoids exact co-circular degeneracies on grids.
  const pts = points.map((p, i) => [p[0] + ((i * 7919) % 13) * 1e-7, p[1] + ((i * 104729) % 17) * 1e-7]);
  pts.push([cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]);
  let tris = [[n, n + 1, n + 2, ...circum(pts, n, n + 1, n + 2)]];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const bad = [];
    const keep = [];
    for (const t of tris) {
      const dx = px - t[3];
      const dy = py - t[4];
      if (dx * dx + dy * dy < t[5]) bad.push(t);
      else keep.push(t);
    }
    const edges = new Map();
    for (const t of bad) {
      for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (edges.has(key)) edges.set(key, null);
        else edges.set(key, [a, b]);
      }
    }
    for (const e of edges.values()) if (e) keep.push([e[0], e[1], i, ...circum(pts, e[0], e[1], i)]);
    tris = keep;
  }
  const out = [];
  for (const t of tris) if (t[0] < n && t[1] < n && t[2] < n) out.push([t[0], t[1], t[2]]);
  return out;
}

function circum(pts, a, b, c) {
  const [ax, ay] = pts[a];
  const [bx, by] = pts[b];
  const [cx, cy] = pts[c];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return [0, 0, Infinity];
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
}

// ---- face frame ----
export function faceFrame(L) {
  const eyeR = centroid(L, RIGHT_EYE_UPPER.concat(RIGHT_EYE_LOWER));
  const eyeL = centroid(L, LEFT_EYE_UPPER.concat(LEFT_EYE_LOWER));
  const iod = dist(eyeL, eyeR);
  const ex = [(eyeL[0] - eyeR[0]) / iod, (eyeL[1] - eyeR[1]) / iod];
  const ey = [-ex[1], ex[0]];
  const mouth = [(L[13][0] + L[14][0]) / 2, (L[13][1] + L[14][1]) / 2];
  const mw = dist(L[61], L[291]);
  const oval = FACE_OVAL.map((i) => L[i]);
  const center = centroid(L, FACE_OVAL);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of oval) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
  }
  return { eyeL, eyeR, iod, ex, ey, mouth, mw, center, faceWidth: maxX - minX, faceHeight: dist(L[FOREHEAD], L[CHIN]) };
}

/**
 * Mesh points for a face: the 468 face landmarks, two rings of soft anchors
 * around the face (hair, neck) and a fixed frame on the image border.
 */
export function meshPoints(L, size) {
  const fr = faceFrame(L);
  const points = [];
  const kinds = [];
  for (let i = 0; i < N_FACE; i++) {
    points.push([L[i][0], L[i][1], L[i][2] || 0]);
    kinds.push(KIND.FACE);
  }
  const margin = 3;
  const tooClose = (p) => points.some((q) => Math.abs(q[0] - p[0]) < 4 && Math.abs(q[1] - p[1]) < 4);
  for (const [scale, kind] of [[1.3, KIND.RING1], [1.75, KIND.RING2]]) {
    for (const i of FACE_OVAL) {
      const p = [fr.center[0] + (L[i][0] - fr.center[0]) * scale, fr.center[1] + (L[i][1] - fr.center[1]) * scale, 0];
      if (p[0] < margin || p[1] < margin || p[0] > size - margin || p[1] > size - margin) continue;
      if (tooClose(p)) continue;
      points.push(p);
      kinds.push(kind);
    }
  }
  const steps = 8;
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * size;
    for (const p of [[t, 0], [size, t], [size - t, size], [0, size - t]]) {
      points.push([p[0], p[1], 0]);
      kinds.push(KIND.FRAME);
    }
  }
  return { points, kinds };
}

// ---- deformation rig ----
function polyAt(poly, u) {
  // poly: [[u, t], ...] sorted by u. Linear interpolation, clamped at the ends.
  if (u <= poly[0][0]) return poly[0][1];
  for (let i = 1; i < poly.length; i++) {
    if (u <= poly[i][0]) {
      const a = poly[i - 1];
      const b = poly[i];
      const k = (u - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * k;
    }
  }
  return poly[poly.length - 1][1];
}

/**
 * Build the rig for a baked face. `points` are mesh vertices (rest pose),
 * `kinds` their KIND, `L` the full landmark list, `size` the image size.
 */
export function createRig({ points, kinds, landmarks: L, size, glasses = false }) {
  const n = points.length;
  const fr = faceFrame(L);
  const { ex, ey, mw, iod } = fr;
  const M = fr.mouth;
  const rest = new Float32Array(n * 2);
  const zc = new Float32Array(n);
  const wJaw = new Float32Array(n);
  const wMouth = new Float32Array(n);
  const mu = new Float32Array(n);
  const lipRaise = new Float32Array(n);
  const lipTuck = new Float32Array(n);
  const pucker = new Float32Array(n);
  const corner = new Float32Array(n);
  const wHead = new Float32Array(n);
  const blinkEye = new Uint8Array(n);
  const blinkW = new Float32Array(n);
  const blinkGap = new Float32Array(n);
  const uvShift = new Float32Array(n);

  const set = (arr, idx, v) => {
    for (const i of idx) arr[i] = v;
  };
  const upperSet = new Set([...UPPER_INNER, ...UPPER_SEMI_INNER, ...UPPER_SEMI_OUTER, ...UPPER_OUTER]);
  const lowerSet = new Set([...LOWER_INNER, ...LOWER_SEMI_INNER, ...LOWER_SEMI_OUTER, ...LOWER_OUTER]);
  const local = (p) => {
    const dx = p[0] - M[0];
    const dy = p[1] - M[1];
    return [dx * ex[0] + dy * ex[1], dx * ey[0] + dy * ey[1]];
  };
  const halfMW = mw / 2;
  // Lip line: from the left corner through the mouth centre to the right corner, in local coords.
  const cl = local(L[61]);
  const cr = local(L[291]);
  const lineLeft = cl[0] < cr[0] ? cl : cr;
  const lineRight = cl[0] < cr[0] ? cr : cl;
  const lipLine = (u) => (u < 0 ? polyAt([lineLeft, [0, 0]], u) : polyAt([[0, 0], lineRight], u));
  const chinT = local(L[CHIN])[1];
  const lowerOuterT = local(L[17])[1];

  for (let i = 0; i < n; i++) {
    const p = points[i];
    rest[2 * i] = p[0];
    rest[2 * i + 1] = p[1];
    zc[i] = kinds[i] === KIND.FACE ? -(p[2] || 0) : 0;
    wHead[i] = HEAD_WEIGHT[kinds[i]];
    const [u, t] = local(p);
    mu[i] = u;
    const r = Math.hypot(u, 1.6 * t);
    const mouthFall = 1 - smoothstep(0.55 * mw, 1.25 * mw, r);
    const isLip = i < N_FACE && (upperSet.has(i) || lowerSet.has(i) || i in LIP_CORNERS);
    wMouth[i] = kinds[i] === KIND.FRAME ? 0 : mouthFall;
    const taper = clamp(0.6 + 0.4 * (1 - (u / halfMW) ** 2), 0.6, 1);
    if (i < N_FACE && i in LIP_CORNERS) {
      wJaw[i] = LIP_CORNERS[i];
      corner[i] = 1;
    } else if (i < N_FACE && lowerSet.has(i)) {
      wJaw[i] = (LOWER_OUTER.includes(i) ? 0.95 : 1) * taper;
      lipTuck[i] = LOWER_INNER.includes(i) ? 1 : LOWER_SEMI_INNER.includes(i) ? 0.85 : 0.5;
      pucker[i] = LOWER_OUTER.includes(i) || LOWER_SEMI_OUTER.includes(i) ? 1 : 0.4;
    } else if (i < N_FACE && upperSet.has(i)) {
      wJaw[i] = 0;
      lipRaise[i] = (UPPER_INNER.includes(i) ? 1 : UPPER_SEMI_INNER.includes(i) ? 0.85 : UPPER_SEMI_OUTER.includes(i) ? 0.65 : 0.45) * taper;
      pucker[i] = UPPER_OUTER.includes(i) || UPPER_SEMI_OUTER.includes(i) ? -1 : -0.4;
    } else if (kinds[i] !== KIND.FRAME) {
      const line = lipLine(clamp(u, lineLeft[0], lineRight[0]));
      const hFall = 1 - smoothstep(0.45 * mw, 1.25 * mw, Math.abs(u));
      if (t > line) {
        const vRise = smoothstep(line - 0.05 * mw, Math.max(line + 0.2 * mw, lowerOuterT), t);
        const vEnd = 1 - smoothstep(chinT, chinT + 0.8 * mw, t);
        wJaw[i] = hFall * Math.max(0.35, vRise) * vEnd * (t > line + 0.02 * mw ? 1 : 0.5);
      } else {
        const band = smoothstep(0.35 * mw, 0.55 * mw, Math.abs(u)) * (1 - smoothstep(0.9 * mw, 1.4 * mw, Math.abs(u)));
        wJaw[i] = 0.25 * band * (1 - smoothstep(0, 0.35 * mw, line - t));
      }
    }
    if (isLip && kinds[i] === KIND.FACE) wMouth[i] = Math.max(wMouth[i], 0.9);
  }

  // Blink weights, per eye.
  const eyes = [
    { id: 1, up: RIGHT_EYE_UPPER, low: RIGHT_EYE_LOWER },
    { id: 2, up: LEFT_EYE_UPPER, low: LEFT_EYE_LOWER },
  ];
  for (const eye of eyes) {
    const c = centroid(L, eye.up.concat(eye.low));
    const el = (p) => {
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      return [dx * ex[0] + dy * ex[1], dx * ey[0] + dy * ey[1]];
    };
    const upPoly = eye.up.map((i) => el(L[i])).sort((a, b) => a[0] - b[0]);
    const lowPoly = eye.low.map((i) => el(L[i])).sort((a, b) => a[0] - b[0]);
    const uMin = upPoly[0][0];
    const uMax = upPoly[upPoly.length - 1][0];
    const halfW = (uMax - uMin) / 2;
    const uc = (uMax + uMin) / 2;
    const corners = new Set([eye.up[0], eye.up[eye.up.length - 1]]);
    const upInner = new Set(eye.up.filter((i) => !corners.has(i)));
    const lowInner = new Set(eye.low.filter((i) => !corners.has(i)));
    eye.maxGap = 0;
    for (let i = 0; i < N_FACE; i++) {
      const [u, t] = el(points[i]);
      const uc2 = clamp(u, uMin, uMax);
      const tU = polyAt(upPoly, uc2);
      const tL = polyAt(lowPoly, uc2);
      const gap = Math.max(0, tL - tU);
      eye.maxGap = Math.max(eye.maxGap, gap);
      const hw = 1 - smoothstep(0.8 * halfW, 1.25 * halfW, Math.abs(u - uc));
      let w = 0;
      let uvs = 0;
      if (corners.has(i)) w = 0;
      else if (upInner.has(i)) {
        w = 0.85;
        uvs = 0.55;
      } else if (lowInner.has(i)) w = -0.15;
      else if (hw > 0 && t < tU) w = 0.85 * (1 - smoothstep(0, 0.2 * iod, tU - t)) * hw;
      else if (hw > 0 && t > tL) w = -0.15 * (1 - smoothstep(0, 0.08 * iod, t - tL)) * hw;
      if (Math.abs(w) > Math.abs(blinkW[i])) {
        blinkEye[i] = eye.id;
        blinkW[i] = w;
        blinkGap[i] = gap;
        uvShift[i] = uvs * gap;
      }
    }
  }

  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) uv[i] = rest[i] / size;
  const maxDrop = 0.38 * mw;
  const neck = [L[CHIN][0] + (L[CHIN][0] - fr.center[0]) * 0.4, L[CHIN][1] + (L[CHIN][1] - fr.center[1]) * 0.4];
  const depthAxis = 0.5 * fr.faceWidth;

  const pos = new Float32Array(n * 2);
  const uvOut = new Float32Array(n * 2);

  function headTransform(x, y, z, w, h) {
    if (w === 0) return [x, y];
    const X = x - fr.center[0];
    const Y = y - fr.center[1];
    const Z = z + depthAxis;
    const cyw = Math.cos(h.yaw);
    const syw = Math.sin(h.yaw);
    const X1 = X * cyw + Z * syw;
    const Z1 = -X * syw + Z * cyw;
    const cp = Math.cos(h.pitch);
    const sp = Math.sin(h.pitch);
    const Y1 = Y * cp - Z1 * sp;
    let nx = x + w * (fr.center[0] + X1 - x);
    let ny = y + w * (fr.center[1] + Y1 - y) + w * (h.breathe || 0);
    const a = h.roll * w;
    if (a) {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const dx = nx - neck[0];
      const dy = ny - neck[1];
      nx = neck[0] + dx * ca - dy * sa;
      ny = neck[1] + dx * sa + dy * ca;
    }
    return [nx, ny];
  }

  /**
   * Deform the mesh. p: {jaw, wide, round, raise, tuck, blinkL, blinkR, yaw, pitch, roll (radians), breathe (px)}.
   * `extra` (optional, Float32Array of n*2) adds per-vertex displacements in image pixels before the
   * head transform; clip-baked avatars use it for mouth and eyelid shapes measured from real frames.
   * Returns typed arrays reused between calls.
   */
  function deform(p, extra) {
    const jaw = p.jaw || 0;
    const wide = p.wide || 0;
    const round = p.round || 0;
    const raise = p.raise || 0;
    const tuck = p.tuck || 0;
    const bR = glasses ? 0 : p.blinkR || 0;
    const bL = glasses ? 0 : p.blinkL || 0;
    const s = wide - 0.3 * round;
    const kw = s > 0 ? 0.13 : 0.2;
    const head = { yaw: p.yaw || 0, pitch: p.pitch || 0, roll: p.roll || 0, breathe: p.breathe || 0 };
    for (let i = 0; i < n; i++) {
      const u = mu[i];
      let du = kw * s * u * wMouth[i];
      let dt = jaw * maxDrop * wJaw[i];
      if (lipTuck[i]) dt -= tuck * (0.7 * jaw * maxDrop * wJaw[i] + 0.03 * mw) * lipTuck[i];
      if (lipRaise[i]) dt -= raise * 0.06 * mw * lipRaise[i];
      if (pucker[i]) dt += round * 0.035 * mw * pucker[i];
      if (corner[i] && wide > 0) dt -= wide * 0.03 * mw;
      if (blinkEye[i]) {
        const b = blinkEye[i] === 1 ? bR : bL;
        dt += b * blinkGap[i] * blinkW[i];
      }
      let x = rest[2 * i] + du * ex[0] + dt * ey[0];
      let y = rest[2 * i + 1] + du * ex[1] + dt * ey[1];
      if (extra) {
        x += extra[2 * i];
        y += extra[2 * i + 1];
      }
      const q = headTransform(x, y, zc[i], wHead[i], head);
      pos[2 * i] = q[0];
      pos[2 * i + 1] = q[1];
      let su = 0;
      if (uvShift[i] && blinkEye[i]) {
        const b = blinkEye[i] === 1 ? bR : bL;
        su = b * uvShift[i];
      }
      uvOut[2 * i] = (rest[2 * i] - su * ey[0]) / size;
      uvOut[2 * i + 1] = (rest[2 * i + 1] - su * ey[1]) / size;
    }
    return { pos, uv: uvOut };
  }

  /** Mouth interior geometry for the cavity layer, after deform(). */
  function mouth(p) {
    const head = { yaw: p.yaw || 0, pitch: p.pitch || 0, roll: p.roll || 0, breathe: p.breathe || 0 };
    const inner = INNER_LIP_RING.map((i) => [pos[2 * i], pos[2 * i + 1]]);
    const jawDrop = (p.jaw || 0) * maxDrop;
    // Upper teeth hang from the skull (rest upper lip line, moved only by the head).
    const upper = UPPER_INNER_WITH_CORNERS.map((i) => headTransform(L[i][0], L[i][1], -(L[i][2] || 0), 1, head));
    // Lower teeth ride on the jaw.
    const lower = LOWER_INNER_WITH_CORNERS.map((i) => headTransform(L[i][0] + jawDrop * ey[0], L[i][1] + jawDrop * ey[1], -(L[i][2] || 0), 1, head));
    return { inner, upper, lower, ey, mw };
  }

  return { n, rest, uv, deform, mouth, frame: fr, maxDrop, headTransform, glasses };
}

/**
 * Build the triangle list for a face: Delaunay on a moderately open-mouth pose
 * (so no triangle bridges the lips), then drop triangles inside the mouth.
 */
export function buildMesh(L, size) {
  const { points, kinds } = meshPoints(L, size);
  const rig = createRig({ points, kinds, landmarks: L, size });
  const { pos } = rig.deform({ jaw: 0.6 });
  const open = [];
  for (let i = 0; i < points.length; i++) open.push([pos[2 * i], pos[2 * i + 1]]);
  const ring = INNER_LIP_RING.map((i) => open[i]);
  const ringSet = new Set(INNER_LIP_RING);
  const up = new Set(UPPER_INNER);
  const low = new Set(LOWER_INNER);
  const tris = delaunay(open).filter(([a, b, c]) => {
    const cx = (open[a][0] + open[b][0] + open[c][0]) / 3;
    const cy = (open[a][1] + open[b][1] + open[c][1]) / 3;
    if (ringSet.has(a) && ringSet.has(b) && ringSet.has(c) && pointInPolygon([cx, cy], ring)) return false;
    const hasUp = up.has(a) || up.has(b) || up.has(c);
    const hasLow = low.has(a) || low.has(b) || low.has(c);
    if (hasUp && hasLow) return false;
    if (pointInPolygon([cx, cy], ring)) return false;
    return true;
  });
  return { points, kinds, triangles: tris };
}

// ---- visemes ----
export const VISEMES = {
  rest: { jaw: 0, wide: 0, round: 0, raise: 0, tuck: 0, teeth: 0, lowerTeeth: 0 },
  AA: { jaw: 0.85, wide: 0.15, round: 0, raise: 0.2, tuck: 0, teeth: 0.85, lowerTeeth: 0.25 },
  E: { jaw: 0.45, wide: 0.6, round: 0, raise: 0.35, tuck: 0, teeth: 0.95, lowerTeeth: 0.5 },
  I: { jaw: 0.25, wide: 0.85, round: 0, raise: 0.4, tuck: 0, teeth: 1, lowerTeeth: 0.6 },
  O: { jaw: 0.6, wide: -0.5, round: 0.7, raise: 0.05, tuck: 0, teeth: 0.25, lowerTeeth: 0 },
  U: { jaw: 0.22, wide: -0.85, round: 1, raise: 0, tuck: 0, teeth: 0, lowerTeeth: 0 },
  FV: { jaw: 0.16, wide: 0.1, round: 0, raise: 0.35, tuck: 1, teeth: 1, lowerTeeth: 0 },
  L: { jaw: 0.35, wide: 0.2, round: 0, raise: 0.2, tuck: 0, teeth: 0.85, lowerTeeth: 0.4 },
};
export const VISEME_KEYS = Object.keys(VISEMES);

const DIGRAPHS = [
  ['igh', ['AA', 'I']], ['tch', ['U']], ['th', ['L']], ['sh', ['U']], ['ch', ['U']], ['ph', ['FV']], ['wh', ['U']],
  ['ng', ['L']], ['ck', ['L']], ['qu', ['U', 'I']], ['ee', ['I']], ['ea', ['I']], ['oo', ['U']], ['ou', ['O']],
  ['ow', ['O']], ['oa', ['O']], ['ai', ['E']], ['ay', ['E']], ['ei', ['E']], ['ey', ['E']], ['oi', ['O', 'I']],
  ['oy', ['O', 'I']], ['au', ['O']], ['aw', ['O']], ['ie', ['I']], ['ue', ['U']],
];
const LETTERS = {
  a: 'AA', e: 'E', i: 'I', o: 'O', u: 'U', y: 'I',
  b: 'rest', m: 'rest', p: 'rest', f: 'FV', v: 'FV', w: 'U',
  l: 'L', t: 'L', d: 'L', n: 'L', s: 'L', z: 'L', c: 'L', k: 'L', g: 'L', j: 'U', r: 'L', x: 'L', q: 'L',
  h: null,
};
const VOWELS = new Set(['AA', 'E', 'I', 'O', 'U']);
const DURATION = { vowel: 120, consonant: 75, closed: 85, digit: 180, other: 150 };

/**
 * English-leaning text to viseme timeline. Returns
 * { segments: [{v, start, end, word}], words: [{charIndex, start}], total } in milliseconds at rate 1.
 */
export function textToVisemes(text, rate = 1) {
  const src = String(text || '');
  const segs = [];
  const words = [];
  let t = 0;
  const push = (v, ms, word) => {
    const d = ms / rate;
    const last = segs[segs.length - 1];
    if (last && last.v === v && v !== 'rest') last.end += d;
    else segs.push({ v, start: t, end: t + d, word });
    t += d;
  };
  const re = /[\p{L}\p{N}']+|[.,;:!?…\n]/gu;
  let m;
  let wi = 0;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (/^[.!?…\n]$/.test(tok)) {
      push('rest', 380, -1);
      continue;
    }
    if (/^[,;:]$/.test(tok)) {
      push('rest', 220, -1);
      continue;
    }
    words.push({ charIndex: m.index, start: t, text: tok });
    const w = tok.toLowerCase().normalize('NFD').replace(/[\u0300-\u036F']/g, '');
    let i = 0;
    while (i < w.length) {
      const ch = w[i];
      if (/\d/.test(ch)) {
        push('L', 70, wi);
        push('AA', DURATION.digit - 70, wi);
        i++;
        continue;
      }
      if (!/[a-z]/.test(ch)) {
        // Letters outside a-z (other scripts): alternate open and half-open, one syllable per character.
        push(i % 2 ? 'L' : 'AA', DURATION.other, wi);
        i++;
        continue;
      }
      // silent final e
      if (ch === 'e' && i === w.length - 1 && w.length > 2 && !/[aeiouy]/.test(w[i - 1])) {
        i++;
        continue;
      }
      const dg = DIGRAPHS.find(([g]) => w.startsWith(g, i));
      if (dg) {
        for (const v of dg[1]) push(v, VOWELS.has(v) ? DURATION.vowel : v === 'rest' ? DURATION.closed : DURATION.consonant, wi);
        i += dg[0].length;
        continue;
      }
      const v = LETTERS[ch];
      if (v === null) {
        i++;
        continue;
      }
      const vv = v || 'L';
      push(vv, VOWELS.has(vv) ? DURATION.vowel : vv === 'rest' ? DURATION.closed : DURATION.consonant, wi);
      i++;
    }
    wi++;
  }
  push('rest', 120, -1);
  return { segments: segs, words, total: t };
}

/** The timeline segment at `ms`, or null outside the timeline. */
export function segmentAt(timeline, ms) {
  const segs = timeline.segments;
  if (ms < 0 || ms >= timeline.total || !segs.length) return null;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].end <= ms) lo = mid + 1;
    else hi = mid;
  }
  return segs[lo];
}

export function visemeAt(timeline, ms) {
  const seg = segmentAt(timeline, ms);
  return seg ? seg.v : 'rest';
}
