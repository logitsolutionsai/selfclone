// Contact sheet of the mouth and eye shapes, photo path against clip path, from the test painting:
//   tests/output/contact-sheet.png        rest, AA, E, O, U, MBP, FV, mid-blink and blink for both avatars,
//                                         WebGL and Canvas2D (captured at 2x device pixels, shown at 2x)
//   tests/output/contact-sheet-mouth.png  the same frames cropped to the mouth and zoomed, for close checks
//   docs/media/photo-vs-clip.png          the README comparison (O, U and blink, the shapes the synthetic clip has)
// The clip avatar is baked from tests/fixtures/mona-lisa-clip.webm (synthetic; see SOURCE.md).
// Run: node tools/make-contact-sheet.mjs [--reuse] [--name before] [--no-media]
//   --reuse     rebuild the avatars from the cached detection results (no new bake, current runtime)
//   --name X    write tests/output/contact-sheet-X.png and contact-sheet-X-mouth.png instead
//   --no-media  do not touch docs/media/photo-vs-clip.png
// Needs Chrome or Edge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../src/face/chrome.mjs';
import { bakeFromPhoto } from '../src/face/bake.mjs';
import { buildAvatarHtml } from '../src/face/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'tests', 'output', 'sheet');
const OUTDIR = path.join(ROOT, 'tests', 'output');
const MEDIA = path.join(ROOT, 'docs', 'media');
fs.mkdirSync(WORK, { recursive: true });
const FIX = path.join(ROOT, 'tests', 'fixtures');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : null;
};
const REUSE = process.argv.includes('--reuse');
const NAME = arg('--name');
const MEDIA_OUT = !process.argv.includes('--no-media') && !NAME;
const consent = 'Demo only: a public domain painting (Mona Lisa, Leonardo da Vinci), not a living person.';
const name = 'Mona Lisa (public domain painting)';

/** Detection results are cached, so a runtime or geometry change only needs a rebuild, not a new bake. */
async function avatarHtml(kind) {
  const cache = path.join(WORK, `${kind}-bake.json`);
  let bake;
  if (REUSE && fs.existsSync(cache)) bake = JSON.parse(fs.readFileSync(cache, 'utf8'));
  else {
    const src = kind === 'photo' ? { photo: path.join(FIX, 'mona-lisa.jpg') } : { video: path.join(FIX, 'mona-lisa-clip.webm') };
    const r = await bakeFromPhoto({ ...src, consent, name, out: path.join(WORK, `${kind}-avatar.html`) });
    bake = r.bake;
    fs.writeFileSync(cache, JSON.stringify(bake));
  }
  const { html } = buildAvatarHtml({
    bake,
    consent: { name, statement: consent, date: new Date().toISOString(), method: kind === 'photo' ? 'photo' : 'video' },
    glasses: !!bake.checks?.glassesLikely,
  });
  fs.writeFileSync(path.join(WORK, `${kind}-avatar.html`), html);
  return html;
}

const POSES = [
  ['rest', {}],
  ['AA', { viseme: 'AA' }],
  ['E', { viseme: 'E' }],
  ['O', { viseme: 'O' }],
  ['U', { viseme: 'U' }],
  ['MBP', { viseme: 'MBP' }],
  ['FV', { viseme: 'FV' }],
  ['mid-blink', { blink: 0.5 }],
  ['blink', { blink: true }],
];
const ROWS = [
  ['photo', 'auto', 'Photo, WebGL', 'drawn mouth'],
  ['photo', '2d', 'Photo, Canvas2D', 'drawn mouth'],
  ['clip', 'auto', 'Clip, WebGL', 'patches'],
  ['clip', '2d', 'Clip, Canvas2D', 'patches'],
];

const htmls = { photo: await avatarHtml('photo'), clip: await avatarHtml('clip') };
const browser = await launchChrome({ args: ['--mute-audio'] });
const shots = {};
try {
  for (const [kind, renderer] of ROWS) {
    const html = htmls[kind];
    const key = `${kind}-${renderer}`;
    const page = await browser.newPage({ viewport: { width: 560, height: 600 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.abort()));
    await page.goto(`http://avatar.local/avatar.html?controls=0&idle=0&blink=0&tts=0&volume=0&renderer=${renderer}`);
    await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3);
    const reg = await page.evaluate(() => window.selfclone.regions());
    const e0 = reg.eyes[0];
    const e1 = reg.eyes[1];
    const x = e0.x - 0.35 * e0.width;
    const box = { x, y: e0.y - 0.8 * e0.height, width: e1.x + 1.35 * e1.width - x, height: reg.mouth.y + reg.mouth.height + 6 - (e0.y - 0.8 * e0.height) };
    const m = reg.mouth;
    const mbox = { x: m.x, y: m.y - 0.1 * m.height, width: m.width, height: m.height * 1.05 };
    shots[key] = {};
    for (const [pose, o] of POSES) {
      await page.evaluate((p) => window.selfclone.pose(p), o);
      await page.waitForTimeout(450);
      const st = await page.evaluate(() => window.selfclone.state());
      const buf = await page.screenshot({ clip: box, path: path.join(WORK, `${key}-${pose}.png`) });
      const mouth = await page.screenshot({ clip: /blink/.test(pose) ? { x: e0.x - 6, y: e0.y - 10, width: e1.x + e1.width - e0.x + 12, height: Math.max(e0.height, e1.height) + 20 } : mbox });
      const label = /blink/.test(pose) ? `eyes ${st.eyePath || 'none'}` : st.mouthPath + (st.patchShape ? ` ${st.patchShape}` : '');
      shots[key][pose] = { img: buf.toString('base64'), mouth: mouth.toString('base64'), label };
      console.log(`${key} ${pose}: mouth ${st.mouthPath}${st.patchShape ? ' (' + st.patchShape + ')' : ''}, eyes ${st.eyePath || '-'}, renderer ${st.renderer}`);
    }
    if (errors.length) console.log(`${key} errors: ${errors.join('; ')}`);
    await page.close();
  }

  const css = (w) => `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:#14161a;color:#eef1f5;font:14px/1.3 system-ui,Segoe UI,sans-serif}
    h1{font-size:16px;margin:0 0 10px} table{border-collapse:collapse} td,th{padding:4px;text-align:center;vertical-align:top}
    th{font-weight:600;color:#a3aab5} img{display:block;width:${w}px;border-radius:6px} small{color:#a3aab5}
  </style>`;
  const sheet = (poses, title, w, rows, field = 'img', labels = true) => `${css(w)}<h1>${title}</h1><table><tr><th></th>${poses.map((p) => `<th>${p}</th>`).join('')}</tr>
  ${rows.map(([kind, r, head, sub]) => `<tr><th>${head}<br><small>${sub}</small></th>${poses.map((p) => `<td><img src="data:image/png;base64,${shots[`${kind}-${r}`][p][field]}">${labels ? `<small>${shots[`${kind}-${r}`][p].label}</small>` : ''}</td>`).join('')}</tr>`).join('')}
  </table>`;
  const p2 = await browser.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
  const base = NAME ? `contact-sheet-${NAME}` : 'contact-sheet';
  const title = 'selfclone contact sheet: photo bake (drawn mouth) and clip bake (test painting; the clip is synthetic, see tests/fixtures/SOURCE.md)';
  // Tiles are captured at 2x device pixels and shown at that size (2x the old sheet).
  await p2.setContent(sheet(POSES.map((p) => p[0]), title, 420, ROWS));
  await p2.screenshot({ path: path.join(OUTDIR, `${base}.png`), fullPage: true });
  await p2.setContent(sheet(POSES.map((p) => p[0]), `${title}: mouth and eyes, zoomed`, 300, ROWS, 'mouth'));
  await p2.screenshot({ path: path.join(OUTDIR, `${base}-mouth.png`), fullPage: true });
  if (MEDIA_OUT) {
    await p2.setViewportSize({ width: 900, height: 300 });
    await p2.setContent(sheet(['O', 'U', 'blink'], 'Photo bake (drawn mouth) and clip bake (patches from the clip)', 260, [ROWS[0], ROWS[2]].map(([k, r, h, s]) => [k, r, h.replace(/, WebGL/, ''), s === 'patches' ? 'real frames' : s]), 'img', false));
    await p2.screenshot({ path: path.join(MEDIA, 'photo-vs-clip.png'), fullPage: true });
  }
  await p2.close();
} finally {
  await browser.close();
}
console.log(`wrote tests/output/${NAME ? `contact-sheet-${NAME}` : 'contact-sheet'}.png and -mouth.png${MEDIA_OUT ? ' and docs/media/photo-vs-clip.png' : ''}`);
