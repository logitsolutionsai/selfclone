// selfclone 3D stage: the three.js renderer a 3D scene module draws on, with cinematic post-processing (bloom,
// vignette, film grain), an HTML layer for labels and counters synced to time, and the deterministic seek(t)
// selfclone calls for every frame. Import it in a scene module as `import { createStage } from 'selfclone/3d'`.
//
// A 3D scene module exports default { setup(info), update(t, stage), draw?(stage, t) }:
//   setup(info) builds the scene and returns createStage(...). info = { width, height, fps, duration, lines,
//     transparent } where lines are the scene's spoken lines with scene-local {text, start, end}.
//   update(t, stage) poses everything for scene-local second t. It must be a pure function of t: frames are
//     rendered out of order by several pages, so never carry state from one frame to the next.
//   draw(stage, t), optional, replaces the default stage.composer.render() (split screens, several scenes).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, ease, FRAME } from './kit.js';

const info = () => window.__sc3dInfo || { width: 720, height: 1280, fps: 24, duration: 10, lines: [], transparent: false };

/** The frame size in pixels (live bindings: set by createStage, so read them after it). */
export let W = info().width;
export let H = info().height;

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.35 }, uGrain: { value: 0.035 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(0, 0, 0) }, uRes: { value: new THREE.Vector2(720, 1280) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uFade; uniform vec3 uFadeColor; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y; float v = smoothstep(0.75, 0.2, length(q) * 1.15);
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      float g = h(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      c.rgb += g * uGrain;
      c.rgb = mix(c.rgb, uFadeColor, uFade);
      gl_FragColor = c; }`,
};

/**
 * Make the stage. opts: { background, fog: {color, near, far} | {color, density}, fov, near, far, exposure,
 * bloom: {strength, radius, threshold} | false, vignette, grain, env (room reflections, default on),
 * envIntensity, shadows, samples (MSAA, default 4) }
 */
export function createStage(opts = {}) {
  const I = info();
  W = I.width; H = I.height;
  FRAME.width = W; FRAME.height = H;
  const transparent = !!I.transparent;
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: transparent, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !!opts.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (transparent) renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.background = transparent ? null : new THREE.Color(opts.background ?? '#04070d');
  if (opts.fog) scene.fog = opts.fog.density != null ? new THREE.FogExp2(opts.fog.color, opts.fog.density) : new THREE.Fog(opts.fog.color, opts.fog.near ?? 10, opts.fog.far ?? 80);
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 40, W / H, opts.near ?? 0.05, opts.far ?? 500);
  camera.position.set(0, 0, 10);

  let envTex = null;
  if (opts.env !== false) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = opts.envIntensity ?? 0.6;
  }

  const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: opts.samples ?? 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let bloom = null;
  if (opts.bloom !== false && !(transparent && opts.bloom == null)) {
    const b = opts.bloom || {};
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), b.strength ?? 0.9, b.radius ?? 0.55, b.threshold ?? 0.82);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.uVignette.value = opts.vignette ?? (transparent ? 0 : 0.35);
  finish.uniforms.uGrain.value = opts.grain ?? (transparent ? 0 : 0.035);
  finish.uniforms.uRes.value.set(W, H);
  composer.addPass(finish);

  const ui = document.getElementById('ui');
  const labels = [];

  const stage = {
    THREE, renderer, scene, camera, composer, renderPass, bloom, finish, ui, env: envTex, W, H, info: I, t: 0,
    /** Fade the whole frame to a colour (0..1), e.g. for a flash or a dip. */
    fade(amount, color = '#000') { finish.uniforms.uFade.value = clamp(amount, 0, 1); finish.uniforms.uFadeColor.value.set(color); },
    /**
     * A text label synced to time. x, y are fractions of the frame (0..1) for the label's anchor point.
     * o: { at, out (seconds; omit = stays), size (px), weight, color, align: 'center'|'left'|'right',
     *      anim: 'rise'|'fade'|'pop'|'type', chip (dark pill behind), follow: (t) => THREE.Vector3 (pins it to a
     *      3D point), dx, dy (px offset when following), html (raw HTML instead of text), letter, font }
     * Returns the element; el.set(text) changes its text.
     */
    label(text, x, y, o = {}) {
      const el = document.createElement('div');
      el.className = 'lbl' + (o.chip ? ' chip' : '');
      if (o.html) el.innerHTML = text; else el.textContent = text;
      el.style.fontSize = `${o.size ?? 36}px`;
      el.style.fontWeight = String(o.weight ?? 650);
      el.style.color = o.color ?? '#ffffff';
      if (o.letter != null) el.style.letterSpacing = `${o.letter}px`;
      if (o.font) el.style.fontFamily = o.font;
      ui.appendChild(el);
      const L = { el, x, y, o, text, kind: 'label' };
      el.set = (s) => { if (o.html) el.innerHTML = s; else el.textContent = s; L.text = s; };
      labels.push(L);
      return el;
    },
    /** A number that counts from -> to over [at, at+dur]. format(n) returns the shown text. Same options as label. */
    counter(x, y, o = {}) {
      const el = stage.label('', x, y, o);
      labels[labels.length - 1].count = { from: o.from ?? 0, to: o.to ?? 1, at: o.countAt ?? o.at ?? 0, dur: o.dur ?? 2, format: o.format ?? ((n) => Math.round(n).toLocaleString('en-US')), ease: o.ease ?? ease.outCubic };
      return el;
    },
    /** A thin leader line from (x1,y1) to (x2,y2) in frame fractions that draws itself in at `at`. */
    line(x1, y1, x2, y2, o = {}) {
      const el = document.createElement('div');
      el.className = 'line';
      if (o.color) el.style.background = o.color;
      if (o.width) el.style.height = `${o.width}px`;
      ui.appendChild(el);
      labels.push({ el, kind: 'line', x1, y1, x2, y2, o });
      return el;
    },
    /** Project a world point to frame fractions {x, y}. */
    project(v) {
      // update(t) has just moved the camera; refresh its matrices so labels follow this frame, not the last one.
      camera.updateMatrixWorld(true);
      const p = v.clone().project(camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, behind: p.z > 1 };
    },
    _updateLabels(t) {
      for (const L of labels) {
        const o = L.o;
        const at = o.at ?? 0, dur = o.inDur ?? 0.45;
        let a = clamp((t - at) / dur, 0, 1);
        if (o.out != null) a *= 1 - clamp((t - o.out) / (o.outDur ?? 0.35), 0, 1);
        if (L.kind === 'line') {
          const k = ease.outCubic(a);
          const x1 = L.x1 * W, y1 = L.y1 * H, x2 = L.x2 * W, y2 = L.y2 * H;
          const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
          L.el.style.width = `${len}px`;
          L.el.style.transform = `translate(${x1}px, ${y1}px) rotate(${ang}rad) scaleX(${k})`;
          L.el.style.opacity = String(o.out != null ? 1 - clamp((t - o.out) / 0.35, 0, 1) : (a > 0 ? 1 : 0));
          continue;
        }
        if (L.count) {
          const c = L.count;
          const k = c.ease(clamp((t - c.at) / c.dur, 0, 1));
          L.el.textContent = (o.prefix ?? '') + c.format(c.from + (c.to - c.from) * k) + (o.suffix ?? '');
        }
        if (o.anim === 'type' && !L.count) {
          const n = Math.round(L.text.length * clamp((t - at) / (o.typeDur ?? 0.6), 0, 1));
          L.el.textContent = L.text.slice(0, n);
        }
        let x = L.x * W, y = L.y * H;
        if (o.follow) { const p = stage.project(o.follow(t)); x = p.x * W + (o.dx ?? 0); y = p.y * H + (o.dy ?? 0); }
        const k = ease.outCubic(a);
        let ty = 0, s = 1;
        if ((o.anim ?? 'rise') === 'rise') ty = (1 - k) * 18;
        if (o.anim === 'pop') s = 0.6 + 0.4 * ease.outBack(a);
        const ax = o.align === 'left' ? '0%' : o.align === 'right' ? '-100%' : '-50%';
        L.el.style.transform = `translate(${x}px, ${y}px) translate(${ax}, -50%) translateY(${ty}px) scale(${s})`;
        L.el.style.opacity = String(o.anim === 'type' ? (a > 0 ? 1 : 0) * (o.out != null ? 1 - clamp((t - o.out) / 0.35, 0, 1) : 1) : a);
      }
    },
  };
  return stage;
}

/** Called by the 3D page with the scene module. Exposes window.__seek(t) for the renderer. */
export async function boot(mod) {
  if (!mod || typeof mod.setup !== 'function' || typeof mod.update !== 'function') throw new Error('A 3D scene module must export default { setup(info), update(t, stage) }.');
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const stage = await mod.setup(info());
  if (!stage || !stage.composer) throw new Error('setup() must return the stage from createStage().');
  window.__stage = stage;
  window.__seek = async (t) => {
    stage.t = t;
    stage.finish.uniforms.uTime.value = t;
    mod.update(t, stage);
    stage._updateLabels(t);
    if (mod.draw) mod.draw(stage, t); else stage.composer.render();
    stage.renderer.getContext().finish();
    return true;
  };
  window.__info = () => {
    const gl = stage.renderer.getContext();
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
  };
  window.__ready = true;
}
