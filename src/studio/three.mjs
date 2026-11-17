// 3D scenes: a scene's "three" block names a JavaScript module that draws with three.js (see three/stage.js for
// the module contract). Its frames are rendered here, ahead of the main render, in a separate GPU-enabled Chrome
// (the main render runs without the GPU because SVG filters are faster on the CPU), cached as JPEG (or PNG for
// a transparent layer) per scene, and composited into the scene by the page like a Manim clip.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_DIR = path.join(HERE, 'three');
const require = createRequire(import.meta.url);
/** The transition into a scene lasts this long (page.mjs TD); the previous scene must still be drawn during it. */
const TRANSITION = 0.5;
const ASSETS = /\.(png|jpe?g|webp|glb|gltf|bin|hdr|ktx2)$/i;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

let threeRoot = null;
/** Where three.js is installed (a selfclone dependency). */
export function threeDir() {
  if (threeRoot) return threeRoot;
  try {
    // three's package.json is not in its exports; its main file lives in <root>/build/.
    threeRoot = path.dirname(path.dirname(require.resolve('three')));
  } catch {
    throw new Error('3D scenes need three.js: run "npm install" in the selfclone folder.');
  }
  return threeRoot;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** The module, every local module it imports (relative imports, followed recursively), and the asset files beside it. */
export function moduleFiles(file) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f) || !fs.existsSync(f)) return;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      walk(path.resolve(path.dirname(f), m[1] || m[2] || m[3]));
    }
  };
  walk(path.resolve(file));
  const dir = path.dirname(path.resolve(file));
  const assets = [];
  const scan = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) scan(p, depth + 1);
      else if (e.isFile() && ASSETS.test(e.name)) assets.push(p);
    }
  };
  scan(dir, 0);
  return [...seen, ...assets.sort()];
}

/**
 * One job per scene with a "three" block: which module, which frames, and where they are cached.
 * Frame k of a job is the layer at scene-local second k / fps; it runs from the scene's start to its end, plus the
 * next scene's transition when that is not a cut.
 */
export function threeJobs(spec, timeline, { baseDir, fps, width, height, cacheDir }) {
  const kitHash = sha(['stage.js', 'kit.js', 'index.js'].map((f) => fs.readFileSync(path.join(KIT_DIR, f), 'utf8')).join('\n'));
  let version = 'none';
  const jobs = [];
  for (const [i, s] of spec.scenes.entries()) {
    if (!s.three) continue;
    if (version === 'none') version = JSON.parse(fs.readFileSync(path.join(threeDir(), 'package.json'), 'utf8')).version;
    const T = timeline[i];
    const file = path.resolve(baseDir, s.three.module);
    if (!fs.existsSync(file)) throw new Error(`Scene ${i + 1}: 3D module not found: ${file}`);
    const next = timeline[i + 1];
    const tail = next && next.transition !== 'cut' ? TRANSITION : 0;
    const duration = T.end - T.start + tail;
    const frames = Math.max(1, Math.ceil(duration * fps));
    const w = Math.round((width * s.three.w) / 2) * 2, h = Math.round((height * s.three.h) / 2) * 2;
    const info = { width: w, height: h, fps, duration, transparent: s.three.transparent, lines: T.lines.map((l) => ({ text: l.text, start: +(l.start - T.start).toFixed(3), end: +(l.end - T.start).toFixed(3) })) };
    const files = moduleFiles(file);
    const key = sha(JSON.stringify({ kitHash, version, info, files: files.map((f) => [path.relative(path.dirname(file), f), sha(fs.readFileSync(f))]) })).slice(0, 16);
    const dir = path.join(cacheDir, `three-${key}`);
    jobs.push({ i, file, start: T.start, frames, info, dir, ext: s.three.transparent ? 'png' : 'jpg' });
  }
  return jobs;
}

/** The frames of each job a set of video frames needs (all of them when `videoFrames` is null). */
export function framesNeeded(jobs, fps, videoFrames = null) {
  const need = new Map();
  for (const j of jobs) {
    let ks;
    if (!videoFrames) ks = Array.from({ length: j.frames }, (_, k) => k);
    else ks = [...new Set(videoFrames.map((f) => Math.floor((f / fps - j.start) * fps + 1e-6)).filter((k) => k >= 0 && k < j.frames))];
    need.set(j, ks);
  }
  return need;
}

function pageHtml(job) {
  const { width: W, height: H } = job.info;
  const bg = job.info.transparent ? 'transparent' : '#000';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:${bg};overflow:hidden}
#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${bg}}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
#ui{position:absolute;inset:0;pointer-events:none;color:#fff;font-family:'Segoe UI Variable Display','Segoe UI','Helvetica Neue',Arial,system-ui,sans-serif}
.lbl{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform,opacity;text-shadow:0 2px 10px rgba(0,0,0,.65),0 0 2px rgba(0,0,0,.8);font-variant-numeric:tabular-nums}
.chip{padding:6px 16px;border-radius:999px;background:rgba(6,14,28,.62);border:1.5px solid rgba(255,255,255,.18);text-shadow:none}
.line{position:absolute;left:0;top:0;height:2px;background:rgba(255,255,255,.75);transform-origin:0 50%}
</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/","selfclone/3d":"/sc3d/index.js"}}</script>
</head><body><div id="stage"><canvas id="gl" width="${W}" height="${H}"></canvas><div id="ui"></div></div>
<script>window.__sc3dInfo=${JSON.stringify(job.info)};</script>
<script type="module">
import { boot } from '/sc3d/stage.js';
try { const mod = await import('/user/${encodeURI(path.basename(job.file))}'); await boot(mod.default); }
catch (e) { window.__bootError = String((e && e.stack) || e); }
</script></body></html>`;
}

/** Serve a file from under `root` for a URL path, refusing anything outside it. */
function fileUnder(root, rel) {
  const f = path.resolve(root, '.' + path.sep + rel);
  if (!f.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return null;
  return f;
}

/** Chrome with the GPU on (ANGLE on D3D11 / Metal), or software GL when SELFCLONE_GL=swiftshader. */
async function launchGpuChrome() {
  const { findChrome } = await import('../face/chrome.mjs');
  const exe = process.env.SELFCLONE_CHROME || findChrome();
  if (!exe) throw new Error('No Chrome, Edge or Chromium found. Install one, or set SELFCLONE_CHROME to the browser executable.');
  const { chromium } = await import('playwright-core');
  const gl = process.env.SELFCLONE_GL || (process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : '');
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check'];
  if (gl === 'swiftshader') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  else if (gl) args.push(`--use-angle=${gl}`);
  return chromium.launch({ executablePath: exe, headless: true, args });
}

async function openJobPage(browser, job) {
  const html = pageHtml(job);
  const userDir = path.dirname(job.file);
  const context = await browser.newContext({ viewport: { width: job.info.width, height: job.info.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e.message)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'studio3d.local') return r.abort();
    const p = decodeURIComponent(u.pathname);
    if (p === '/') return r.fulfill({ body: html, contentType: MIME['.html'] });
    let f = null;
    if (p.startsWith('/three/')) f = fileUnder(threeDir(), p.slice(7));
    else if (p.startsWith('/sc3d/')) f = fileUnder(KIT_DIR, p.slice(6));
    else if (p.startsWith('/user/')) f = fileUnder(userDir, p.slice(6));
    if (!f) return r.fulfill({ status: 404, body: 'not found' });
    return r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  });
  await page.goto('http://studio3d.local/');
  await page.waitForFunction(() => window.__ready || window.__bootError, null, { timeout: 180000 });
  const bootErr = await page.evaluate(() => window.__bootError);
  if (bootErr) throw new Error(`3D module ${path.basename(job.file)} failed to load:\n${bootErr}`);
  return { page, context, errors };
}

/**
 * Render the frames each job needs that are not cached yet. `need` maps job -> frame numbers (from framesNeeded).
 * Pages per job: SELFCLONE_3D_WORKERS (default 3).
 */
export async function renderThreeFrames(need, { log = () => {} } = {}) {
  const todo = [];
  for (const [job, ks] of need) {
    fs.mkdirSync(job.dir, { recursive: true });
    const missing = ks.filter((k) => !fs.existsSync(path.join(job.dir, `${k}.${job.ext}`)));
    if (missing.length) todo.push([job, missing]);
  }
  if (!todo.length) return;
  const workers = Math.max(1, Number(process.env.SELFCLONE_3D_WORKERS) || 3);
  const browser = await launchGpuChrome();
  try {
    for (const [job, missing] of todo) {
      const t0 = Date.now();
      log(`Rendering 3D for scene ${job.i + 1} (${path.basename(job.file)}): ${missing.length} frames...`);
      const per = Math.ceil(missing.length / workers);
      await Promise.all(Array.from({ length: Math.min(workers, missing.length) }, async (_, w) => {
        const part = missing.slice(w * per, (w + 1) * per);
        if (!part.length) return;
        const { page, context, errors } = await openJobPage(browser, job);
        try {
          for (const k of part) {
            await page.evaluate((t) => window.__seek(t), k / job.info.fps);
            const file = path.join(job.dir, `${k}.${job.ext}`);
            const buf = job.ext === 'png' ? await page.screenshot({ type: 'png', omitBackground: true }) : await page.screenshot({ type: 'jpeg', quality: 93 });
            fs.writeFileSync(file + '.tmp', buf);
            fs.renameSync(file + '.tmp', file);
          }
          if (errors.length) throw new Error(`3D module ${path.basename(job.file)} reported errors: ${errors.slice(0, 3).join('; ')}`);
        } finally {
          await context.close();
        }
      }));
      log(`  scene ${job.i + 1}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  } finally {
    await browser.close();
  }
}

/** Which renderer a 3D page gets on this machine (for `selfclone doctor`-style checks and tests). */
export async function gpuInfo() {
  const job = { i: 0, file: path.join(KIT_DIR, 'probe.js'), info: { width: 64, height: 64, fps: 24, duration: 1, lines: [], transparent: false }, ext: 'jpg' };
  const browser = await launchGpuChrome();
  try {
    const { page, context } = await openJobPage(browser, job);
    const r = await page.evaluate(() => window.__info());
    await context.close();
    return r;
  } finally {
    await browser.close();
  }
}
