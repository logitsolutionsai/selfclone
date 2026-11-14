// Records tests/fixtures/mona-lisa-clip-frames.json from mona-lisa-clip.webm: per frame, the
// blendshapes, head pose, mouth sharpness and the landmarks that keyframe selection reads (eyes,
// lips, stable points). The unit tests run keyframe selection on this recording without a browser.
// Run: node tests/fixtures/record-clip-frames.mjs   (needs Chrome or Edge; reads only the cached MediaPipe files)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, send } from '../../src/face/http.mjs';
import { launchChrome } from '../../src/face/chrome.mjs';
import { STABLE_POINTS, CLIP_FPS } from '../../face/lib/clip.js';
import { RIGHT_EYE_UPPER, RIGHT_EYE_LOWER, LEFT_EYE_UPPER, LEFT_EYE_LOWER } from '../../face/lib/geometry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP = [...new Set([...STABLE_POINTS, ...RIGHT_EYE_UPPER, ...RIGHT_EYE_LOWER, ...LEFT_EYE_UPPER, ...LEFT_EYE_LOWER, 61, 291, 13, 14, 0, 17, 159, 145, 386, 374])].sort((a, b) => a - b);
const BS = ['jawOpen', 'mouthFunnel', 'mouthPucker', 'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthPressLeft', 'mouthPressRight', 'mouthClose', 'mouthRollLower', 'mouthRollUpper', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'eyeBlinkLeft', 'eyeBlinkRight'];
const bytes = fs.readFileSync(path.join(HERE, 'mona-lisa-clip.webm'));
const srv = await startServer(async (req, res, url) => {
  if (url.pathname === '/input') return send(res, 200, bytes, 'video/webm'), true;
  return false;
});
const browser = await launchChrome();
try {
  const page = await browser.newPage();
  await page.goto(`${srv.url}/face/bake.html`);
  await page.waitForFunction(() => window.selfcloneReady === true);
  const frames = await page.evaluate(async ({ KEEP, BS, fps }) => {
    const d = await import('/face/lib/detect.js');
    const blob = await (await fetch('/input')).blob();
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(blob);
    await new Promise((r) => (video.onloadeddata = r));
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const lmk = await d.loadLandmarker('/mp', 'VIDEO');
    const out = [];
    const n = Math.floor(video.duration * fps);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / fps;
      await new Promise((r) => {
        video.onseeked = r;
        video.currentTime = Math.min(video.duration - 0.001, t);
      });
      ctx.drawImage(video, 0, 0, w, h);
      const res = lmk.detectForVideo(canvas, Math.round((i * 1000) / fps) + 1);
      const c = d.checkFrame(res, ctx, w, h);
      if (!c.oneFace) {
        out.push({ t, ok: false });
        continue;
      }
      const lm = res.faceLandmarks[0].map((p) => [p.x * w, p.y * h]);
      const bs = d.blendMap(res);
      const r2 = (x) => Math.round(x * 100) / 100;
      out.push({
        t: Math.round(t * 1000) / 1000,
        ok: true,
        pose: { yaw: r2(c.pose.yaw), pitch: r2(c.pose.pitch) },
        sharp: Math.round(d.mouthSharpness(ctx, lm, w, h)),
        bs: Object.fromEntries(BS.map((k) => [k, r2(bs[k] || 0)])),
        lm: KEEP.flatMap((k) => [Math.round(lm[k][0] * 10) / 10, Math.round(lm[k][1] * 10) / 10]),
      });
    }
    lmk.close();
    return out;
  }, { KEEP, BS, fps: CLIP_FPS });
  const file = path.join(HERE, 'mona-lisa-clip-frames.json');
  fs.writeFileSync(file, JSON.stringify({ note: 'Recorded from mona-lisa-clip.webm (synthetic, see SOURCE.md) by record-clip-frames.mjs. lm holds x, y pairs for the landmark indices in keep, the only ones keyframe selection reads.', fps: CLIP_FPS, keep: KEEP, frames }));
  console.log(`${frames.length} frames, ${Math.round(fs.statSync(file).size / 1024)} KB`);
} finally {
  await browser.close();
  await srv.close();
}
