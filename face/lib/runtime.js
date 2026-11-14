// selfclone avatar runtime. Inlined into avatar.html after geometry.js, inside
// one function scope. Uses createRig, textToVisemes, visemeAt, VISEMES,
// HEAD_CAP_DEG, INNER_LIP_RING, clamp and smoothstep from geometry.js.
// Offline by design: it never makes a network request unless it was opened by
// `selfclone serve` (same-origin events) or the user asks it to play an audio URL.

const DATA = JSON.parse(document.getElementById('selfclone-data').textContent);
const qs = new URLSearchParams(location.search);
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const OPT = {
  renderer: qs.get('renderer') || 'auto',
  idle: qs.get('idle') !== '0',
  blink: qs.get('blink') !== '0',
  tts: qs.get('tts') !== '0',
  volume: clamp(num(qs.get('volume'), 1), 0, 1),
  controls: qs.get('controls') !== '0',
  headAmp: clamp(num(qs.get('headamp'), 1), 0, 10),
  seed: qs.get('seed') || 'selfclone',
  // patches=0 draws the mouth the photo way even when the avatar was baked from a clip (for comparisons).
  patches: qs.get('patches') !== '0',
};
const S = DATA.size;
const RAD = Math.PI / 180;

const stage = document.getElementById('stage');
const cavity = document.getElementById('cavity');
let faceCanvas = document.getElementById('face');
const statusEl = document.getElementById('status');
const controls = document.getElementById('controls');
if (!OPT.controls) controls.hidden = true;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// ---- seeded random for blink timing ----
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = seededRandom(OPT.seed);

// ---- canvases ----
const DPR = Math.min(2, window.devicePixelRatio || 1);
const RES = Math.round(S * DPR);
for (const c of [cavity, faceCanvas]) {
  c.width = RES;
  c.height = RES;
}
const cav = cavity.getContext('2d');

// ---- badge: always visible ----
function guardBadge() {
  let b = document.getElementById('badge');
  if (!b || !stage.contains(b)) {
    b = document.createElement('div');
    b.id = 'badge';
    stage.appendChild(b);
  }
  if (b.className !== 'badge') b.className = 'badge';
  if (b.textContent !== 'AI CLONE') b.textContent = 'AI CLONE';
  const source = DATA.clip ? 'clip' : 'photo';
  if (b.dataset.source !== source) {
    b.dataset.source = source;
    b.title = DATA.clip ? 'AI CLONE, animated from a short video clip of the person' : 'AI CLONE, animated from one still photo of the person';
  }
  const cs = getComputedStyle(b);
  const ok = cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) >= 0.9 && b.offsetWidth > 20 && b.offsetHeight > 8;
  if (!ok) b.setAttribute('style', 'display:block !important;visibility:visible !important;opacity:1 !important;');
  return ok;
}
new MutationObserver(() => guardBadge()).observe(stage, { childList: true, subtree: true, attributes: true, characterData: true });
setInterval(guardBadge, 1000);

// ---- renderers ----
function makeGL(canvas, image, nVerts, tris) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false });
  } catch (e) {
    gl = null;
  }
  if (!gl) return null;
  const vsSrc = 'attribute vec2 aPos; attribute vec2 aUV; uniform vec2 uSize; varying vec2 vUV;' +
    'void main(){ vec2 c = aPos / uSize * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); vUV = aUV; }';
  const fsSrc = 'precision mediump float; uniform sampler2D uTex; varying vec2 vUV;' +
    'void main(){ gl_FragColor = texture2D(uTex, vUV); }';
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, nVerts * 8, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, nVerts * 8, gl.DYNAMIC_DRAW);
  const aUV = gl.getAttribLocation(prog, 'aUV');
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
  const idx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tris, gl.STATIC_DRAW);
  gl.uniform2f(gl.getUniformLocation(prog, 'uSize'), S, S);
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  if (gl.getError() !== gl.NO_ERROR) return null;
  return {
    kind: 'webgl',
    draw(pos, uv) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, uv);
      gl.drawElements(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0);
    },
    lost: () => gl.isContextLost(),
  };
}

function make2D(canvas, image, tris) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const iw = image.naturalWidth || S;
  const ih = image.naturalHeight || S;
  return {
    kind: '2d',
    draw(pos, uv) {
      const k = canvas.width / S;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let t = 0; t < tris.length; t += 3) {
        const a = tris[t] * 2;
        const b = tris[t + 1] * 2;
        const c = tris[t + 2] * 2;
        const x0 = pos[a] * k, y0 = pos[a + 1] * k;
        const x1 = pos[b] * k, y1 = pos[b + 1] * k;
        const x2 = pos[c] * k, y2 = pos[c + 1] * k;
        const u0 = uv[a] * iw, v0 = uv[a + 1] * ih;
        const u1 = uv[b] * iw, v1 = uv[b + 1] * ih;
        const u2 = uv[c] * iw, v2 = uv[c + 1] * ih;
        const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
        const det = du1 * dv2 - du2 * dv1;
        if (Math.abs(det) < 1e-6) continue;
        // Expand the clip triangle a little to hide hairline seams between triangles.
        const cx = (x0 + x1 + x2) / 3;
        const cy = (y0 + y1 + y2) / 3;
        const grow = (x, y) => {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.hypot(dx, dy) || 1;
          return [x + (dx / d) * 0.7, y + (dy / d) * 0.7];
        };
        const p0 = grow(x0, y0), p1 = grow(x1, y1), p2 = grow(x2, y2);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.clip();
        const dx1 = x1 - x0, dy1 = y1 - y0, dx2 = x2 - x0, dy2 = y2 - y0;
        const a11 = (dx1 * dv2 - dx2 * dv1) / det;
        const a12 = (dx2 * du1 - dx1 * du2) / det;
        const a21 = (dy1 * dv2 - dy2 * dv1) / det;
        const a22 = (dy2 * du1 - dy1 * du2) / det;
        ctx.setTransform(a11, a21, a12, a22, x0 - a11 * u0 - a12 * v0, y0 - a21 * u0 - a22 * v0);
        const sx = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1);
        const sy = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 1);
        const sw = Math.min(iw, Math.ceil(Math.max(u0, u1, u2)) + 1) - sx;
        const sh = Math.min(ih, Math.ceil(Math.max(v0, v1, v2)) + 1) - sy;
        if (sw > 0 && sh > 0) ctx.drawImage(image, sx, sy, sw, sh, sx, sy, sw, sh);
        ctx.restore();
      }
    },
    lost: () => false,
  };
}

// ---- mouth interior (drawn under the mesh, visible through the lip hole) ----
function drawCavity(m, prm) {
  cav.setTransform(DPR, 0, 0, DPR, 0, 0);
  cav.clearRect(0, 0, S, S);
  const ring = m.inner;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    cx += ring[i][0];
    cy += ring[i][1];
  }
  cx /= ring.length;
  cy /= ring.length;
  cav.save();
  cav.beginPath();
  cav.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) cav.lineTo(ring[i][0], ring[i][1]);
  cav.closePath();
  cav.fillStyle = PALETTE.cavity;
  cav.fill();
  if (Math.abs(area) < 2) {
    cav.restore();
    return;
  }
  cav.clip();
  const ey = m.ey;
  const mw = m.mw;
  const shade = cav.createRadialGradient(cx, cy, 0, cx, cy, mw * 0.55);
  shade.addColorStop(0, 'rgba(8,1,3,0.9)');
  shade.addColorStop(1, 'rgba(8,1,3,0)');
  cav.fillStyle = shade;
  cav.fillRect(cx - mw, cy - mw, 2 * mw, 2 * mw);
  // Tongue: low in the mouth, visible when the jaw opens.
  const low = ring[15];
  const tAlpha = clamp((prm.jaw || 0) * 1.6, 0, 1) * 0.7;
  if (tAlpha > 0.02) {
    cav.globalAlpha = tAlpha;
    cav.fillStyle = PALETTE.tongue;
    cav.beginPath();
    cav.ellipse(low[0] - ey[0] * 0.07 * mw, low[1] - ey[1] * 0.07 * mw, 0.3 * mw, 0.11 * mw, Math.atan2(-ey[0], ey[1]), 0, Math.PI * 2);
    cav.fill();
    cav.globalAlpha = 1;
  }
  const band = (pts, up, down, alpha, colorMid, colorSide) => {
    if (alpha <= 0.01) return;
    const n = pts.length;
    const grad = cav.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
    grad.addColorStop(0, colorSide);
    grad.addColorStop(0.5, colorMid);
    grad.addColorStop(1, colorSide);
    cav.globalAlpha = alpha;
    cav.fillStyle = grad;
    cav.beginPath();
    for (let i = 0; i < n; i++) {
      const x = pts[i][0] - ey[0] * up;
      const y = pts[i][1] - ey[1] * up;
      if (i === 0) cav.moveTo(x, y);
      else cav.lineTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) {
      const k = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const len = down * (1 - 0.45 * k * k);
      cav.lineTo(pts[i][0] + ey[0] * len, pts[i][1] + ey[1] * len);
    }
    cav.closePath();
    cav.fill();
    cav.globalAlpha = 1;
  };
  // Lower teeth ride on the jaw; upper teeth hang from the skull. Muted, warm
  // colours keep the drawn teeth from looking pasted on.
  band(m.lower, 0.06 * mw, 0.02 * mw, (prm.lowerTeeth || 0) * 0.6, PALETTE.lowerMid, PALETTE.lowerSide);
  band(m.upper, 0.04 * mw, 0.085 * mw, prm.teeth || 0, PALETTE.teethMid, PALETTE.teethSide);
  // Soft shadow just inside the lips, over the teeth.
  cav.beginPath();
  cav.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) cav.lineTo(ring[i][0], ring[i][1]);
  cav.closePath();
  cav.lineWidth = Math.max(1.5, 0.035 * mw);
  cav.strokeStyle = 'rgba(30,8,10,0.55)';
  cav.stroke();
  cav.restore();
}

// ---- palette: tint the drawn mouth to the photo's skin and light ----
const PALETTE = {
  cavity: '#2a0e10', tongue: '#6e2c2f', teethMid: '#ddd3c1', teethSide: '#7d7365', lowerMid: '#c9bfae', lowerSide: '#6f665b',
};
function samplePalette(img) {
  try {
    const L = DATA.landmarks;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, S, S);
    // Average skin over small patches on both cheeks and the chin.
    let r = 0, g = 0, b = 0, n = 0;
    for (const i of [205, 425, 200, 421, 18]) {
      const px = Math.round(L[i][0]);
      const py = Math.round(L[i][1]);
      const d = x.getImageData(Math.max(0, px - 3), Math.max(0, py - 3), 7, 7).data;
      for (let k = 0; k < d.length; k += 4) {
        r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
      }
    }
    if (!n) return;
    const skin = [r / n, g / n, b / n];
    const lum = (0.299 * skin[0] + 0.587 * skin[1] + 0.114 * skin[2]) / 255;
    const mix = (a, t, k) => a.map((v, i) => Math.round(v * (1 - k) + t[i] * k));
    const css = (v) => 'rgb(' + v.join(',') + ')';
    const scale = (v, k) => v.map((q) => Math.round(q * k));
    // Teeth: ivory pulled toward the skin colour and dimmed to the photo's light level.
    const light = clamp(0.7 + 0.5 * lum, 0.8, 1);
    const ivory = [236, 228, 212];
    const mid = scale(mix(ivory, skin, 0.25), light);
    PALETTE.teethMid = css(mid);
    PALETTE.teethSide = css(scale(mid, 0.55));
    PALETTE.lowerMid = css(scale(mid, 0.88));
    PALETTE.lowerSide = css(scale(mid, 0.5));
    PALETTE.cavity = css(mix([42, 14, 16], scale(skin, 0.25), 0.3));
    PALETTE.tongue = css(mix([120, 48, 52], scale(skin, 0.6), 0.3));
  } catch (e) {
    // keep defaults
  }
}

// ---- clip patches: real mouth and eyelid frames from a short enrol clip ----
// Each mouth shape found in the clip has a small patch (lips, inside of the mouth and a margin of
// skin), its landmarks, and the measured displacement of the mesh points. The mesh takes the
// measured shape, and the patch is warped piecewise-affinely from its own landmarks onto the
// current mesh points, feathered at the edge and colour matched to the base photo once at load.
const CLIP = DATA.clip && OPT.patches ? DATA.clip : null;
const patchCanvas = document.getElementById('patches');
// Text visemes to clip shapes, with how far to open (I and L reuse E, a little less open).
const CLIP_MAP = { AA: ['AA', 1], E: ['E', 1], I: ['E', 0.8], O: ['O', 1], U: ['U', 1], FV: ['FV', 1], L: ['E', 0.55], MBP: ['MBP', 1] };
const clipShapes = {};
let clipBlink = null;
let clipExtra = null;

function clipPlan(key) {
  const m = CLIP && CLIP_MAP[key];
  if (!m || !clipShapes[m[0]]) return null;
  return { cls: m[0], amp: m[1] };
}

function sparseToArray(d) {
  const out = { idx: new Uint16Array(d.length / 3), dx: new Float32Array(d.length / 3), dy: new Float32Array(d.length / 3) };
  for (let k = 0, j = 0; k < d.length; k += 3, j++) {
    out.idx[j] = d[k];
    out.dx[j] = d[k + 1];
    out.dy[j] = d[k + 2];
  }
  return out;
}

function shrink(points, k) {
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p[0];
    cy += p[1];
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
}

/** Per-channel mean and standard deviation of `data` (RGBA) over pixels where `inside(x, y)`. */
function regionStats(data, w, h, inside) {
  const s = [0, 0, 0];
  const s2 = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        s[c] += data[o + c];
        s2[c] += data[o + c] * data[o + c];
      }
      n++;
    }
  }
  if (n < 20) return null;
  const mean = s.map((v) => v / n);
  return { mean, std: s2.map((v, c) => Math.sqrt(Math.max(1, v / n - mean[c] * mean[c]))), n };
}

/**
 * Load one patch: decode it, triangulate its landmarks, and match its colour to the base photo with
 * a per-channel mean and standard deviation transfer over the skin ring between `outer` (the mask
 * edge) and `inner` (the lips or the eye opening), measured at the same landmarks in both images.
 */
async function loadPatch(p, idx, outer, inner, opts) {
  const img = new Image();
  img.src = p.image;
  await img.decode();
  const src = [];
  for (let j = 0; j < idx.length; j++) src.push([p.pts[2 * j], p.pts[2 * j + 1]]);
  const pos = new Map(idx.map((i, j) => [i, j]));
  const tris = delaunay(src).filter(([a, b, c]) => Math.abs((src[b][0] - src[a][0]) * (src[c][1] - src[a][1]) - (src[c][0] - src[a][0]) * (src[b][1] - src[a][1])) > 0.05);
  const canvas = document.createElement('canvas');
  canvas.width = p.w;
  canvas.height = p.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const pd = ctx.getImageData(0, 0, p.w, p.h);
  const ringOf = (pts, list, k) => shrink(list.map((i) => pts(i)), k);
  const pPt = (i) => src[pos.get(i)];
  const pOuter = ringOf(pPt, outer, opts.maskShrink);
  const pInner = ringOf(pPt, inner, 1.08);
  const inRing = (outerPoly, innerPoly) => (x, y) => pointInPolygon([x, y], outerPoly) && !pointInPolygon([x, y], innerPoly);
  const ps = regionStats(pd.data, p.w, p.h, inRing(pOuter, pInner));
  // The same ring in the base photo, at the rest landmarks.
  const L = DATA.landmarks;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of outer) {
    x0 = Math.min(x0, L[i][0]); y0 = Math.min(y0, L[i][1]);
    x1 = Math.max(x1, L[i][0]); y1 = Math.max(y1, L[i][1]);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(S, Math.ceil(x1)); y1 = Math.min(S, Math.ceil(y1));
  let match = null;
  if (ps && x1 - x0 > 4 && y1 - y0 > 4) {
    const bc = document.createElement('canvas');
    bc.width = x1 - x0;
    bc.height = y1 - y0;
    const bx = bc.getContext('2d', { willReadFrequently: true });
    bx.drawImage(image, x0, y0, bc.width, bc.height, 0, 0, bc.width, bc.height);
    const bd = bx.getImageData(0, 0, bc.width, bc.height);
    const bPt = (i) => [L[i][0] - x0, L[i][1] - y0];
    const bs = regionStats(bd.data, bc.width, bc.height, inRing(ringOf(bPt, outer, opts.maskShrink), ringOf(bPt, inner, 1.08)));
    if (bs) {
      const gain = [0, 1, 2].map((c) => clamp(bs.std[c] / ps.std[c], 0.8, 1.25));
      match = { gain, from: ps.mean, to: bs.mean };
      const d = pd.data;
      for (let o = 0; o < d.length; o += 4) {
        for (let c = 0; c < 3; c++) d[o + c] = clamp(Math.round((d[o + c] - ps.mean[c]) * gain[c] + bs.mean[c]), 0, 255);
      }
      ctx.putImageData(pd, 0, 0);
    }
  }
  return { canvas, w: p.w, h: p.h, idx, src, tris, outer, feather: opts.feather, maskShrink: opts.maskShrink, match };
}

let patchCtx = null;
const scratch = { tmp: null, mask: null };

function scratchCanvas(key, w, h) {
  let c = scratch[key];
  if (!c) c = scratch[key] = document.createElement('canvas');
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  return c;
}

/** Warp patch `P` onto the current mesh points `pos` and draw it with `alpha` on the patch layer. */
function drawPatch(P, pos, alpha) {
  const k = patchCanvas.width / S;
  const tgt = new Array(P.idx.length);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < P.idx.length; j++) {
    const i = P.idx[j];
    const x = pos[2 * i];
    const y = pos[2 * i + 1];
    tgt[j] = [x, y];
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  x0 = Math.floor(x0 - 2);
  y0 = Math.floor(y0 - 2);
  const W = Math.ceil((x1 - x0 + 4) * k);
  const H = Math.ceil((y1 - y0 + 4) * k);
  if (W < 2 || H < 2) return;
  const tmp = scratchCanvas('tmp', W, H);
  const t = tmp.getContext('2d');
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, W, H);
  const iw = P.w;
  const ih = P.h;
  for (const [a, b, c] of P.tris) {
    const u0 = P.src[a][0], v0 = P.src[a][1];
    const u1 = P.src[b][0], v1 = P.src[b][1];
    const u2 = P.src[c][0], v2 = P.src[c][1];
    const X0 = (tgt[a][0] - x0) * k, Y0 = (tgt[a][1] - y0) * k;
    const X1 = (tgt[b][0] - x0) * k, Y1 = (tgt[b][1] - y0) * k;
    const X2 = (tgt[c][0] - x0) * k, Y2 = (tgt[c][1] - y0) * k;
    const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-6) continue;
    const cx = (X0 + X1 + X2) / 3;
    const cy = (Y0 + Y1 + Y2) / 3;
    const grow = (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return [x + (dx / d) * 0.8, y + (dy / d) * 0.8];
    };
    const p0 = grow(X0, Y0), p1 = grow(X1, Y1), p2 = grow(X2, Y2);
    t.save();
    t.beginPath();
    t.moveTo(p0[0], p0[1]);
    t.lineTo(p1[0], p1[1]);
    t.lineTo(p2[0], p2[1]);
    t.closePath();
    t.clip();
    const dx1 = X1 - X0, dy1 = Y1 - Y0, dx2 = X2 - X0, dy2 = Y2 - Y0;
    const a11 = (dx1 * dv2 - dx2 * dv1) / det;
    const a12 = (dx2 * du1 - dx1 * du2) / det;
    const a21 = (dy1 * dv2 - dy2 * dv1) / det;
    const a22 = (dy2 * du1 - dy1 * du2) / det;
    t.setTransform(a11, a21, a12, a22, X0 - a11 * u0 - a12 * v0, Y0 - a21 * u0 - a22 * v0);
    t.drawImage(P.canvas, 0, 0, iw, ih, 0, 0, iw, ih);
    t.restore();
  }
  // Feathered mask: the ring around the lips (or eye) pulled in a little, blurred with a shadow so
  // it also works where canvas filters are missing.
  const m = scratchCanvas('mask', W, H);
  const mc = m.getContext('2d');
  mc.setTransform(1, 0, 0, 1, 0, 0);
  mc.clearRect(0, 0, m.width, m.height);
  const poly = shrink(P.outer.map((i) => [pos[2 * i], pos[2 * i + 1]]), P.maskShrink);
  const OFF = 10000;
  mc.save();
  mc.shadowColor = '#000';
  mc.shadowBlur = P.feather * k;
  mc.shadowOffsetX = OFF;
  mc.beginPath();
  poly.forEach((p, j) => {
    const X = (p[0] - x0) * k - OFF;
    const Y = (p[1] - y0) * k;
    if (j === 0) mc.moveTo(X, Y);
    else mc.lineTo(X, Y);
  });
  mc.closePath();
  mc.fillStyle = '#000';
  mc.fill();
  mc.restore();
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(m, 0, 0, W, H, 0, 0, W, H);
  t.globalCompositeOperation = 'source-over';
  patchCtx.globalAlpha = clamp(alpha, 0, 1);
  patchCtx.drawImage(tmp, 0, 0, W, H, x0 * k, y0 * k, W, H);
  patchCtx.globalAlpha = 1;
}

function updateClip(dt) {
  if (!CLIP) return;
  const tgt = state.clipTarget;
  const closing = !tgt || tgt.amp < state.amp;
  const k = 1 - Math.exp(-dt / (closing ? 0.03 : 0.045));
  for (const c of Object.keys(clipShapes)) {
    const want = tgt && tgt.cls === c ? 1 : 0;
    state.mix[c] += (want - state.mix[c]) * k;
    if (state.mix[c] < 0.002) state.mix[c] = 0;
  }
  state.amp += ((tgt ? tgt.amp : 0) - state.amp) * k;
}

/** Mesh displacements for the current mix of clip shapes and the blink. */
function clipDisplacement() {
  clipExtra.fill(0);
  const add = (s, w) => {
    if (w <= 0.001) return;
    for (let j = 0; j < s.idx.length; j++) {
      clipExtra[2 * s.idx[j]] += w * s.dx[j];
      clipExtra[2 * s.idx[j] + 1] += w * s.dy[j];
    }
  };
  for (const c of Object.keys(clipShapes)) add(clipShapes[c].delta, state.amp * state.mix[c]);
  if (clipBlink) add(clipBlink.delta, state.blink);
  return clipExtra;
}

function drawClipPatches(pos) {
  patchCtx.setTransform(1, 0, 0, 1, 0, 0);
  patchCtx.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
  // Cross-fade: draw from the weakest to the strongest shape so the sum of weights is kept.
  const order = Object.keys(clipShapes).filter((c) => state.mix[c] > 0.01).sort((a, b) => state.mix[a] - state.mix[b]);
  let rest = 0;
  for (let j = order.length - 1; j >= 0; j--) {
    const c = order[j];
    const a = state.mix[c] / Math.max(1e-6, 1 - rest);
    rest += state.mix[c];
    order[j] = [c, a];
  }
  for (const [c, a] of order) drawPatch(clipShapes[c].patch, pos, a);
  if (clipBlink && state.blink > 0.02) for (const P of clipBlink.eyes) drawPatch(P, pos, state.blink);
  // For tests and tooling: which path drew the mouth this frame.
  let top = null;
  for (const c of Object.keys(clipShapes)) if (!top || state.mix[c] > state.mix[top]) top = c;
  const path = top && state.mix[top] > 0.5 && (state.amp > 0.05 || top === 'MBP') ? 'patch' : null;
  return { path, shape: path ? top : null, eyes: clipBlink && state.blink > 0.5 ? 'patch' : null };
}

async function loadClip() {
  if (!CLIP) return;
  clipExtra = new Float32Array(rig.n * 2);
  patchCanvas.hidden = false;
  patchCanvas.width = RES;
  patchCanvas.height = RES;
  patchCtx = patchCanvas.getContext('2d');
  const mw = rig.frame.mw;
  const iod = rig.frame.iod;
  const lipsOuter = LIPS_OUTER;
  for (const [cls, s] of Object.entries(CLIP.shapes || {})) {
    try {
      const patch = await loadPatch(s, MOUTH_PATCH_POINTS, MOUTH_RING, lipsOuter, { maskShrink: 0.86, feather: 0.09 * mw });
      clipShapes[cls] = { patch, delta: sparseToArray(s.d) };
      state.mix[cls] = 0;
    } catch (e) {
      // A patch that cannot be decoded falls back to the drawn mouth for that shape.
    }
  }
  if (CLIP.blink && !DATA.glasses) {
    try {
      const eyes = [];
      for (let e = 0; e < 2; e++) {
        eyes.push(await loadPatch(CLIP.blink.eyes[e], EYE_PATCH_POINTS[e], EYE_REGIONS[e].ring2, EYE_REGIONS[e].contour, { maskShrink: 0.9, feather: 0.07 * iod }));
      }
      clipBlink = { eyes, delta: sparseToArray(CLIP.blink.d) };
    } catch (e) {
      clipBlink = null;
    }
  }
}

// ---- state ----
const rig = createRig({ points: DATA.points, kinds: DATA.kinds, landmarks: DATA.landmarks, size: S, glasses: DATA.glasses });
const tris = new Uint16Array(DATA.triangles);
const state = {
  mode: 'idle',
  params: Object.assign({}, VISEMES.rest),
  target: Object.assign({}, VISEMES.rest),
  energy: 0,
  blink: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  breathe: 0,
  maxYaw: 0,
  maxPitch: 0,
  maxRoll: 0,
  maxNoseShift: 0,
  frames: 0,
  lastViseme: 'rest',
  visemesSeen: {},
  // Clip avatars: weight of each clip shape, how far open, and the current target.
  mix: {},
  amp: 0,
  clipTarget: null,
  hold: null,
  holdBlink: false,
  mouthPath: 'rest',
  patchShape: null,
  eyePath: null,
  pathFrames: { patch: 0, drawn: 0, rest: 0 },
};
let renderer = null;
let speech = null;
let speechResolve = null;
let audioCtx = null;
let lastFrame = performance.now();
let nextBlink = performance.now() + 1200 + rnd() * 2500;
let blinkStart = -1;

function endSpeech() {
  if (speech && speech.kind === 'audio') {
    try {
      speech.node.onended = null;
      speech.node.stop();
    } catch (e) {
      // already stopped
    }
  }
  if (speech && speech.utter && 'speechSynthesis' in window) {
    try {
      speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }
  }
  speech = null;
  state.mode = 'idle';
  state.target = Object.assign({}, VISEMES.rest);
  state.clipTarget = null;
  state.energy = 0;
  const r = speechResolve;
  speechResolve = null;
  if (r) r();
  document.dispatchEvent(new CustomEvent('selfclone:end'));
}

function stop() {
  endSpeech();
  setStatus('');
}

function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices() || [];
    const lang = (navigator.language || 'en').slice(0, 2);
    return voices.find((v) => v.lang && v.lang.startsWith(lang) && v.localService) || voices.find((v) => v.lang && v.lang.startsWith(lang)) || null;
  } catch (e) {
    return null;
  }
}

function say(text, o) {
  o = o || {};
  stop();
  const t = String(text || '').trim();
  if (!t) return Promise.resolve();
  const rate = clamp(num(o.rate, 1), 0.25, 4);
  const tl = textToVisemes(t, rate);
  speech = { kind: 'text', tl, t0: null, offset: 0, utter: null, ttsEnded: false };
  state.mode = 'text';
  const done = new Promise((r) => (speechResolve = r));
  const voiceBox = document.getElementById('voiceOn');
  const wantTTS = o.tts != null ? o.tts : OPT.tts && (!voiceBox || voiceBox.checked);
  const canTTS = wantTTS && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  const startSilent = (why) => {
    if (speech && speech.kind === 'text' && speech.t0 == null) {
      speech.t0 = performance.now();
      setStatus(why);
    }
  };
  if (canTTS) {
    try {
      const u = new SpeechSynthesisUtterance(t);
      u.volume = OPT.volume;
      u.rate = rate;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onstart = () => {
        if (speech && speech.utter === u) {
          speech.t0 = performance.now();
          setStatus('Speaking with your browser voice.');
        }
      };
      u.onboundary = (e) => {
        if (!speech || speech.utter !== u || speech.t0 == null) return;
        if (e.name && e.name !== 'word') return;
        const words = speech.tl.words;
        let w = null;
        for (const x of words) if (x.charIndex <= e.charIndex) w = x;
        if (w) speech.offset = w.start - (performance.now() - speech.t0);
      };
      u.onend = () => {
        if (speech && speech.utter === u) speech.ttsEnded = true;
      };
      u.onerror = () => startSilent('No browser voice available, so the clone speaks silently.');
      speech.utter = u;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(() => startSilent('No browser voice started, so the clone speaks silently.'), 450);
    } catch (e) {
      startSilent('No browser voice available, so the clone speaks silently.');
    }
  } else {
    startSilent('Speaking silently (browser voice is off).');
  }
  return done;
}

function getAudioCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

async function sayAudio(src) {
  stop();
  const ctx = getAudioCtx();
  if (!ctx) {
    setStatus('Web Audio is not available in this browser.');
    return;
  }
  try {
    await ctx.resume();
  } catch (e) {
    // the user may need to click once
  }
  let buf;
  try {
    if (src instanceof Blob) buf = await src.arrayBuffer();
    else if (src instanceof ArrayBuffer) buf = src;
    else {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      buf = await res.arrayBuffer();
    }
  } catch (e) {
    setStatus('Could not load that audio. Use the Play audio file button, or open the avatar with selfclone serve.');
    return;
  }
  let audio;
  try {
    audio = await ctx.decodeAudioData(buf.slice(0));
  } catch (e) {
    setStatus('This audio format could not be decoded by the browser.');
    return;
  }
  const node = ctx.createBufferSource();
  node.buffer = audio;
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  an.smoothingTimeConstant = 0.2;
  const gain = ctx.createGain();
  gain.gain.value = OPT.volume;
  node.connect(an);
  an.connect(gain);
  gain.connect(ctx.destination);
  speech = { kind: 'audio', node, an, td: new Float32Array(an.fftSize), fd: new Float32Array(an.frequencyBinCount), level: 0, sr: ctx.sampleRate, duration: audio.duration };
  state.mode = 'audio';
  const done = new Promise((r) => (speechResolve = r));
  node.onended = () => {
    if (speech && speech.node === node) endSpeech();
  };
  node.start();
  setStatus(ctx.state === 'running' ? 'Playing audio.' : 'Click the page once to allow sound, then play again.');
  return done;
}

function blink() {
  if (!DATA.glasses) blinkStart = performance.now();
}

// ---- per-frame updates ----
/** Aim at a viseme: a real clip shape when the avatar has one for it, otherwise the drawn mouth. */
function setVisemeTarget(key) {
  const plan = clipPlan(key);
  state.clipTarget = plan;
  state.target = plan ? VISEMES.rest : VISEMES[key] || VISEMES.rest;
}

function updateSpeech(now, dt) {
  if (!speech) {
    setVisemeTarget(state.hold || 'rest');
    return;
  }
  if (speech.kind === 'text') {
    if (speech.t0 == null) {
      setVisemeTarget('rest');
      return;
    }
    const ms = now - speech.t0 + speech.offset;
    const seg = segmentAt(speech.tl, ms);
    const v = seg ? seg.v : 'rest';
    // Closed lips inside a word are M, B or P; between words they are a pause.
    setVisemeTarget(v === 'rest' && seg && seg.word >= 0 ? 'MBP' : v);
    state.lastViseme = v;
    state.visemesSeen[v] = (state.visemesSeen[v] || 0) + 1;
    state.energy = v === 'rest' ? Math.max(0, state.energy - dt * 4) : Math.min(1, state.energy + dt * 6);
    if (ms > speech.tl.total + 100 && (!speech.utter || speech.ttsEnded || ms > speech.tl.total + 1500)) endSpeech();
    else if (speech.ttsEnded && ms > speech.tl.total * 0.6) endSpeech();
    return;
  }
  if (speech.kind === 'audio') {
    const { an, td, fd, sr } = speech;
    an.getFloatTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
    const rms = Math.sqrt(sum / td.length);
    an.getFloatFrequencyData(fd);
    let num2 = 0;
    let den = 0;
    const binHz = sr / an.fftSize;
    for (let i = Math.floor(100 / binHz); i < Math.min(fd.length, Math.ceil(5000 / binHz)); i++) {
      const mag = Math.pow(10, fd[i] / 20);
      num2 += i * binHz * mag;
      den += mag;
    }
    const centroid = den > 0 ? num2 / den : 0;
    const raw = clamp((rms - 0.012) * 7, 0, 1);
    const k = raw > speech.level ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.09);
    speech.level += (raw - speech.level) * k;
    const lvl = speech.level;
    const cn = clamp((centroid - 900) / 1800, 0, 1);
    state.energy = lvl;
    state.lastViseme = lvl > 0.08 ? 'audio' : 'rest';
    if (CLIP) {
      // Bright sounds spread the lips, dark sounds round them; loudness sets how far it opens.
      const key = lvl <= 0.08 ? null : cn > 0.55 ? 'E' : cn < 0.2 ? 'O' : 'AA';
      const plan = key && (clipPlan(key) || clipPlan('AA'));
      if (plan || !key) {
        state.clipTarget = plan ? { cls: plan.cls, amp: clamp(lvl * 1.15, 0.15, 1) * plan.amp } : null;
        state.target = VISEMES.rest;
        return;
      }
    }
    state.clipTarget = null;
    state.target = {
      jaw: 0.85 * lvl,
      wide: clamp((cn - 0.45) * 1.3 * lvl, -0.8, 0.8),
      round: Math.max(0, 0.4 - cn) * 2 * lvl,
      raise: 0.3 * cn * lvl,
      tuck: 0,
      teeth: lvl > 0.08 ? 0.35 + 0.6 * cn : 0,
      lowerTeeth: lvl > 0.08 ? 0.3 * cn : 0,
    };
  }
}

function updateParams(dt) {
  const closing = state.target.jaw < state.params.jaw;
  const k = 1 - Math.exp(-dt / (closing ? 0.03 : 0.045));
  for (const key of Object.keys(VISEMES.rest)) {
    const t = state.target[key] || 0;
    state.params[key] += (t - state.params[key]) * k;
  }
}

function updateBlink(now) {
  if (state.holdBlink && !DATA.glasses) {
    state.blink = 1;
    return;
  }
  if (DATA.glasses || !OPT.blink) {
    if (blinkStart < 0) {
      state.blink = 0;
      return;
    }
  }
  if (blinkStart < 0 && now >= nextBlink && OPT.blink && !DATA.glasses) blinkStart = now;
  if (blinkStart >= 0) {
    const e = now - blinkStart;
    let a = 0;
    if (e < 70) a = e / 70;
    else if (e < 110) a = 1;
    else if (e < 230) a = 1 - (e - 110) / 120;
    a = clamp(a, 0, 1);
    state.blink = a * a * (3 - 2 * a);
    if (e >= 230) {
      blinkStart = -1;
      state.blink = 0;
      nextBlink = now + (rnd() < 0.15 ? 180 : 2200 + rnd() * 3800);
    }
  } else state.blink = 0;
}

function updateHead(now) {
  const t = now / 1000;
  const A = OPT.headAmp;
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  let breathe = 0;
  if (OPT.idle) {
    const TAU = Math.PI * 2;
    yaw = A * 4 * (0.6 * Math.sin(TAU * 0.071 * t + 1.3) + 0.4 * Math.sin(TAU * 0.131 * t + 0.2));
    pitch = A * 2.5 * (0.6 * Math.sin(TAU * 0.093 * t + 2.1) + 0.4 * Math.sin(TAU * 0.171 * t + 4.0));
    roll = A * 1.2 * Math.sin(TAU * 0.053 * t + 0.7);
    breathe = 1.0 * Math.sin((TAU * t) / 4.6);
    if (state.energy > 0) {
      pitch += A * 0.9 * state.energy * Math.sin(TAU * 2.3 * t);
      yaw += A * 0.6 * state.energy * Math.sin(TAU * 1.1 * t + 1);
    }
  }
  state.yaw = clamp(yaw, -HEAD_CAP_DEG.yaw, HEAD_CAP_DEG.yaw);
  state.pitch = clamp(pitch, -HEAD_CAP_DEG.pitch, HEAD_CAP_DEG.pitch);
  state.roll = clamp(roll, -HEAD_CAP_DEG.roll, HEAD_CAP_DEG.roll);
  state.breathe = breathe;
  state.maxYaw = Math.max(state.maxYaw, Math.abs(state.yaw));
  state.maxPitch = Math.max(state.maxPitch, Math.abs(state.pitch));
  state.maxRoll = Math.max(state.maxRoll, Math.abs(state.roll));
}

function currentPose() {
  return Object.assign({}, state.params, {
    blinkL: state.blink,
    blinkR: state.blink,
    yaw: state.yaw * RAD,
    pitch: state.pitch * RAD,
    roll: state.roll * RAD,
    breathe: state.breathe,
  });
}

function render() {
  if (!guardBadge()) return; // never show the face without the badge
  const pose = currentPose();
  let extra = null;
  if (CLIP) {
    extra = clipDisplacement();
    if (clipBlink) pose.blinkL = pose.blinkR = 0; // the measured eyelids replace the drawn blink
  }
  const { pos, uv } = rig.deform(pose, extra);
  drawCavity(rig.mouth(pose), state.params);
  renderer.draw(pos, uv);
  const used = CLIP ? drawClipPatches(pos) : { path: null, shape: null, eyes: null };
  const p = state.params;
  const path = used.path || (p.jaw > 0.05 || p.tuck > 0.1 || p.round > 0.1 ? 'drawn' : 'rest');
  state.mouthPath = path;
  state.patchShape = used.shape;
  state.eyePath = used.eyes || (state.blink > 0.5 ? 'drawn' : null);
  state.pathFrames[path]++;
  const nx = pos[2] - rig.rest[2];
  const ny = pos[3] - rig.rest[3];
  state.maxNoseShift = Math.max(state.maxNoseShift, Math.hypot(nx, ny));
  state.frames++;
}

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
  lastFrame = now;
  updateSpeech(now, dt);
  updateParams(dt);
  updateClip(dt);
  updateBlink(now);
  updateHead(now);
  if (renderer.lost()) switchTo2D();
  render();
  requestAnimationFrame(frame);
}

function switchTo2D() {
  const fresh = document.createElement('canvas');
  fresh.id = 'face';
  fresh.className = faceCanvas.className;
  fresh.width = RES;
  fresh.height = RES;
  fresh.setAttribute('role', 'img');
  fresh.setAttribute('aria-label', faceCanvas.getAttribute('aria-label') || 'AI clone avatar');
  faceCanvas.replaceWith(fresh);
  faceCanvas = fresh;
  renderer = make2D(faceCanvas, image, tris);
}

// ---- regions (for tests and tooling): CSS-pixel boxes at rest pose ----
function regions() {
  const r = faceCanvas.getBoundingClientRect();
  const k = r.width / S;
  const L = DATA.landmarks;
  const box = (idx, padX, padY, extraDown) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of idx) {
      x0 = Math.min(x0, L[i][0]);
      y0 = Math.min(y0, L[i][1]);
      x1 = Math.max(x1, L[i][0]);
      y1 = Math.max(y1, L[i][1]);
    }
    return {
      x: r.left + (x0 - padX) * k,
      y: r.top + (y0 - padY) * k,
      width: (x1 - x0 + 2 * padX) * k,
      height: (y1 - y0 + 2 * padY + (extraDown || 0)) * k,
    };
  };
  const mw = rig.frame.mw;
  const lips = [61, 291, 0, 17, 185, 40, 39, 37, 267, 269, 270, 409, 375, 321, 405, 314, 84, 181, 91, 146];
  return {
    canvas: { x: r.left, y: r.top, width: r.width, height: r.height },
    mouth: box(lips, 0.12 * mw, 0.08 * mw, rig.maxDrop),
    eyes: [box(RIGHT_EYE_UPPER.concat(RIGHT_EYE_LOWER), 4, 6), box(LEFT_EYE_UPPER.concat(LEFT_EYE_LOWER), 4, 6)],
    scale: k,
  };
}

// ---- UI ----
function fillInfo() {
  const c = DATA.consent || {};
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set('infoName', c.name || 'Not given');
  set('infoStatement', c.statement || '');
  set('infoDate', c.date ? new Date(c.date).toLocaleString() : '');
  const methods = {
    webcam: 'Webcam enrolment (one still frame)',
    clip: 'Webcam clip, processed in memory; the video was not stored',
    video: 'Video file, processed in memory; the video was not copied',
  };
  set('infoMethod', methods[c.method] || 'Still photo');
  if (DATA.clip) {
    const shapes = Object.keys(DATA.clip.shapes || {});
    const list = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs.join(''));
    const kept = ['one rest frame'];
    if (shapes.length) kept.push('mouth patches for ' + list(shapes));
    if (DATA.clip.blink) kept.push('closed-eye patches');
    set('infoClip', `${DATA.clip.frames} frames read; kept ${list(kept)}. Shapes without a patch use the drawn mouth.`);
    set('infoNote', 'This is an AI clone, not the person and not a recording of them. It is one frame of a short clip warped in your browser, with small patches of the mouth and eyes from the same clip. The page works offline, has no video export, and cannot be driven by another person\'s webcam.');
  } else set('infoClip', 'None (one still photo)');
  set('infoHash', c.photoSha256 || '');
  set('infoTool', `${DATA.tool.name} ${DATA.tool.version}, baked ${new Date(DATA.tool.bakedAt).toLocaleDateString()}`);
  set('infoGlasses', DATA.glasses ? 'Yes (blinking turned off)' : 'No');
}

function wireUI() {
  const text = document.getElementById('text');
  const sayBtn = document.getElementById('sayBtn');
  const stopBtn = document.getElementById('stopBtn');
  const file = document.getElementById('audioFile');
  const infoBtn = document.getElementById('infoBtn');
  const info = document.getElementById('info');
  const unlock = document.getElementById('unlock');
  sayBtn.addEventListener('click', () => say(text.value));
  stopBtn.addEventListener('click', stop);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) say(text.value);
  });
  file.addEventListener('change', () => {
    if (file.files && file.files[0]) sayAudio(file.files[0]);
    file.value = '';
  });
  infoBtn.addEventListener('click', () => {
    info.hidden = !info.hidden;
    infoBtn.setAttribute('aria-expanded', String(!info.hidden));
  });
  if (window.__SELFCLONE_LIVE__ && unlock) {
    unlock.hidden = false;
    unlock.addEventListener('click', () => {
      const ctx = getAudioCtx();
      if (ctx) ctx.resume().catch(() => {});
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
      } catch (e) {
        // ignore
      }
      unlock.hidden = true;
      setStatus('Sound is on. Waiting for selfclone say.');
    });
  }
}

function connectLive() {
  if (!window.__SELFCLONE_LIVE__ || !('EventSource' in window)) return;
  const es = new EventSource('/events');
  es.onopen = () => setStatus('Connected. Waiting for selfclone say.');
  es.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch (err) {
      return;
    }
    if (m.type === 'say') say(m.text);
    else if (m.type === 'audio') sayAudio(m.url);
  };
}

// ---- boot ----
const image = new Image();
image.src = DATA.image;
image
  .decode()
  .then(() => loadClip())
  .then(() => {
    samplePalette(image);
    if (OPT.renderer !== '2d') renderer = makeGL(faceCanvas, image, rig.n, tris);
    if (!renderer) {
      if (OPT.renderer !== '2d') {
        // A failed WebGL attempt may have claimed the canvas; start from a fresh one.
        const fresh = document.createElement('canvas');
        fresh.id = 'face';
        fresh.className = faceCanvas.className;
        fresh.width = RES;
        fresh.height = RES;
        faceCanvas.replaceWith(fresh);
        faceCanvas = fresh;
      }
      renderer = make2D(faceCanvas, image, tris);
    }
    faceCanvas.setAttribute('role', 'img');
    faceCanvas.setAttribute('aria-label', `AI clone avatar${DATA.consent && DATA.consent.name ? ' of ' + DATA.consent.name : ''}`);
    stage.dataset.renderer = renderer.kind;
    fillInfo();
    wireUI();
    connectLive();
    guardBadge();
    render();
    requestAnimationFrame(frame);
    window.selfclone = {
      version: DATA.tool.version,
      renderer: renderer.kind,
      say,
      sayAudio,
      stop,
      blink,
      regions,
      consent: DATA.consent,
      caps: HEAD_CAP_DEG,
      glasses: DATA.glasses,
      setIdle(v) {
        OPT.idle = !!v;
      },
      setBlink(v) {
        OPT.blink = !!v;
      },
      /** For tests and tooling: hold a mouth shape ({viseme: 'AA'}) and/or closed eyes ({blink: true}); pose(null) lets go. */
      pose(o) {
        state.hold = o && o.viseme ? String(o.viseme) : null;
        state.holdBlink = !!(o && o.blink);
      },
      clip: CLIP ? { shapes: Object.keys(clipShapes), blink: !!clipBlink, source: CLIP.source, frames: CLIP.frames } : null,
      state() {
        return {
          mode: state.mode,
          speaking: !!speech,
          renderer: renderer.kind,
          params: Object.assign({}, state.params),
          blink: state.blink,
          head: { yaw: state.yaw, pitch: state.pitch, roll: state.roll },
          max: { yaw: state.maxYaw, pitch: state.maxPitch, roll: state.maxRoll, noseShift: state.maxNoseShift },
          frames: state.frames,
          viseme: state.lastViseme,
          visemesSeen: Object.assign({}, state.visemesSeen),
          mouthPath: state.mouthPath,
          patchShape: state.patchShape,
          eyePath: state.eyePath,
          pathFrames: Object.assign({}, state.pathFrames),
          mix: Object.assign({}, state.mix),
          amp: state.amp,
        };
      },
    };
    document.documentElement.dataset.ready = '1';
    document.dispatchEvent(new CustomEvent('selfclone:ready'));
    const sayParam = qs.get('say');
    const audioParam = qs.get('audio');
    if (audioParam) sayAudio(audioParam);
    else if (sayParam) say(sayParam);
  })
  .catch((e) => {
    setStatus('Could not load the avatar image: ' + (e && e.message ? e.message : e));
  });
