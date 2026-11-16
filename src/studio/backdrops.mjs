// selfclone studio: scenery drawn in code. A backdrop sits behind the items and moves slower than the
// camera (parallax), with its own slow life: clouds drift, stars twinkle, bokeh floats, waves roll.
// Particles drift in front of everything. Colours come from the scene's background so every backdrop
// matches its scene. Seeded, so the same scene file always draws the same scenery.
import { rng } from '../util.mjs';
import { mix } from './character.mjs';

export const BACKDROPS = ['none', 'clouds', 'stars', 'dots', 'grass', 'city', 'room', 'grid', 'waves', 'chalkboard', 'notebook'];
export const PARTICLES = ['none', 'dust', 'sparkles', 'bubbles', 'snow'];
// The backdrop is drawn larger than the frame so a parallax shift never shows its edge.
export const BACKDROP_OVERSCAN = 1.3;

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * The backdrop as an SVG string of BACKDROP_OVERSCAN times the frame. Animated parts carry a class
 * (a-drift, a-twinkle, a-float, a-roll) and data-* numbers the page reads.
 */
export function backdropSvg(name, bg, { width: W, height: H, seed = 'bd' }) {
  if (!name || name === 'none') return '';
  const rand = rng(`${seed}:${name}`);
  const BW = W * BACKDROP_OVERSCAN;
  const BH = H * BACKDROP_OVERSCAN;
  const light = mix(bg, '#ffffff', 0.4);
  const lighter = mix(bg, '#ffffff', 0.65);
  const dark = mix(bg, '#1d1840', 0.35);
  const darker = mix(bg, '#1d1840', 0.55);
  const ink = '#2a2346';
  let body = '';
  switch (name) {
    case 'clouds':
      for (let i = 0; i < 7; i++) {
        const x = rand() * BW;
        const y = BH * (0.08 + rand() * 0.45);
        const s = 0.6 + rand() * 0.9;
        const puffs = [[0, 0, 60], [-55, 12, 42], [55, 14, 46], [-20, -24, 40], [28, -20, 38]]
          .map(([dx, dy, r]) => `<circle cx="${r1(dx * s)}" cy="${r1(dy * s)}" r="${r1(r * s)}"/>`).join('');
        body += `<g class="a-drift" data-speed="${r1(6 + rand() * 14)}" data-w="${BW}" transform="translate(${r1(x)},${r1(y)})"><g fill="${lighter}" opacity="0.75">${puffs}</g></g>`;
      }
      break;
    case 'stars':
      for (let i = 0; i < 70; i++) {
        const x = rand() * BW;
        const y = rand() * BH * 0.85;
        const r = 1 + rand() * 2.6;
        const shape = rand() < 0.25
          ? `<path d="M0,${-r * 2.2} L${r * 0.5},${-r * 0.5} L${r * 2.2},0 L${r * 0.5},${r * 0.5} L0,${r * 2.2} L${-r * 0.5},${r * 0.5} L${-r * 2.2},0 L${-r * 0.5},${-r * 0.5} Z" fill="${lighter}"/>`
          : `<circle r="${r1(r)}" fill="${lighter}"/>`;
        body += `<g class="a-twinkle" data-phase="${r1(rand() * 6.28)}" data-rate="${r1(1 + rand() * 3)}" transform="translate(${r1(x)},${r1(y)})">${shape}</g>`;
      }
      break;
    case 'dots':
      for (let i = 0; i < 26; i++) {
        const x = rand() * BW;
        const y = rand() * BH;
        const r = 18 + rand() * 70;
        body += `<g class="a-float" data-phase="${r1(rand() * 6.28)}" data-amp="${r1(6 + rand() * 14)}" transform="translate(${r1(x)},${r1(y)})"><circle r="${r1(r)}" fill="${rand() < 0.5 ? light : lighter}" opacity="${r1(0.12 + rand() * 0.22)}"/></g>`;
      }
      break;
    case 'grass': {
      const hill = (y0, amp, col, k) => {
        let d = `M0,${BH}`;
        for (let x = 0; x <= BW; x += BW / 8) d += ` L${r1(x)},${r1(y0 + Math.sin(x / BW * Math.PI * (2 + k) + k) * amp)}`;
        return `<path d="${d} L${BW},${BH} Z" fill="${col}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
      };
      body += hill(BH * 0.62, BH * 0.04, mix('#9cc56b', bg, 0.35), 1) + hill(BH * 0.72, BH * 0.035, mix('#7fb35a', bg, 0.2), 2) + hill(BH * 0.82, BH * 0.03, '#6aa34c', 3);
      for (let i = 0; i < 18; i++) {
        const x = rand() * BW;
        const y = BH * (0.78 + rand() * 0.18);
        const c = ['#f2c14b', '#e2604f', '#f6f1e6', '#b58ad6'][Math.floor(rand() * 4)];
        body += `<g class="a-float" data-phase="${r1(rand() * 6.28)}" data-amp="2" transform="translate(${r1(x)},${r1(y)})"><path d="M0,0 L0,14" stroke="${ink}" stroke-width="2"/><circle r="5" fill="${c}" stroke="${ink}" stroke-width="1.5"/></g>`;
      }
      break;
    }
    case 'city': {
      let x = 0;
      while (x < BW) {
        const w = 50 + rand() * 90;
        const h = BH * (0.18 + rand() * 0.3);
        const y = BH - h;
        body += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h + 2)}" fill="${rand() < 0.5 ? dark : darker}" stroke="${ink}" stroke-width="2.5"/>`;
        for (let wy = y + 14; wy < BH - 20; wy += 26) {
          for (let wx = x + 10; wx < x + w - 16; wx += 22) {
            if (rand() < 0.45) body += `<rect class="a-twinkle" data-phase="${r1(rand() * 6.28)}" data-rate="${r1(0.2 + rand() * 0.6)}" x="${r1(wx)}" y="${r1(wy)}" width="9" height="12" fill="#f6e27a" opacity="0.8"/>`;
          }
        }
        x += w + 4 + rand() * 20;
      }
      break;
    }
    case 'room': {
      const floorY = BH * 0.78;
      body += `<rect x="0" y="${r1(floorY)}" width="${BW}" height="${r1(BH - floorY)}" fill="${dark}"/>` +
        `<path d="M0,${r1(floorY)} L${BW},${r1(floorY)}" stroke="${ink}" stroke-width="3"/>`;
      for (let x = 40; x < BW; x += 110) body += `<path d="M${x},${r1(floorY + 8)} L${x - 30},${BH}" stroke="${darker}" stroke-width="2" opacity="0.6"/>`;
      const wx = BW * 0.66;
      const wy = BH * 0.16;
      body += `<rect x="${r1(wx)}" y="${r1(wy)}" width="${r1(BW * 0.17)}" height="${r1(BH * 0.3)}" fill="${lighter}" stroke="${ink}" stroke-width="4"/>` +
        `<path d="M${r1(wx + BW * 0.085)},${r1(wy)} L${r1(wx + BW * 0.085)},${r1(wy + BH * 0.3)} M${r1(wx)},${r1(wy + BH * 0.15)} L${r1(wx + BW * 0.17)},${r1(wy + BH * 0.15)}" stroke="${ink}" stroke-width="3"/>`;
      const sx = BW * 0.12;
      const sy = BH * 0.36;
      body += `<rect x="${r1(sx)}" y="${r1(sy)}" width="${r1(BW * 0.22)}" height="10" fill="${darker}" stroke="${ink}" stroke-width="2.5"/>`;
      let bx = sx + 10;
      while (bx < sx + BW * 0.2) {
        const bw = 12 + rand() * 12;
        const bh = 40 + rand() * 30;
        body += `<rect x="${r1(bx)}" y="${r1(sy - bh)}" width="${r1(bw)}" height="${r1(bh)}" fill="${['#e2604f', '#5b8fd6', '#f2c14b', '#8fc6a0', '#f6f1e6'][Math.floor(rand() * 5)]}" stroke="${ink}" stroke-width="2"/>`;
        bx += bw + 2;
      }
      break;
    }
    case 'grid':
      for (let x = 0; x <= BW; x += 48) body += `<path d="M${x},0 L${x},${BH}" stroke="${lighter}" stroke-width="${x % 240 ? 1 : 2}" opacity="0.5"/>`;
      for (let y = 0; y <= BH; y += 48) body += `<path d="M0,${y} L${BW},${y}" stroke="${lighter}" stroke-width="${y % 240 ? 1 : 2}" opacity="0.5"/>`;
      break;
    case 'chalkboard': {
      // A green board in a wooden frame, with chalk dust and a tray.
      const x0 = BW * 0.06;
      const y0 = BH * 0.07;
      body += `<rect x="${r1(x0 - 22)}" y="${r1(y0 - 22)}" width="${r1(BW - 2 * x0 + 44)}" height="${r1(BH - 2 * y0 + 44)}" rx="8" fill="#8a5a32" stroke="${ink}" stroke-width="4"/>` +
        `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(BW - 2 * x0)}" height="${r1(BH - 2 * y0)}" fill="#2f5a46" stroke="${ink}" stroke-width="3"/>`;
      for (let i = 0; i < 9; i++) body += `<ellipse cx="${r1(x0 + rand() * (BW - 2 * x0))}" cy="${r1(y0 + rand() * (BH - 2 * y0))}" rx="${r1(60 + rand() * 140)}" ry="${r1(14 + rand() * 30)}" fill="#ffffff" opacity="${r1(0.03 + rand() * 0.05)}"/>`;
      body += `<rect x="${r1(BW * 0.3)}" y="${r1(BH - y0 + 8)}" width="${r1(BW * 0.4)}" height="12" fill="#6b4426" stroke="${ink}" stroke-width="2"/><rect x="${r1(BW * 0.42)}" y="${r1(BH - y0)}" width="34" height="9" rx="3" fill="#f6f1e6"/>`;
      break;
    }
    case 'notebook': {
      body += `<rect x="0" y="0" width="${r1(BW)}" height="${r1(BH)}" fill="#fbf7ec"/>`;
      for (let y = BH * 0.12; y < BH; y += 44) body += `<path d="M0,${r1(y)} L${r1(BW)},${r1(y)}" stroke="#9cc0e6" stroke-width="2"/>`;
      body += `<path d="M${r1(BW * 0.12)},0 L${r1(BW * 0.12)},${r1(BH)}" stroke="#e2878a" stroke-width="3"/>`;
      for (let y = BH * 0.2; y < BH; y += BH * 0.28) body += `<circle cx="${r1(BW * 0.05)}" cy="${r1(y)}" r="14" fill="${mix(bg, '#1d1840', 0.3)}" opacity="0.6"/>`;
      break;
    }
    case 'waves':
      for (let k = 0; k < 4; k++) {
        const y0 = BH * (0.66 + k * 0.08);
        let d = `M${-BW * 0.25},${BH}`;
        for (let x = -BW * 0.25; x <= BW * 1.25; x += 40) d += ` L${r1(x)},${r1(y0 + Math.sin(x / 90 + k) * 12)}`;
        body += `<g class="a-roll" data-speed="${r1(10 + k * 8)}" data-span="${r1(90 * 2 * Math.PI)}"><path d="${d} L${BW * 1.25},${BH} Z" fill="${mix(bg, k % 2 ? '#1d1840' : '#ffffff', 0.15 + k * 0.1)}" stroke="${ink}" stroke-width="2.5" opacity="0.9"/></g>`;
      }
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(BW)} ${r1(BH)}" width="${r1(BW)}" height="${r1(BH)}">${body}</svg>`;
}

/** Particles in front of the scene, as an SVG string the size of the frame. Each drifts on its own. */
export function particlesSvg(name, { width: W, height: H, seed = 'pt' }) {
  if (!name || name === 'none') return '';
  const rand = rng(`${seed}:${name}`);
  const count = { dust: 40, sparkles: 22, bubbles: 18, snow: 60 }[name];
  let body = '';
  for (let i = 0; i < count; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const vx = name === 'snow' ? (rand() - 0.5) * 20 : (rand() - 0.5) * 12;
    const vy = { dust: -(4 + rand() * 10), sparkles: -(2 + rand() * 6), bubbles: -(25 + rand() * 40), snow: 20 + rand() * 30 }[name];
    let shape;
    if (name === 'dust') shape = `<circle r="${r1(1 + rand() * 2.2)}" fill="#fff8e6" opacity="${r1(0.35 + rand() * 0.4)}"/>`;
    else if (name === 'snow') shape = `<circle r="${r1(2 + rand() * 3)}" fill="#ffffff" opacity="0.85"/>`;
    else if (name === 'bubbles') shape = `<circle r="${r1(6 + rand() * 12)}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>`;
    else {
      const r = 4 + rand() * 6;
      shape = `<path d="M0,${-r * 2} Q0,0 ${r * 2},0 Q0,0 0,${r * 2} Q0,0 ${-r * 2},0 Q0,0 0,${-r * 2} Z" fill="#fff6c8"/>`;
    }
    body += `<g class="p" data-x="${r1(x)}" data-y="${r1(y)}" data-vx="${r1(vx)}" data-vy="${r1(vy)}" data-phase="${r1(rand() * 6.28)}" data-tw="${name === 'sparkles' ? 1 : 0}">${shape}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;
}
