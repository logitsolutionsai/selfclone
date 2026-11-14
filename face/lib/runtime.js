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
  // export=circle|square: the frame `selfclone video` records (face only, label over the chin).
  exportShape: /^(circle|square)$/.test(qs.get('export') || '') ? qs.get('export') : null,
  exportBg: /^#[0-9a-fA-F]{6}$/.test(qs.get('bg') || '') ? qs.get('bg') : null,
};
const S = DATA.size;
const RAD = Math.PI / 180;

const stage = document.getElementById('stage');
// Export frame for `selfclone video`: the stage fills the window, round or square, on a transparent or
// solid background, and the AI CLONE label moves from the corner onto the chin, inside the face, so
// cropping a corner cannot remove it.
if (OPT.exportShape) {
  const L0 = DATA.landmarks;
  const chin = L0[152];
  const st = document.createElement('style');
  const bg = OPT.exportBg || 'transparent';
  st.textContent = `html,body{background:${bg} !important;padding:0 !important;margin:0 !important;overflow:hidden}` +
    'main{max-width:none !important;margin:0 !important}' +
    `.stage{width:100vw !important;max-width:none !important;height:100vh;border-radius:${OPT.exportShape === 'circle' ? '50%' : '0'} !important;box-shadow:none !important;background:${bg} !important}` +
    '#controls,#info,#speak,#scrim{display:none !important}' +
    `.badge.export{left:${((100 * chin[0]) / S).toFixed(2)}%;top:${((100 * chin[1]) / S).toFixed(2)}%;transform:translate(-50%,-50%);` +
    'font-size:max(12px,4.4vw);letter-spacing:.09em;padding:.36em .8em;border-radius:999px;line-height:1.15;white-space:nowrap;' +
    'box-shadow:0 0 0 max(1px,.21vw) rgba(255,255,255,.25)}';
  document.head.appendChild(st);
}
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
  const cls = OPT.exportShape ? 'badge export' : 'badge';
  if (b.className !== cls) b.className = cls;
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
function makeGL(canvas, image, nVerts, tris, seam) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false });
  } catch (e) {
    gl = null;
  }
  if (!gl) return null;
  const vsSrc = 'attribute vec2 aPos; attribute vec2 aUV; uniform vec2 uSize; varying vec2 vUV;' +
    'void main(){ vec2 c = aPos / uSize * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); vUV = aUV; }';
  // uAlpha fades the lip seam strip (premultiplied output; the photo itself is opaque).
  const fsSrc = 'precision mediump float; uniform sampler2D uTex; uniform float uAlpha; varying vec2 vUV;' +
    'void main(){ gl_FragColor = texture2D(uTex, vUV) * uAlpha; }';
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
  const seamIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, seamIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, seam, gl.STATIC_DRAW);
  gl.uniform2f(gl.getUniformLocation(prog, 'uSize'), S, S);
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  const uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  gl.uniform1f(uAlpha, 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (gl.getError() !== gl.NO_ERROR) return null;
  return {
    kind: 'webgl',
    draw(pos, uv, seamAlpha) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, uv);
      gl.uniform1f(uAlpha, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      gl.drawElements(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0);
      if (seamAlpha > 0.004) {
        gl.uniform1f(uAlpha, Math.min(1, seamAlpha));
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, seamIdx);
        gl.drawElements(gl.TRIANGLES, seam.length, gl.UNSIGNED_SHORT, 0);
      }
    },
    lost: () => gl.isContextLost(),
  };
}

function make2D(canvas, image, tris, seam) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const iw = image.naturalWidth || S;
  const ih = image.naturalHeight || S;
  const k = canvas.width / S;
  function tri(pos, uv, a, b, c, growBy) {
    const x0 = pos[a] * k, y0 = pos[a + 1] * k;
    const x1 = pos[b] * k, y1 = pos[b + 1] * k;
    const x2 = pos[c] * k, y2 = pos[c + 1] * k;
    const u0 = uv[a] * iw, v0 = uv[a + 1] * ih;
    const u1 = uv[b] * iw, v1 = uv[b + 1] * ih;
    const u2 = uv[c] * iw, v2 = uv[c + 1] * ih;
    const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-6) return;
    // Expand the clip triangle a little to hide hairline seams between triangles.
    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const grow = (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return [x + (dx / d) * growBy, y + (dy / d) * growBy];
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
  return {
    kind: '2d',
    draw(pos, uv, seamAlpha) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let t = 0; t < tris.length; t += 3) tri(pos, uv, tris[t] * 2, tris[t + 1] * 2, tris[t + 2] * 2, 0.7);
      if (seamAlpha > 0.004) {
        ctx.globalAlpha = Math.min(1, seamAlpha);
        for (let t = 0; t < seam.length; t += 3) tri(pos, uv, seam[t] * 2, seam[t + 1] * 2, seam[t + 2] * 2, 0.35);
        ctx.globalAlpha = 1;
      }
    },
    lost: () => false,
  };
}

// ---- lip seam: the photo's own pixels between the inner lips ----
// The mesh has a hole inside the inner lips. When the lips are closed or nearly closed, this strip of
// triangles across the hole is drawn from the photo itself, so the rest pose and M, B, P are exactly
// the photo (no drawn line between the lips), and it fades out as the mouth opens.
const SEAM_TRIS = (() => {
  const up = [78, ...UPPER_INNER, 308];
  const low = [78, ...LOWER_INNER, 308];
  const out = [];
  for (let k = 0; k < up.length - 1; k++) {
    const a = up[k], b = up[k + 1], c = low[k + 1], d = low[k];
    if (a === d) out.push(a, b, c);
    else if (b === c) out.push(a, b, d);
    else out.push(a, b, c, a, c, d);
  }
  return new Uint16Array(out);
})();

/** How much of the photo's lip seam to show: 1 with the lips together, 0 once the mouth is open. */
function seamAlpha(pos, mw) {
  let gap = 0;
  for (let k = 0; k < UPPER_INNER.length; k++) {
    const a = UPPER_INNER[k];
    const b = LOWER_INNER[k];
    gap = Math.max(gap, Math.hypot(pos[2 * b] - pos[2 * a], pos[2 * b + 1] - pos[2 * a + 1]) - Math.hypot(rig.rest[2 * b] - rig.rest[2 * a], rig.rest[2 * b + 1] - rig.rest[2 * a + 1]));
  }
  return 1 - smoothstep(0.012 * mw, 0.075 * mw, gap);
}

// ---- mouth interior (drawn under the mesh, visible through the lip hole) ----
// Everything is shaded from the photo's own colours: a warm dark near the lips, darkest at the back,
// a faint tongue glow low in the mouth, and dim upper teeth half hidden under the upper lip. No edge is
// hard: shapes are softened with a shadow blur (which also works where canvas filters are missing).
const SOFT_OFF = 8192;
function softFill(ctx, pts, color, blurPx, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = blurPx * DPR;
  ctx.shadowOffsetX = SOFT_OFF * DPR;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach((p, j) => (j ? ctx.lineTo(p[0] - SOFT_OFF, p[1]) : ctx.moveTo(p[0] - SOFT_OFF, p[1])));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCavity(m, prm) {
  cav.setTransform(DPR, 0, 0, DPR, 0, 0);
  cav.clearRect(0, 0, S, S);
  const ring = m.inner;
  const ey = m.ey;
  const mw = m.mw;
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
  cav.fillStyle = PALETTE.deep;
  cav.fill();
  if (Math.abs(area) < 2) {
    cav.restore();
    return;
  }
  cav.clip();
  // How open the mouth is, from the inner lips: top and bottom centre.
  const top = ring[5];
  const bot = ring[15];
  const open = Math.max(0, (bot[0] - top[0]) * ey[0] + (bot[1] - top[1]) * ey[1]);
  // Warmer near the lips, darkest at the back: a soft rim of darkened lip colour inside the opening.
  cav.save();
  cav.globalAlpha = 0.9;
  cav.shadowColor = PALETTE.edge;
  cav.shadowBlur = 0.06 * mw * DPR;
  cav.shadowOffsetX = SOFT_OFF * DPR;
  cav.lineWidth = 0.09 * mw;
  cav.lineJoin = 'round';
  cav.strokeStyle = PALETTE.edge;
  cav.beginPath();
  ring.forEach((p, j) => (j ? cav.lineTo(p[0] - SOFT_OFF, p[1]) : cav.moveTo(p[0] - SOFT_OFF, p[1])));
  cav.closePath();
  cav.stroke();
  cav.restore();
  // Tongue: only a soft dark-red glow low in the mouth when the jaw is well open.
  const tA = smoothstep(0.08 * mw, 0.2 * mw, open) * 0.6;
  if (tA > 0.01) {
    const tx = bot[0] - ey[0] * 0.04 * mw;
    const ty = bot[1] - ey[1] * 0.04 * mw;
    const g = cav.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, PALETTE.tongue);
    g.addColorStop(1, PALETTE.tongueOut);
    cav.save();
    cav.globalAlpha = tA;
    cav.translate(tx, ty);
    cav.rotate(Math.atan2(-ey[0], ey[1]));
    cav.scale(0.28 * mw, 0.1 * mw);
    cav.fillStyle = g;
    cav.fillRect(-1, -1, 2, 2);
    cav.restore();
  }
  // Upper teeth: hang from the rest line of the upper lip, partly hidden under it, dim and desaturated.
  const tTeeth = (prm.teeth || 0) * smoothstep(0.03 * mw, 0.12 * mw, open);
  if (tTeeth > 0.01) {
    // The front teeth only: the middle of the upper lip line, not out to the corners.
    const up = m.upper.slice(2, -2);
    const n = up.length;
    const h = 0.085 * mw;
    const band = [];
    for (let i = 0; i < n; i++) band.push([up[i][0] - ey[0] * 0.02 * mw, up[i][1] - ey[1] * 0.02 * mw]);
    for (let i = n - 1; i >= 0; i--) {
      const k = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const len = h * (1 - 0.7 * k * k);
      band.push([up[i][0] + ey[0] * len, up[i][1] + ey[1] * len]);
    }
    softFill(cav, band, PALETTE.teeth, 0.035 * mw, 0.45 * tTeeth);
  }
  // The upper lip's shadow over the top of the opening and the teeth, so the opening has depth.
  const sx = top[0] - ey[0] * 0.01 * mw;
  const sy = top[1] - ey[1] * 0.01 * mw;
  const sh = cav.createLinearGradient(sx, sy, sx + ey[0] * 0.03 * mw, sy + ey[1] * 0.03 * mw);
  sh.addColorStop(0, PALETTE.shadow);
  sh.addColorStop(1, PALETTE.shadowOut);
  cav.fillStyle = sh;
  cav.fillRect(cx - mw, cy - mw, 2 * mw, 2 * mw);
  // Rounded shapes (O, U): the lips push forward, so the wet inside of the lips fills most of the ring
  // and the opening is a small, upright, soft-edged ellipse in the middle, not a dark hole the size of
  // the ring. Fades in with the rounding, so AA, E and the rest of the open shapes are unchanged.
  const rd = smoothstep(0.1, 0.7, prm.round || 0);
  if (rd > 0.01) {
    const ex = [ey[1], -ey[0]];
    let u0 = Infinity, u1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const p of ring) {
      const u = (p[0] - cx) * ex[0] + (p[1] - cy) * ex[1];
      const t = (p[0] - cx) * ey[0] + (p[1] - cy) * ey[1];
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    }
    const halfW = Math.max(1, (u1 - u0) / 2);
    const halfH = Math.max(1, (t1 - t0) / 2);
    const ox = cx + ex[0] * (u0 + u1) / 2 + ey[0] * (t0 + t1) / 2;
    const oy = cy + ex[1] * (u0 + u1) / 2 + ey[1] * (t0 + t1) / 2;
    const ang = Math.atan2(ex[1], ex[0]);
    const ellipse = (rx, ry, stops) => {
      cav.save();
      cav.translate(ox, oy);
      cav.rotate(ang);
      cav.scale(rx, ry);
      const g = cav.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [at, col] of stops) g.addColorStop(at, col);
      cav.fillStyle = g;
      cav.fillRect(-1.5, -1.5, 3, 3);
      cav.restore();
    };
    cav.save();
    cav.globalAlpha = rd;
    // A lighter, warmer rim just inside the lips, a muted dark centre, and a long feather between them,
    // so the opening has no cut-out edge.
    ellipse(halfW, halfH, [[0, PALETTE.hole], [0.3, PALETTE.hole], [0.72, PALETTE.holeMid], [1, PALETTE.rim]]);
    cav.restore();
  }
  cav.restore();
}

// ---- palette: the drawn mouth and lids take their colours from the photo ----
const PALETTE = {
  edge: 'rgb(70,26,20)', deep: 'rgb(22,8,6)', tongue: 'rgba(112,44,40,1)', tongueOut: 'rgba(112,44,40,0)',
  teeth: 'rgb(150,138,120)', shadow: 'rgba(40,16,14,0.85)', shadowOut: 'rgba(40,16,14,0)',
  rim: 'rgb(150,70,58)', rimIn: 'rgb(112,48,40)', hole: 'rgb(46,30,27)', holeMid: 'rgba(70,38,32,0.75)', holeOut: 'rgba(90,44,38,0)',
};
const LIDS = [];
function samplePalette(img) {
  try {
    const L = DATA.landmarks;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, S, S);
    const avg = (idx, r) => {
      let R = 0, G = 0, B = 0, n = 0;
      for (const i of idx) {
        const px = Math.round(L[i][0]);
        const py = Math.round(L[i][1]);
        const d = x.getImageData(Math.max(0, px - r), Math.max(0, py - r), 2 * r + 1, 2 * r + 1).data;
        for (let k = 0; k < d.length; k += 4) {
          R += d[k]; G += d[k + 1]; B += d[k + 2]; n++;
        }
      }
      return n ? [R / n, G / n, B / n] : null;
    };
    const skin = avg([205, 425, 200, 421, 18], 3);
    // The body of both lips (not their edges), where the lip colour is.
    const lip = avg([11, 12, 15, 16, 72, 302, 85, 315, 38, 268, 86, 316], 1);
    if (!skin || !lip) return;
    const lum = (v) => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
    const mix = (a, t, k) => a.map((v, i) => v * (1 - k) + t[i] * k);
    const scale = (v, k) => v.map((q) => q * k);
    const css = (v, a) => `rgba(${v.map((q) => Math.round(clamp(q, 0, 255))).join(',')},${a == null ? 1 : a})`;
    // Inside a mouth is redder than the lips look from outside: the lip colour with green and blue pulled down.
    const warm = [lip[0], lip[1] * 0.62, lip[2] * 0.6];
    PALETTE.deep = css(scale(warm, 0.13));
    PALETTE.edge = css(scale(warm, 0.42));
    const tongue = scale([warm[0] * 1.1, warm[1] * 0.85, warm[2] * 0.85], 0.55);
    PALETTE.tongue = css(tongue);
    PALETTE.tongueOut = css(tongue, 0);
    const shadow = scale(warm, 0.08);
    PALETTE.shadow = css(shadow, 0.6);
    PALETTE.shadowOut = css(shadow, 0);
    // Rounded shapes: the inside of the lips (lighter and warmer than the open-mouth rim) and a muted,
    // less saturated dark for the small opening.
    const rim = mix(lip, warm, 0.3);
    PALETTE.rim = css(scale(rim, 0.9));
    PALETTE.rimIn = css(scale(rim, 0.62));
    const hole = scale(warm, 0.24);
    const holeGrey = mix(hole, [lum(hole), lum(hole), lum(hole)], 0.45);
    PALETTE.hole = css(holeGrey);
    const holeMid = mix(holeGrey, scale(rim, 0.62), 0.5);
    PALETTE.holeMid = css(holeMid, 0.85);
    PALETTE.holeOut = css(scale(rim, 0.62), 0);
    // Teeth: skin and lip tones, mostly desaturated, never brighter than the skin around the mouth.
    const tb = mix(skin, lip, 0.2);
    const tl = lum(tb);
    PALETTE.teeth = css(scale(mix(tb, [tl, tl, tl], 0.6), clamp((0.92 * lum(skin)) / Math.max(1, tl), 0.6, 1.05)));
    // Lids: the skin just above the crease, and a lash colour darkened from the lid line itself.
    const eyes = [
      { up: RIGHT_EYE_UPPER, low: RIGHT_EYE_LOWER, above: EYE_REGIONS[0].ring1.slice(0, 7) },
      { up: LEFT_EYE_UPPER, low: LEFT_EYE_LOWER, above: EYE_REGIONS[1].ring1.slice(0, 7) },
    ];
    for (const e of eyes) {
      const lidSkin = avg(e.above, 2);
      const line = avg(e.up.slice(2, -2), 1);
      if (!lidSkin || !line) continue;
      LIDS.push({ up: e.up, low: e.low, skin: css(scale(lidSkin, 0.94)), crease: css(scale(lidSkin, 0.8)), lash: css(scale(mix(line, lidSkin, 0.3), 0.58)) });
    }
  } catch (e) {
    // keep defaults
  }
}

// ---- drawn blink: the upper lid slides down over the eye ----
// Used by photo avatars (and clip avatars without a closed-eye patch). A lid of skin sampled from just
// above the crease, textured with the photo's own skin above the eye (mirrored, so it joins without a
// seam), slides from the upper lid line to the lower one, with a soft lash line darkened from the lid.
let lidCtx = null;
function drawLids(pos, b) {
  if (!lidCtx || b < 0.02) return;
  const ctx = lidCtx;
  for (const lid of LIDS) {
    const U = lid.up.map((i) => [pos[2 * i], pos[2 * i + 1]]);
    const W = lid.low.map((i) => [pos[2 * i], pos[2 * i + 1]]);
    const n = U.length;
    const mid = (n - 1) >> 1;
    const ex = [U[n - 1][0] - U[0][0], U[n - 1][1] - U[0][1]];
    const el = Math.hypot(ex[0], ex[1]) || 1;
    // ey points down the face whichever way the eye's corners are listed.
    let ey = [-ex[1] / el, ex[0] / el];
    if ((W[mid][0] - U[mid][0]) * ey[0] + (W[mid][1] - U[mid][1]) * ey[1] < 0) ey = [-ey[0], -ey[1]];
    const gap = Math.max(1, (W[mid][0] - U[mid][0]) * ey[0] + (W[mid][1] - U[mid][1]) * ey[1]);
    const lift = 0.3 * gap;
    const arc = (j) => Math.sin((Math.PI * j) / (n - 1));
    // The lid edge: from the upper line toward the lower line, the middle leading a little.
    const E = U.map((p, j) => {
      const k = Math.min(1, b * (1 + 0.08 * arc(j)));
      return [p[0] + (W[j][0] - p[0]) * k, p[1] + (W[j][1] - p[1]) * k];
    });
    const T = U.map((p, j) => [p[0] - ey[0] * lift * arc(j), p[1] - ey[1] * lift * arc(j)]);
    const poly = T.concat(E.slice().reverse());
    const feather = 0.22 * gap;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    x0 = Math.floor(x0 - 2 * feather);
    y0 = Math.floor(y0 - 2 * feather);
    const k = DPR;
    const Wd = Math.ceil((x1 - x0 + 4 * feather) * k);
    const Hd = Math.ceil((y1 - y0 + 4 * feather) * k);
    const tmp = scratchCanvas('lid', Wd, Hd);
    const t = tmp.getContext('2d');
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'source-over';
    t.globalAlpha = 1;
    t.clearRect(0, 0, Wd, Hd);
    t.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    // The photo's skin above the lid line, mirrored down across the top of the lid, following the head.
    const tc = T[mid];
    const m00 = 1 - 2 * ey[0] * ey[0];
    const m01 = -2 * ey[0] * ey[1];
    const m11 = 1 - 2 * ey[1] * ey[1];
    const dTop = tc[0] * ey[0] + tc[1] * ey[1];
    const a = lid.up[0];
    const z = lid.up[n - 1];
    const hx = (pos[2 * a] - rig.rest[2 * a] + pos[2 * z] - rig.rest[2 * z]) / 2;
    const hy = (pos[2 * a + 1] - rig.rest[2 * a + 1] + pos[2 * z + 1] - rig.rest[2 * z + 1]) / 2;
    t.transform(m00, m01, m01, m11, m00 * hx + m01 * hy + 2 * dTop * ey[0], m01 * hx + m11 * hy + 2 * dTop * ey[1]);
    t.drawImage(image, 0, 0, S, S);
    t.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    // Even out the texture toward the lid colour, and shade it toward the lashes.
    const g = t.createLinearGradient(tc[0], tc[1], E[mid][0], E[mid][1]);
    g.addColorStop(0, lid.skin);
    g.addColorStop(1, lid.crease);
    t.globalAlpha = 0.35;
    t.fillStyle = g;
    t.fillRect(x0, y0, Wd / k, Hd / k);
    t.globalAlpha = 1;
    // Feathered mask: the lid shape blurred, with its bottom pushed down a little so the lid edge stays
    // solid where the lash line sits.
    const mk = scratchCanvas('lidmask', Wd, Hd);
    const mc = mk.getContext('2d');
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, Wd, Hd);
    const maskPoly = T.concat(E.map((p) => [p[0] + ey[0] * 0.25 * feather, p[1] + ey[1] * 0.25 * feather]).reverse());
    mc.save();
    mc.shadowColor = '#000';
    mc.shadowBlur = feather * k;
    mc.shadowOffsetX = SOFT_OFF * k;
    mc.fillStyle = '#000';
    mc.beginPath();
    maskPoly.forEach((p, j) => {
      const X = (p[0] - x0) * k - SOFT_OFF * k;
      const Y = (p[1] - y0) * k;
      if (j) mc.lineTo(X, Y);
      else mc.moveTo(X, Y);
    });
    mc.closePath();
    mc.fill();
    mc.restore();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(mk, 0, 0, Wd, Hd, 0, 0, Wd, Hd);
    t.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(tmp, 0, 0, Wd, Hd, x0 * k, y0 * k, Wd, Hd);
    ctx.restore();
    // Lash line along the lid edge, thickest in the middle, softly blurred.
    const lw = (0.09 + 0.06 * b) * gap;
    const band = [];
    for (let j = 0; j < n; j++) {
      const w = lw * (0.3 + 0.7 * arc(j));
      band.push([E[j][0] - ey[0] * w * 0.35, E[j][1] - ey[1] * w * 0.35]);
    }
    for (let j = n - 1; j >= 0; j--) {
      const w = lw * (0.3 + 0.7 * arc(j));
      band.push([E[j][0] + ey[0] * w * 0.65, E[j][1] + ey[1] * w * 0.65]);
    }
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    softFill(ctx, band, lid.lash, 0.1 * gap, clamp(b * 3, 0, 0.8));
    ctx.restore();
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
  holdBlink: 0,
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
  speech.startedAt = ctx.currentTime;
  setStatus(ctx.state === 'running' ? 'Playing audio.' : 'Click the page once to allow sound, then play again.');
  return done;
}

/**
 * Drive the mouth from sound measured ahead of time: {hop (seconds per value), rms: [...], centroid: [...]}
 * (Hz). Plays nothing. `selfclone video` uses it with a paused page clock, so every frame is rendered
 * at an exact audio time. `lead` (ms) starts that many ms into the sound.
 */
function sayFeatures(f, o) {
  stop();
  o = o || {};
  const hop = Number(f && f.hop);
  if (!(hop > 0) || !f.rms || !f.centroid) return Promise.resolve();
  speech = { kind: 'features', features: { hop, rms: Float32Array.from(f.rms), centroid: Float32Array.from(f.centroid) }, t0: performance.now() - (Number(o.lead) || 0), level: 0 };
  state.mode = 'audio';
  return new Promise((r) => (speechResolve = r));
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

// Coarticulation for the drawn mouth: near the end of a segment the target leans toward the next
// shape, and the tongue consonants (L, T, D, N, S) keep most of the vowel shape around them.
const mixTarget = {};
function coarticulate(seg, ms) {
  const segs = speech.tl.segments;
  const i = segs.indexOf(seg);
  const next = segs[i + 1];
  const prev = segs[i - 1];
  const shape = (s) => (s ? VISEMES[s.v] || VISEMES.rest : VISEMES.rest);
  let cur = shape(seg);
  if (seg.v === 'L') {
    const near = next && next.v !== 'rest' && next.v !== 'L' ? next : prev && prev.v !== 'rest' && prev.v !== 'L' ? prev : null;
    if (near) {
      const o = shape(near);
      const c = {};
      for (const key of PARAM_KEYS) c[key] = 0.5 * cur[key] + 0.5 * o[key];
      cur = c;
    }
  }
  const lead = Math.min(60, 0.5 * (seg.end - seg.start));
  const k = next && next.v !== seg.v ? smoothstep(seg.end - lead, seg.end + 15, ms) * 0.45 : 0;
  const nx = shape(next);
  for (const key of PARAM_KEYS) mixTarget[key] = cur[key] * (1 - k) + nx[key] * k;
  state.target = mixTarget;
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
    if (!state.clipTarget && seg) coarticulate(seg, ms);
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
    soundTarget(rms, den > 0 ? num2 / den : 0, dt);
    return;
  }
  if (speech.kind === 'features') {
    // Loudness and spectral centroid measured ahead of time (selfclone video), read at the page clock,
    // so a recording is frame-accurate and the same on every run.
    const f = speech.features;
    const k = Math.floor((now - speech.t0) / (1000 * f.hop));
    if (k >= f.rms.length) {
      endSpeech();
      return;
    }
    soundTarget(f.rms[Math.max(0, k)] || 0, f.centroid[Math.max(0, k)] || 0, dt);
  }
}

/** Audio mode: loudness (RMS) opens the mouth, the spectral centroid moves it between wide and round. */
function soundTarget(rms, centroid, dt) {
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
    jaw: 0.6 * lvl,
    wide: clamp((cn - 0.45) * 1.1 * lvl, -0.6, 0.6),
    round: Math.max(0, 0.4 - cn) * 2 * lvl,
    raise: 0.25 * cn * lvl,
    tuck: 0,
    teeth: lvl > 0.15 ? 0.6 * cn : 0,
    lowerTeeth: 0,
  };
}

// Each mouth parameter follows its target as a critically damped spring (solved exactly, so any frame
// time is stable): it eases in and out, never overshoots, and short consonants blend into their
// neighbours instead of snapping the mouth to a new shape every frame.
const PARAM_KEYS = Object.keys(VISEMES.rest);
const vel = {};
for (const key of PARAM_KEYS) vel[key] = 0;
function updateParams(dt) {
  const closing = state.target.jaw < state.params.jaw;
  const w = closing ? 44 : 38;
  const e = Math.exp(-w * dt);
  for (const key of PARAM_KEYS) {
    const x0 = state.params[key] - (state.target[key] || 0);
    const c = vel[key] + w * x0;
    state.params[key] = (state.target[key] || 0) + (x0 + c * dt) * e;
    vel[key] = (vel[key] - w * c * dt) * e;
    if (Math.abs(state.params[key] - (state.target[key] || 0)) < 1e-4 && Math.abs(vel[key]) < 1e-3) {
      state.params[key] = state.target[key] || 0;
      vel[key] = 0;
    }
  }
}

function updateBlink(now) {
  if (state.holdBlink && !DATA.glasses) {
    state.blink = state.holdBlink;
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
    // About 170 ms in all, more than half shut for about 100 ms: 50 ms to close, 30 ms closed, 90 ms to reopen.
    if (e < 50) a = e / 50;
    else if (e < 80) a = 1;
    else if (e < 170) a = 1 - (e - 80) / 90;
    a = clamp(a, 0, 1);
    state.blink = a * a * (3 - 2 * a);
    if (e >= 170) {
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
  // The drawn lid covers the eye; under it the mesh only lets the lids and the skin above them sink a little.
  pose.blinkL = pose.blinkR = 0.2 * state.blink;
  if (CLIP) {
    extra = clipDisplacement();
    if (clipBlink) pose.blinkL = pose.blinkR = 0; // the measured eyelids replace the drawn blink
  }
  const { pos, uv } = rig.deform(pose, extra);
  drawCavity(rig.mouth(pose), state.params);
  renderer.draw(pos, uv, seamAlpha(pos, rig.frame.mw));
  if (lidCtx && !CLIP) {
    lidCtx.setTransform(1, 0, 0, 1, 0, 0);
    lidCtx.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
  }
  const used = CLIP ? drawClipPatches(pos) : { path: null, shape: null, eyes: null };
  if (!(CLIP && clipBlink)) drawLids(pos, state.blink);
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
  renderer = make2D(faceCanvas, image, tris, SEAM_TRIS);
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
    set('infoNote', 'This is an AI clone, not the person and not a recording of them. It is one frame of a short clip warped in your browser, with small patches of the mouth and eyes from the same clip. The page works offline and records nothing; a video can be made only with selfclone video, from your own audio, with an AI CLONE label on every frame. It cannot be driven by another person\'s webcam.');
  } else set('infoClip', 'None (one still photo)');
  set('infoHash', c.photoSha256 || '');
  set('infoTool', `${DATA.tool.name} ${DATA.tool.version}, baked ${new Date(DATA.tool.bakedAt).toLocaleDateString()}`);
  set('infoGlasses', DATA.glasses ? 'Yes (blinking turned off)' : 'No');
}

// ---- page UI: the About sheet and the speaking line (springs from fluid.js) ----
/** How far through the current speech we are, 0 to 1, or null when the clone is not speaking. */
function speechProgress() {
  if (!speech) return null;
  if (speech.kind === 'text') return speech.t0 == null ? 0 : clamp((performance.now() - speech.t0 + speech.offset) / Math.max(1, speech.tl.total), 0, 1);
  if (speech.kind === 'audio') return speech.startedAt == null || !audioCtx ? 0 : clamp((audioCtx.currentTime - speech.startedAt) / Math.max(0.01, speech.duration), 0, 1);
  if (speech.kind === 'features') return clamp((performance.now() - speech.t0) / Math.max(1, speech.features.rms.length * speech.features.hop * 1000), 0, 1);
  return null;
}

/** A thin ink line under the face that tracks the speech 1:1 and fades in and out with it. */
function wireSpeakLine() {
  const line = document.getElementById('speak');
  if (!line) return;
  const bar = line.firstElementChild;
  const fade = Fluid.spring({ value: 0, response: 0.3, damping: 1, onUpdate: (v) => (line.style.opacity = String(clamp(v, 0, 1))) });
  let shown = false;
  let last = -1;
  const tick = () => {
    const p = speechProgress();
    if (p != null) {
      if (!shown) {
        shown = true;
        fade.to(1);
      }
      const q = Math.round(p * 1000) / 1000;
      if (q !== last) {
        last = q;
        bar.style.transform = `scaleX(${q})`;
      }
    } else if (shown) {
      shown = false;
      fade.to(0);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * About this clone: a solid sheet that grows out of its button (scale 0.96 to 1, 8 px of travel, damping 0.8,
 * response 0.3) and closes back into it. Under 600 px wide it is a bottom sheet over a scrim, which the grab
 * bar drags 1:1 (rubber band above open); on release the velocity is projected, the sheet closes if it would
 * come to rest past 40% of its height, and the release velocity is handed to the spring.
 */
function wireAbout(btn, sheet) {
  const scrim = document.getElementById('scrim');
  const grab = document.getElementById('grab');
  const narrow = matchMedia('(max-width: 599.98px)');
  const SHEET = { response: 0.3, damping: 0.8 }; // opening bounces slightly
  const SETTLE = { response: 0.3, damping: 1 }; // closing does not
  let open = false;
  let mode = null; // 'pop' (anchored to the button) or 'sheet' (bottom sheet)
  let dir = 1; // +1 when the popover sits above the button (it rises out of it), -1 below
  let H = 1;
  const finishClose = () => {
    if (open) return;
    sheet.hidden = true;
    scrim.hidden = true;
    sheet.style.transform = sheet.style.opacity = scrim.style.opacity = '';
    mode = null;
  };
  const pop = Fluid.spring({
    value: 0,
    ...SHEET,
    onUpdate: (p) => {
      sheet.style.opacity = String(clamp(p, 0, 1));
      sheet.style.transform = `translateY(${(dir * 8 * (1 - p)).toFixed(2)}px) scale(${(0.96 + 0.04 * p).toFixed(4)})`;
    },
    onRest: () => mode === 'pop' && finishClose(),
  });
  const drag = Fluid.spring({
    value: 0,
    ...SHEET,
    onUpdate: (y) => {
      sheet.style.transform = `translateY(${y.toFixed(2)}px)`;
      scrim.style.opacity = String(clamp(1 - y / H, 0, 1));
    },
    onRest: () => mode === 'sheet' && finishClose(),
  });
  // Below the button when it fits, otherwise above; transform-origin on the button.
  const place = () => {
    const r = btn.getBoundingClientRect();
    const w = sheet.offsetWidth;
    const h = sheet.offsetHeight;
    const below = r.bottom + 8 + h <= innerHeight - 16 || r.top - 8 - h < 16;
    const top = below ? Math.min(r.bottom + 8, Math.max(16, innerHeight - 16 - h)) : r.top - 8 - h;
    const left = clamp(r.left, 16, Math.max(16, innerWidth - 16 - w));
    dir = below ? -1 : 1;
    sheet.style.left = `${Math.round(left)}px`;
    sheet.style.top = `${Math.round(top)}px`;
    sheet.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${Math.round((below ? r.bottom : r.top) - top)}px`;
  };
  const show = () => {
    const visible = !sheet.hidden;
    open = true;
    btn.setAttribute('aria-expanded', 'true');
    sheet.hidden = false;
    const want = narrow.matches ? 'sheet' : 'pop';
    if (visible && mode !== want) {
      pop.stop();
      drag.stop();
    }
    if (want === 'sheet') {
      sheet.style.left = sheet.style.top = sheet.style.transformOrigin = '';
      scrim.hidden = false;
      H = Math.max(1, sheet.offsetHeight);
      if (!visible || mode !== 'sheet') drag.set(H);
      mode = 'sheet';
      drag.to(0, SHEET);
    } else {
      place();
      if (!visible || mode !== 'pop') pop.set(0);
      mode = 'pop';
      pop.to(1, SHEET);
    }
    sheet.focus({ preventScroll: true });
  };
  const hide = (o) => {
    if (!open) return;
    open = false;
    btn.setAttribute('aria-expanded', 'false');
    if (sheet.contains(document.activeElement)) btn.focus({ preventScroll: true });
    if (mode === 'sheet') drag.to(H, o || SETTLE);
    else pop.to(0, SETTLE);
  };
  btn.addEventListener('click', () => (open ? hide() : show()));
  scrim.addEventListener('click', () => hide());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) hide();
  });
  document.addEventListener('pointerdown', (e) => {
    if (open && mode === 'pop' && !sheet.contains(e.target) && !btn.contains(e.target)) hide();
  }, true);
  const replace = () => {
    if (sheet.hidden) return;
    if (narrow.matches !== (mode === 'sheet')) {
      pop.stop();
      drag.stop();
      const was = open;
      open = false;
      finishClose();
      if (was) show();
    } else if (mode === 'pop') place();
    else H = Math.max(1, sheet.offsetHeight);
  };
  addEventListener('resize', replace);
  addEventListener('scroll', () => mode === 'pop' && !sheet.hidden && place(), { passive: true });

  // Drag to dismiss (bottom sheet only): pointer capture, 1:1 tracking, rubber band above open, velocity handoff.
  const vt = Fluid.velocityTracker();
  let grip = null;
  grab.addEventListener('pointerdown', (e) => {
    if (mode !== 'sheet' || !open || e.button > 0) return;
    grab.setPointerCapture(e.pointerId);
    drag.stop();
    grip = { id: e.pointerId, y0: e.clientY, from: drag.value };
    vt.reset();
    vt.add(drag.value);
  });
  grab.addEventListener('pointermove', (e) => {
    if (!grip || e.pointerId !== grip.id) return;
    let y = grip.from + (e.clientY - grip.y0);
    if (y < 0) y = Fluid.rubber(y, H);
    drag.set(y);
    vt.add(y);
  });
  const release = (e) => {
    if (!grip || e.pointerId !== grip.id) return;
    grip = null;
    const v = vt.get();
    const fling = { velocity: v, response: 0.3, damping: Math.abs(v) > 300 ? 0.8 : 1 };
    if (drag.value + Fluid.project(v) > 0.4 * H) hide(fling);
    else drag.to(0, fling);
  };
  grab.addEventListener('pointerup', release);
  grab.addEventListener('pointercancel', release);
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
  for (const b of document.querySelectorAll('#controls button, #controls .file')) Fluid.pressable(b);
  wireAbout(infoBtn, info);
  wireSpeakLine();
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
    if (!DATA.glasses && !(CLIP && clipBlink)) {
      if (!CLIP) {
        patchCanvas.hidden = false;
        patchCanvas.width = RES;
        patchCanvas.height = RES;
        patchCtx = patchCanvas.getContext('2d');
      }
      lidCtx = patchCtx;
    }
    if (OPT.renderer !== '2d') renderer = makeGL(faceCanvas, image, rig.n, tris, SEAM_TRIS);
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
      renderer = make2D(faceCanvas, image, tris, SEAM_TRIS);
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
      sayFeatures,
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
      /** For tests and tooling: hold a mouth shape ({viseme: 'AA'}) and/or closed eyes ({blink: true}, or 0 to 1 for part-closed); pose(null) lets go. */
      pose(o) {
        state.hold = o && o.viseme ? String(o.viseme) : null;
        const b = o && o.blink;
        state.holdBlink = b === true ? 1 : clamp(Number(b) || 0, 0, 1);
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
