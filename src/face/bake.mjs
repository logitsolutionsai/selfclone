// Bake avatar.html from a still photo or a short video clip, using the installed Chrome in headless
// mode to run MediaPipe Face Landmarker. Consent is required.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, send, typeFor } from './http.mjs';
import { launchChrome } from './chrome.mjs';
import { buildAvatarHtml } from './build.mjs';

const VIDEO_TYPES = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg' };

/** Serve one local file to the headless bake page and run `fn` (a window function name) on it. */
async function runBakePage(file, type, fn, { timeoutMs = 120000, what = 'face' } = {}) {
  const bytes = fs.readFileSync(file);
  const srv = await startServer(async (req, res, url) => {
    if (url.pathname === '/input') {
      send(res, 200, bytes, type);
      return true;
    }
    return false;
  });
  let browser;
  let timer;
  try {
    browser = await launchChrome();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${srv.url}/face/bake.html`);
    await page.waitForFunction(() => window.selfcloneReady === true, null, { timeout: 30000 });
    const rec = await Promise.race([
      page.evaluate(async (name) => {
        try {
          return { ok: true, bake: await window[name]('/input') };
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
      }, fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out while reading the ${what}`)), timeoutMs);
      }),
    ]);
    if (!rec.ok) throw new Error(rec.error + (errors.length ? ` (${errors.join('; ')})` : ''));
    return rec.bake;
  } finally {
    clearTimeout(timer); // otherwise the CLI waits out the full timeout before it exits
    if (browser) await browser.close();
    await srv.close();
  }
}

/** Run the in-browser bake for an image file. Returns the bake record. */
export async function detectPhoto(photo, opts = {}) {
  if (!fs.existsSync(photo)) throw new Error(`Photo not found: ${photo}`);
  return runBakePage(photo, typeFor(photo), 'selfcloneBake', { ...opts, what: 'face' });
}

/**
 * Run the in-browser clip bake for a video file: every frame is measured in memory, the best rest
 * frame becomes the photo and a few keyframes become small mouth and eye patches. The video itself
 * is not copied anywhere.
 */
export async function detectVideo(video, opts = {}) {
  if (!fs.existsSync(video)) throw new Error(`Video not found: ${video}`);
  const type = VIDEO_TYPES[path.extname(video).toLowerCase()] || 'application/octet-stream';
  return runBakePage(video, type, 'selfcloneBakeVideo', { timeoutMs: 300000, ...opts, what: 'clip' });
}

export function photoWarnings(checks) {
  const w = [];
  if (!checks) return w;
  if (checks.pose && !checks.frontal) w.push(`Head is turned (yaw ${checks.pose.yaw.toFixed(1)} deg, pitch ${checks.pose.pitch.toFixed(1)} deg); a straight-on photo animates better.`);
  if (checks.mouthClosed === false) w.push('Mouth looks open; a closed, relaxed mouth gives a cleaner mouth animation.');
  if (checks.eyesOpen === false) w.push('Eyes look closed; blinking needs open eyes.');
  if (checks.resolutionOk === false) w.push(`Face is small in the photo (${Math.round(checks.faceWidthPx)} px wide); use a closer or larger photo.`);
  if (checks.glassesLikely) w.push('Glasses detected; blinking is turned off so the frames do not warp. Use --glasses no to override.');
  return w;
}

export function clipSummary(clip) {
  if (!clip) return null;
  const shapes = Object.keys(clip.keys || {});
  return { frames: clip.frames, usable: clip.usable, shapes, blink: !!clip.blink };
}

export async function bakeFromPhoto({ photo, video, consent, name, glasses = 'auto', out, strict = false }) {
  if (!consent || String(consent).trim().length < 8) throw new Error('Refusing to bake without a consent statement.');
  const bake = video ? await detectVideo(video) : await detectPhoto(photo);
  const warnings = photoWarnings(bake.checks);
  if (strict && warnings.length) throw new Error(`Photo checks failed (--strict):\n- ${warnings.join('\n- ')}`);
  const useGlasses = glasses === 'yes' ? true : glasses === 'no' ? false : !!bake.checks?.glassesLikely;
  const { html, triangles, landmarks, clip } = buildAvatarHtml({
    bake,
    consent: { name: name || '', statement: String(consent), date: new Date().toISOString(), method: video ? 'video' : 'photo' },
    glasses: useGlasses,
  });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html);
  return { bytes: Buffer.byteLength(html), triangles, landmarks, warnings, checks: bake.checks, bake, clip };
}
