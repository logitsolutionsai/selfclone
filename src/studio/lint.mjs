// selfclone studio: storyboard warnings. Before a render (and with --preview) the built timeline is
// checked for the mistakes that make an explainer look broken: items on top of each other or of a
// character, things off the frame, scenes with nothing to look at, narration that runs too fast. Each
// warning names the scene and item, so Claude (or a person) can fix the scene file and preview again.
import { CHAR_BOX, FULL_BOX } from './character.mjs';

const viewBox = (svg) => {
  const m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg || '');
  return m ? Number(m[2]) / Number(m[1]) : 1;
};

/** Rough boxes in frame fractions: {x0, y0, x1, y1}. */
function itemBox(it, src, W, H, U) {
  let w;
  let h;
  if (it.kind === 'text' || it.kind === 'tag') {
    const chars = Math.max(...String(it.text).split('\n').map((l) => l.length));
    h = (it.size * U * 1.1 * String(it.text).split('\n').length) / H;
    w = (it.size * U * 0.5 * chars) / W;
  } else if (it.kind === 'bubble') {
    w = it.w;
    h = (U * 0.034 * 1.25 * Math.ceil((it.text.length * U * 0.034 * 0.5) / (it.w * W)) + U * 0.04) / H;
  } else {
    w = it.w;
    h = (it.w * W * (it.kind === 'chart' ? 0.66 : it.kind === 'image' ? 0.66 : viewBox(src.svg))) / H;
  }
  w *= it.scale;
  h *= it.scale;
  return { x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y - h / 2, y1: it.y + h / 2 };
}

const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const area = (a) => (a.x1 - a.x0) * (a.y1 - a.y0);

/** Warnings for a checked spec and its timeline, as plain sentences. */
export function lintStoryboard(spec, timeline, { width: W = 1280, height: H = 720 } = {}) {
  const U = Math.min(H, 1.2 * W);
  const out = [];
  timeline.forEach((s, i) => {
    const at = `scene ${i + 1}`;
    const src = spec.scenes[i];
    const dur = s.end - s.start;
    const words = s.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    if (words / dur > 3.4) out.push(`${at}: ${words} words in ${dur.toFixed(1)} s is fast; split it or add a "hold".`);
    if (!s.items.length && !s.characters.length && !src.manim && !src.three && src.backdrop === 'none') out.push(`${at} has nothing to look at: add a host, items, a backdrop, Manim or a 3D module.`);
    if (dur > 14 && s.items.length + (src.manim ? 1 : 0) + (src.three ? 2 : 0) < 2) out.push(`${at} runs ${dur.toFixed(0)} s with little on screen; add items or split the scene.`);
    const boxes = s.items.map((it, k) => ({ k, it, b: itemBox(it, src.items[k], W, H, U), t0: it.t, t1: it.exit ? it.exit.t : s.end }));
    for (const { k, it, b } of boxes) {
      if (it.move) continue;
      if (b.x0 < -0.02 || b.x1 > 1.02 || b.y0 < -0.02 || b.y1 > 1.02) out.push(`${at} item ${k + 1} (${it.kind}${it.prop ? ` ${it.prop}` : ''}) runs off the frame.`);
      if (it.kind !== 'bubble' && !it.over && b.y1 > 0.88 && b.x0 < 0.88 && b.x1 > 0.12 && spec.captions !== false) out.push(`${at} item ${k + 1} sits where the captions go (bottom of the frame).`);
    }
    for (let a = 0; a < boxes.length; a++) {
      for (let c = a + 1; c < boxes.length; c++) {
        const A = boxes[a];
        const B = boxes[c];
        if (A.t1 <= B.t0 || B.t1 <= A.t0 || A.it.move || B.it.move || A.it.over || B.it.over) continue;
        // Two items on the same centre are layered on purpose (a glow behind a drawing).
        if (Math.abs(A.it.x - B.it.x) < 0.03 && Math.abs(A.it.y - B.it.y) < 0.03) continue;
        const o = overlap(A.b, B.b);
        if (o > 0.35 * Math.min(area(A.b), area(B.b))) out.push(`${at}: items ${A.k + 1} and ${B.k + 1} overlap.`);
      }
    }
    for (const c of s.characters) {
      const box = c.body === 'full' ? FULL_BOX : CHAR_BOX;
      const h = (c.scale * U) / H;
      const w = (h * H * box.width) / box.height / W;
      // The figure itself (head and body), narrower than its box.
      const cb = { x0: c.x - w * 0.32, x1: c.x + w * 0.32, y0: c.y - h * 0.92, y1: c.y };
      for (const { k, it, b } of boxes) {
        if (it.kind === 'bubble' || it.move || it.over) continue;
        if (overlap(cb, b) > 0.3 * area(b)) out.push(`${at} item ${k + 1} covers ${c.who}; move it or the character.`);
      }
    }
  });
  return out;
}
