// selfclone 3D kit: building blocks for 3D scene modules (import from 'selfclone/3d'): easing, seeded randomness,
// a heat colormap, soft sprites, camera keyframes, GPU particles, water molecules, server racks and a data hall.
// Everything here is deterministic: the same t always gives the same picture.
import * as THREE from 'three';

/** The frame being rendered, set by createStage(); particle sizes are in world units relative to it. */
export const FRAME = { width: 720, height: 1280 };
const pointScale = (cam) => FRAME.height / (2 * Math.tan(((cam && cam.fov) || 40) * Math.PI / 360));

// ---------- math ----------
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
export const ease = {
  linear: (k) => k,
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inCubic: (k) => k * k * k,
  outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inOutExpo: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
};
/** Eased progress of t through [a, b], 0..1. */
export const prog = (t, a, b, e = ease.inOutCubic) => e(clamp((t - a) / (b - a)));

/** Seeded random numbers (mulberry32). r() in [0,1); r.range(a,b); r.pick(arr); r.gauss(). */
export function rng(seed = 1) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (a, b) => a + (b - a) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return r;
}

// ---------- colour ----------
export const PALETTE = {
  bg: '#04070d', navy: '#071426', steel: '#1b222c', water: '#3cc8ff', waterDeep: '#0b6fae', vapor: '#d9f1ff',
  heat: '#ff7a1f', hot: '#ff3d1f', cool: '#2f8cff', power: '#ffd24a', led: '#38e1ff', ledGreen: '#3dff9a', text: '#ffffff', dim: '#9fb3c8',
};
const HEAT_STOPS = [[0, '#0a1f63'], [0.22, '#1d63d6'], [0.42, '#22c3e6'], [0.58, '#f6e05a'], [0.75, '#ff8a1f'], [0.9, '#ff3b1f'], [1, '#fff1d6']];
const HEAT = HEAT_STOPS.map(([k, c]) => [k, new THREE.Color(c)]);
/** Thermal-camera colour for v in 0 (cold, deep blue) .. 1 (white hot). Writes into out if given. */
export function thermal(v, out = new THREE.Color()) {
  v = clamp(v);
  for (let i = 1; i < HEAT.length; i++) {
    if (v <= HEAT[i][0]) { const [k0, c0] = HEAT[i - 1], [k1, c1] = HEAT[i]; return out.copy(c0).lerp(c1, (v - k0) / (k1 - k0)); }
  }
  return out.copy(HEAT[HEAT.length - 1][1]);
}
/** GLSL version of thermal() to paste into shaders: vec3 thermal(float v). */
export const THERMAL_GLSL = `vec3 thermal(float v){ v=clamp(v,0.0,1.0);
  vec3 c0=vec3(0.039,0.122,0.388), c1=vec3(0.114,0.388,0.839), c2=vec3(0.133,0.765,0.902), c3=vec3(0.965,0.878,0.353), c4=vec3(1.0,0.541,0.122), c5=vec3(1.0,0.231,0.122), c6=vec3(1.0,0.945,0.839);
  if(v<0.22) return mix(c0,c1,v/0.22); if(v<0.42) return mix(c1,c2,(v-0.22)/0.2); if(v<0.58) return mix(c2,c3,(v-0.42)/0.16);
  if(v<0.75) return mix(c3,c4,(v-0.58)/0.17); if(v<0.9) return mix(c4,c5,(v-0.75)/0.15); return mix(c5,c6,(v-0.9)/0.1); }`;

// ---------- textures ----------
const texCache = new Map();
/** A soft round sprite (radial falloff) for glow, steam and particles. */
export function softTexture(kind = 'soft') {
  if (texCache.has(kind)) return texCache.get(kind);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (kind === 'puff') { grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  else if (kind === 'dot') { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(kind, tex);
  return tex;
}
/** A canvas texture drawn by fn(ctx, w, h). */
export function canvasTexture(w, h, fn, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

// ---------- camera ----------
/**
 * Move the camera along keyframes: keys = [{t, pos:[x,y,z], look:[x,y,z], fov?, e?: ease}]. Positions blend with
 * the key's ease (default inOutCubic) between consecutive keys. Call every frame with scene-local t.
 */
export function cameraPath(camera, keys, t) {
  let a = keys[0], b = keys[0];
  for (let i = 0; i < keys.length; i++) { if (t >= keys[i].t) { a = keys[i]; b = keys[Math.min(i + 1, keys.length - 1)]; } }
  if (t < keys[0].t) { a = b = keys[0]; }
  const k = a === b ? 0 : (b.e ?? ease.inOutCubic)(clamp((t - a.t) / (b.t - a.t)));
  camera.position.set(lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k));
  const la = a.look ?? [0, 0, 0], lb = b.look ?? la;
  camera.lookAt(lerp(la[0], lb[0], k), lerp(la[1], lb[1], k), lerp(la[2], lb[2], k));
  const fa = a.fov ?? camera.fov, fb = b.fov ?? fa;
  const f = lerp(fa, fb, k);
  if (Math.abs(f - camera.fov) > 1e-4) { camera.fov = f; camera.updateProjectionMatrix(); }
  if (a.roll != null || b.roll != null) camera.rotateZ(lerp(a.roll ?? 0, b.roll ?? 0, k));
}
/** A small deterministic hand-held drift to add on top of a camera path (amp in world units). */
export function shake(camera, t, amp = 0.02, speed = 0.7) {
  camera.position.x += amp * (Math.sin(t * 1.7 * speed) * 0.6 + Math.sin(t * 3.1 * speed + 1) * 0.4);
  camera.position.y += amp * (Math.sin(t * 1.3 * speed + 2) * 0.6 + Math.sin(t * 2.7 * speed) * 0.4);
}

// ---------- particles ----------
/**
 * n GPU points with per-point position, colour, size (world units) and alpha. Fill the arrays each frame, then
 * call commit(). opts: { texture: 'soft'|'puff'|'dot', additive: true, depthWrite: false, fog: true }
 */
export function makePoints(n, opts = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  col.fill(1); size.fill(0.1); alpha.fill(1);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: softTexture(opts.texture ?? 'soft') }, scale: { value: pointScale(null) }, intensity: { value: opts.intensity ?? 1 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float scale; varying vec3 vC; varying float vA;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float intensity; varying vec3 vC; varying float vA;
      void main(){ vec4 m = texture2D(map, gl_PointCoord); float a = m.a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * intensity, a); }`,
    transparent: true, depthWrite: opts.depthWrite ?? false, blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  // Sizes are world units seen through the camera that draws them, unless setFov() pinned a field of view.
  let pinnedFov = null;
  points.onBeforeRender = (r, s, cam) => { mat.uniforms.scale.value = pointScale(pinnedFov ? { fov: pinnedFov } : cam); };
  return {
    points, pos, col, size, alpha, n,
    /** Size the points as if seen through this fov (degrees), whatever camera draws them; null follows the camera. */
    setFov(fov) { pinnedFov = fov || null; },
    commit() { for (const k of ['position', 'color', 'size', 'alpha']) geo.attributes[k].needsUpdate = true; },
  };
}

/**
 * Instanced water molecules (one red oxygen, two white hydrogens, 104.5° apart). Returns { group, set(i, x,y,z, rx,ry,rz, s), hide(i), commit() }.
 * radius: oxygen radius in world units.
 */
export function makeMolecules(n, { radius = 0.12, emissive = 0.0 } = {}) {
  const group = new THREE.Group();
  const oGeo = new THREE.SphereGeometry(radius, 20, 14), hGeo = new THREE.SphereGeometry(radius * 0.62, 16, 10);
  const oMat = new THREE.MeshStandardMaterial({ color: '#e8473b', roughness: 0.35, metalness: 0.0, emissive: '#e8473b', emissiveIntensity: emissive });
  const hMat = new THREE.MeshStandardMaterial({ color: '#f4f7fb', roughness: 0.35, metalness: 0.0, emissive: '#ffffff', emissiveIntensity: emissive * 0.6 });
  const O = new THREE.InstancedMesh(oGeo, oMat, n), H1 = new THREE.InstancedMesh(hGeo, hMat, n), H2 = new THREE.InstancedMesh(hGeo, hMat, n);
  for (const m of [O, H1, H2]) { m.frustumCulled = false; group.add(m); }
  const half = (104.5 / 2) * (Math.PI / 180), d = radius * 1.05;
  const h1 = new THREE.Vector3(Math.sin(half) * d, -Math.cos(half) * d, 0), h2 = new THREE.Vector3(-Math.sin(half) * d, -Math.cos(half) * d, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group, O, H1, H2,
    set(i, x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) {
      e.set(rx, ry, rz); q.setFromEuler(e); p.set(x, y, z); s.set(sc, sc, sc);
      m4.compose(p, q, s); O.setMatrixAt(i, m4);
      v.copy(h1).multiplyScalar(sc).applyQuaternion(q).add(p); m4.compose(v, q, s); H1.setMatrixAt(i, m4);
      v.copy(h2).multiplyScalar(sc).applyQuaternion(q).add(p); m4.compose(v, q, s); H2.setMatrixAt(i, m4);
    },
    hide(i) { O.setMatrixAt(i, zero); H1.setMatrixAt(i, zero); H2.setMatrixAt(i, zero); },
    commit() { O.instanceMatrix.needsUpdate = H1.instanceMatrix.needsUpdate = H2.instanceMatrix.needsUpdate = true; },
  };
}

// ---------- server racks and the data hall ----------
let rackFrontTex = null;
/** The front of a 42U rack: servers with drive bays and vents (map) plus its LEDs (emissive map). */
function rackFront() {
  if (rackFrontTex) return rackFrontTex;
  const w = 256, h = 1024, r = rng(7);
  const draw = (emissive) => (g) => {
    g.fillStyle = emissive ? '#000' : '#0d1117'; g.fillRect(0, 0, w, h);
    const units = [2, 2, 1, 1, 2, 4, 2, 2, 1, 1, 2, 2, 4, 2, 2, 1, 2, 2, 2, 1, 2];
    let y = 18;
    for (const u of units) {
      const uh = u * 23;
      if (y + uh > h - 18) break;
      if (!emissive) {
        const grd = g.createLinearGradient(0, y, 0, y + uh); grd.addColorStop(0, '#2b333f'); grd.addColorStop(1, '#161b23');
        g.fillStyle = grd; g.fillRect(14, y, w - 28, uh - 3);
        g.fillStyle = '#0a0d12';
        for (let x = 22; x < w - 90; x += 9) g.fillRect(x, y + 4, 5, uh - 11); // vents / drive bays
        g.fillStyle = '#3a4452'; g.fillRect(w - 86, y + 5, 60, uh - 13);
      }
      for (let k = 0; k < 3; k++) {
        const on = r() < 0.8, cols = ['#3dff9a', '#38e1ff', '#38e1ff', '#ffb547'];
        g.fillStyle = emissive ? (on ? r.pick(cols) : '#000') : '#202833';
        g.fillRect(w - 80 + k * 18, y + uh / 2 - 4, 8, 6);
      }
      if (emissive && r() < 0.5) { g.fillStyle = 'rgba(56,225,255,0.55)'; g.fillRect(20, y + uh - 6, (w - 120) * r(), 2); }
      y += uh;
    }
  };
  rackFrontTex = { map: canvasTexture(w, h, draw(false)), emissive: canvasTexture(w, h, draw(true)) };
  return rackFrontTex;
}

/**
 * One server rack (0.6 wide, 2.0 tall, 1.1 deep), front facing +z, standing on y=0.
 * Returns a Group; group.userData.front is the front mesh (its material.emissiveIntensity drives the LED glow).
 */
export function makeRack({ glow = 2.2 } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.0, 1.1), new THREE.MeshStandardMaterial({ color: '#141921', metalness: 0.7, roughness: 0.4 }));
  body.position.y = 1.0; g.add(body);
  const t = rackFront();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.94), new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: '#ffffff', emissiveIntensity: glow, metalness: 0.5, roughness: 0.35 }));
  front.position.set(0, 1.0, 0.551); g.add(front);
  g.userData.front = front;
  return g;
}

/**
 * A long data hall: rows x perRow racks in pairs facing a cold aisle along -z, reflective floor, ceiling light
 * strips, cable trays, and blinking LEDs (points whose blink is a pure function of time).
 * Returns { group, update(t), ledMaterial, length } — call update(t) every frame for the blinking.
 * The camera looks down the aisle from z>0 toward -z; the hall spans z in [0, -length].
 */
export function makeDataHall({ rows = 4, perRow = 28, aisle = 1.6, rowGap = 2.6, seed = 3, glow = 2.2, lights = true } = {}) {
  const group = new THREE.Group();
  const r = rng(seed);
  const pitch = 0.62, length = perRow * pitch;
  const t = rackFront();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#141921', metalness: 0.7, roughness: 0.4 });
  const frontMat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: '#ffffff', emissiveIntensity: glow, metalness: 0.5, roughness: 0.35 });
  const total = rows * 2 * perRow;
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 2.0, 1.1), bodyMat, total);
  const fronts = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.56, 1.94), frontMat, total);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const ledPos = [];
  let i = 0;
  // Row pairs: each pair faces a cold aisle. Row centres along x.
  for (let rp = 0; rp < rows; rp++) {
    const cx = (rp - (rows - 1) / 2) * (aisle + 2.2 + rowGap);
    for (const side of [-1, 1]) {
      const x = cx + side * (aisle / 2 + 0.55);
      const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2; // fronts face the aisle
      q.setFromAxisAngle(up, yaw);
      for (let k = 0; k < perRow; k++) {
        const z = -k * pitch - 0.3;
        m.compose(new THREE.Vector3(x, 1.0, z), q, new THREE.Vector3(1, 1, 1)); bodies.setMatrixAt(i, m);
        const fx = x - side * 0.552;
        m.compose(new THREE.Vector3(fx, 1.0, z), q, new THREE.Vector3(1, 1, 1)); fronts.setMatrixAt(i, m);
        for (let l = 0; l < 6; l++) ledPos.push(fx - side * 0.01, 0.2 + r() * 1.7, z + (r() - 0.5) * 0.45, r(), r());
        i++;
      }
    }
  }
  group.add(bodies, fronts);
  // Blinking LEDs.
  const n = ledPos.length / 5;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), ph = new Float32Array(n), hue = new Float32Array(n);
  for (let k = 0; k < n; k++) { p.set(ledPos.slice(k * 5, k * 5 + 3), k * 3); ph[k] = ledPos[k * 5 + 3]; hue[k] = ledPos[k * 5 + 4]; }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('hue', new THREE.BufferAttribute(hue, 1));
  const ledMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, map: { value: softTexture('dot') }, uBoost: { value: 1 }, scale: { value: pointScale(null) } },
    vertexShader: `attribute float phase; attribute float hue; uniform float uTime; uniform float scale; varying vec3 vC; varying float vA;
      void main(){ float blink = step(0.35, fract(uTime * (0.6 + phase * 2.4) + phase * 7.0));
        vC = hue < 0.55 ? vec3(0.22,0.88,1.0) : (hue < 0.9 ? vec3(0.24,1.0,0.6) : vec3(1.0,0.71,0.28));
        vA = 0.25 + 0.75 * blink;
        vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 0.016 * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float uBoost; varying vec3 vC; varying float vA;
      void main(){ vec4 m = texture2D(map, gl_PointCoord); if (m.a * vA < 0.01) discard; gl_FragColor = vec4(vC * 1.6 * uBoost, m.a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const leds = new THREE.Points(geo, ledMaterial); leds.frustumCulled = false; group.add(leds);
  leds.onBeforeRender = (r, s, cam) => { ledMaterial.uniforms.scale.value = pointScale(cam); };
  // Floor: dark, glossy, with tile seams.
  const W = rows * (aisle + 2.2 + rowGap) + 8;
  const floorTex = canvasTexture(256, 256, (g) => { g.fillStyle = '#9aa6b4'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#5d6774'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256); for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(r() * 256 | 0, r() * 256 | 0, 2, 2); } }, { repeat: [W / 0.6, (length + 20) / 0.6] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, length + 20), new THREE.MeshStandardMaterial({ color: '#2a3340', map: floorTex, metalness: 0.4, roughness: 0.28 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -length / 2 + 4); group.add(floor);
  // Ceiling light strips above each cold aisle, and cable trays above the racks.
  if (lights) {
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe9ff').multiplyScalar(1.15) });
    const trayMat = new THREE.MeshStandardMaterial({ color: '#3a434f', metalness: 0.8, roughness: 0.4 });
    for (let rp = 0; rp < rows; rp++) {
      const cx = (rp - (rows - 1) / 2) * (aisle + 2.2 + rowGap);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, length), stripMat); strip.position.set(cx, 3.4, -length / 2 - 1); group.add(strip);
      for (const side of [-1, 1]) {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, length + 4), trayMat); tray.position.set(cx + side * (aisle / 2 + 0.55), 2.45, -length / 2 + 1); group.add(tray);
      }
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, length + 20), new THREE.MeshStandardMaterial({ color: '#0b0f15', roughness: 0.9 }));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 3.6, -length / 2 + 4); group.add(ceiling);
  }
  return { group, ledMaterial, frontMaterial: frontMat, length, pitch, update(t) { ledMaterial.uniforms.uTime.value = t; } };
}
