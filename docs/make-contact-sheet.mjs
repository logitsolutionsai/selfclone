// Contact sheet of the mouth and eye shapes, photo path against clip path, from the test painting:
//   tests/output/contact-sheet.png       rest, AA, E, O, U, MBP, FV and blink for both avatars (2x)
//   docs/media/photo-vs-clip.png         the README comparison (AA, O and blink)
// The clip avatar is baked from tests/fixtures/mona-lisa-clip.webm (synthetic; see SOURCE.md).
// Run: node docs/make-contact-sheet.mjs   (needs Chrome or Edge)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../src/face/chrome.mjs';
import { bakeFromPhoto } from '../src/face/bake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'tests', 'output', 'sheet');
const MEDIA = path.join(ROOT, 'docs', 'media');
fs.mkdirSync(WORK, { recursive: true });
const FIX = path.join(ROOT, 'tests', 'fixtures');
const consent = 'Demo only: a public domain painting (Mona Lisa, Leonardo da Vinci), not a living person.';
const name = 'Mona Lisa (public domain painting)';
const photoFile = path.join(WORK, 'photo-avatar.html');
const clipFile = path.join(WORK, 'clip-avatar.html');
if (!process.argv.includes('--reuse') || !fs.existsSync(photoFile)) await bakeFromPhoto({ photo: path.join(FIX, 'mona-lisa.jpg'), consent, name, out: photoFile });
if (!process.argv.includes('--reuse') || !fs.existsSync(clipFile)) await bakeFromPhoto({ video: path.join(FIX, 'mona-lisa-clip.webm'), consent, name, out: clipFile });

const POSES = [
  ['rest', {}],
  ['AA', { viseme: 'AA' }],
  ['E', { viseme: 'E' }],
  ['O', { viseme: 'O' }],
  ['U', { viseme: 'U' }],
  ['MBP', { viseme: 'MBP' }],
  ['FV', { viseme: 'FV' }],
  ['blink', { blink: true }],
];

const browser = await launchChrome({ args: ['--mute-audio'] });
const shots = {};
try {
  for (const [label, file] of [['photo', photoFile], ['clip', clipFile]]) {
    const html = fs.readFileSync(file, 'utf8');
    const page = await browser.newPage({ viewport: { width: 560, height: 600 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => (r.request().url().startsWith('http://avatar.local/') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.abort()));
    await page.goto('http://avatar.local/avatar.html?controls=0&idle=0&blink=0&tts=0&volume=0');
    await page.waitForFunction(() => window.selfclone && window.selfclone.state().frames > 3);
    const reg = await page.evaluate(() => window.selfclone.regions());
    const e0 = reg.eyes[0];
    const e1 = reg.eyes[1];
    const x = e0.x - 0.35 * e0.width;
    const box = { x, y: e0.y - 0.8 * e0.height, width: e1.x + 1.35 * e1.width - x, height: reg.mouth.y + reg.mouth.height + 6 - (e0.y - 0.8 * e0.height) };
    shots[label] = {};
    for (const [pose, o] of POSES) {
      await page.evaluate((p) => window.selfclone.pose(p), o);
      await page.waitForTimeout(450);
      const st = await page.evaluate(() => window.selfclone.state());
      const buf = await page.screenshot({ clip: box, path: path.join(WORK, `${label}-${pose}.png`) });
      shots[label][pose] = { img: buf.toString('base64'), path: pose === 'blink' ? st.eyePath || 'none' : st.mouthPath + (st.patchShape ? ` ${st.patchShape}` : '') };
      console.log(`${label} ${pose}: mouth ${st.mouthPath}${st.patchShape ? ' (' + st.patchShape + ')' : ''}, eyes ${st.eyePath || '-'}`);
    }
    if (errors.length) console.log(`${label} errors: ${errors.join('; ')}`);
    await page.close();
  }

  const sheet = (poses, title, cols) => `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:#14161a;color:#eef1f5;font:14px/1.3 system-ui,Segoe UI,sans-serif}
    h1{font-size:16px;margin:0 0 10px} table{border-collapse:collapse} td,th{padding:4px;text-align:center;vertical-align:top}
    th{font-weight:600;color:#a3aab5} img{display:block;width:${cols ? 260 : 210}px;border-radius:6px} small{color:#a3aab5}
  </style><h1>${title}</h1><table><tr><th></th>${poses.map((p) => `<th>${p}</th>`).join('')}</tr>
  ${['photo', 'clip'].map((k) => `<tr><th>${k === 'photo' ? 'Photo<br><small>drawn mouth</small>' : 'Clip<br><small>real frames</small>'}</th>${poses.map((p) => `<td><img src="data:image/png;base64,${shots[k][p].img}"><small>${shots[k][p].path}</small></td>`).join('')}</tr>`).join('')}
  </table>`;
  const p2 = await browser.newPage({ viewport: { width: 1900, height: 400 }, deviceScaleFactor: 1 });
  await p2.setContent(sheet(POSES.map((p) => p[0]), 'selfclone contact sheet: photo bake against clip bake (test painting; the clip is synthetic, see tests/fixtures/SOURCE.md)'));
  await p2.screenshot({ path: path.join(ROOT, 'tests', 'output', 'contact-sheet.png'), fullPage: true });
  await p2.setViewportSize({ width: 900, height: 300 });
  await p2.setContent(sheet(['AA', 'O', 'blink'], 'Photo bake (drawn mouth) and clip bake (patches from the clip)', true).replace(/<small>[^<]*<\/small><\/td>/g, '</td>'));
  await p2.screenshot({ path: path.join(MEDIA, 'photo-vs-clip.png'), fullPage: true });
  await p2.close();
} finally {
  await browser.close();
}
console.log('wrote tests/output/contact-sheet.png and docs/media/photo-vs-clip.png');
