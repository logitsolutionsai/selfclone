// selfclone studio: crowds and networks.
//
// A crowd is a group of small townspeople who wander around their spots. It can pass something on: news
// spreads from one person to the next, each getting a badge over the head as they hear it, with a quick
// whisper arc from whoever told them. Some of them can walk off to one place (a party, a meeting), and one
// can be ringed to single them out.
//
// A network is a ring of small faces with ties between them; new ties appear over time, from one density
// to another (density = ties / possible ties), so a real figure such as 0.167 -> 0.74 can be drawn exactly.
//
// Both are SVG with data attributes; the page moves them as a function of time, like everything else.
// All of it is seeded, so the same scene file gives the same picture.
import { rng } from '../util.mjs';

const INK = '#2a2346';
const SKIN = ['#f1c9a5', '#e0ac80', '#c68b59', '#a0673f', '#7c4a2d', '#f3d4b5', '#d9a07a'];
const SHIRT = ['#e2604f', '#5b8fd6', '#f2c14b', '#6aa34c', '#b58ad6', '#d98aa8', '#8fc6a0', '#f29e4c', '#4fb3b0', '#7b6fc4'];
const HAIR = ['#2a2346', '#5a3a22', '#8a5a32', '#c98d55', '#e8c07a', '#a33b2b', '#3b3b3b', '#d8d2c4'];
export const BADGES = ['heart', 'star', 'bulb', 'dot', 'mail', 'question', 'exclamation'];
const BADGE_COLOR = { heart: '#e2604f', star: '#f2c14b', bulb: '#f6d94a', dot: '#e2604f', mail: '#fffaf0', question: '#5b8fd6', exclamation: '#e2604f' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;

function num(where, v, def, lo, hi) {
  if (v == null) return def;
  if (!isNum(v) || v < lo || v > hi) throw new Error(`${where} must be a number from ${lo} to ${hi}.`);
  return v;
}
const int = (where, v, def, lo, hi) => {
  const n = num(where, v, def, lo, hi);
  if (n != null && !Number.isInteger(n)) throw new Error(`${where} must be a whole number.`);
  return n;
};
const color = (where, v, def) => {
  if (v == null) return def;
  if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${where} must be a colour like "#e2604f".`);
  return v;
};
const point = (where, p) => {
  if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => isNum(v) && v >= 0 && v <= 1)) throw new Error(`${where} must be [x, y], each from 0 to 1.`);
  return [p[0], p[1]];
};

/** Validate and fill in a crowd: {count, seed, h, size, wander, speed, homes, ring, spread, gather}. */
export function checkCrowd(where, c) {
  if (!c || typeof c !== 'object') throw new Error(`${where} crowd must be an object, e.g. {"count": 25}.`);
  const count = int(`${where} crowd count`, c.count, 12, 1, 80);
  const out = {
    count,
    seed: c.seed == null ? 'crowd' : String(c.seed).slice(0, 60),
    // The crowd's box: 1000 units wide, h * 1000 tall. Homes and places are fractions of it.
    h: num(`${where} crowd h`, c.h, 0.6, 0.1, 3),
    size: num(`${where} crowd size`, c.size, 0.07, 0.02, 0.3),
    wander: num(`${where} crowd wander`, c.wander, 0.03, 0, 0.3),
    speed: num(`${where} crowd speed`, c.speed, 0.6, 0, 4),
    homes: null,
    ring: null,
    spread: null,
    gather: null,
  };
  if (c.homes != null) {
    if (!Array.isArray(c.homes) || c.homes.length < count) throw new Error(`${where} crowd homes must list at least ${count} [x, y] spots.`);
    out.homes = c.homes.slice(0, count).map((p, k) => point(`${where} crowd home ${k + 1}`, p));
  }
  if (c.ring != null) {
    const r = typeof c.ring === 'number' ? { who: c.ring } : c.ring;
    if (!r || typeof r !== 'object') throw new Error(`${where} crowd ring must be a person's number or {who, at, color}.`);
    out.ring = { who: int(`${where} crowd ring who`, r.who, 0, 0, count - 1), at: num(`${where} crowd ring at`, r.at, 0, 0, 600), color: color(`${where} crowd ring color`, r.color, '#f2c14b') };
  }
  if (c.spread != null) {
    const s = c.spread;
    if (!s || typeof s !== 'object') throw new Error(`${where} crowd spread must be {from, to, at, dur, badge}.`);
    const from = int(`${where} crowd spread from`, s.from, 0, 0, count - 1);
    out.spread = {
      from,
      to: int(`${where} crowd spread to`, s.to, count, 1, count),
      at: num(`${where} crowd spread at`, s.at, 0.5, 0, 600),
      dur: num(`${where} crowd spread dur`, s.dur, 4, 0.2, 120),
      badge: s.badge == null ? 'heart' : BADGES.includes(s.badge) ? s.badge : (() => { throw new Error(`${where} crowd spread badge must be one of ${BADGES.join(', ')}.`); })(),
      color: color(`${where} crowd spread color`, s.color, null),
      whisper: s.whisper !== false,
    };
  }
  if (c.gather != null) {
    const g = c.gather;
    if (!g || typeof g !== 'object') throw new Error(`${where} crowd gather must be {who | count, to: [x, y], at, dur}.`);
    let who = null;
    if (g.who != null) {
      if (!Array.isArray(g.who) || !g.who.length) throw new Error(`${where} crowd gather who must list people by number.`);
      who = g.who.map((v, k) => int(`${where} crowd gather who ${k + 1}`, v, null, 0, count - 1));
    }
    out.gather = {
      who,
      count: int(`${where} crowd gather count`, g.count, who ? who.length : Math.min(5, count), 1, count),
      to: point(`${where} crowd gather to`, g.to ?? [0.5, 0.5]),
      at: num(`${where} crowd gather at`, g.at, 0.5, 0, 600),
      dur: num(`${where} crowd gather dur`, g.dur, 2.5, 0.2, 60),
    };
  }
  return out;
}

/** Badge drawings, centred on 0,0, about 30 units across. */
function badgeSvg(kind, fill) {
  const f = fill || BADGE_COLOR[kind];
  const st = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  switch (kind) {
    case 'heart': return `<path d="M0,13 C-20,0 -16,-16 -6,-15 C-2,-15 0,-11 0,-9 C0,-11 2,-15 6,-15 C16,-16 20,0 0,13 Z" fill="${f}" ${st}/>`;
    case 'star': return `<path d="M0,-16 L4.7,-6.5 L15.2,-4.9 L7.6,2.5 L9.4,13 L0,8 L-9.4,13 L-7.6,2.5 L-15.2,-4.9 L-4.7,-6.5 Z" fill="${f}" ${st}/>`;
    case 'bulb': return `<path d="M-9,4 C-16,-4 -12,-17 0,-17 C12,-17 16,-4 9,4 L8,9 L-8,9 Z" fill="${f}" ${st}/><path d="M-6,13 L6,13" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'mail': return `<rect x="-15" y="-10" width="30" height="21" rx="3" fill="${f}" ${st}/><path d="M-15,-9 L0,3 L15,-9" fill="none" ${st}/>`;
    case 'question': return `<circle r="15" fill="${f}" ${st}/><path d="M-5,-5 C-5,-12 6,-12 6,-5 C6,0 0,0 0,5" fill="none" stroke="#fffaf0" stroke-width="3.5" stroke-linecap="round"/><circle cy="10" r="2" fill="#fffaf0"/>`;
    case 'exclamation': return `<circle r="15" fill="${f}" ${st}/><path d="M0,-9 L0,3" stroke="#fffaf0" stroke-width="4" stroke-linecap="round"/><circle cy="9" r="2.2" fill="#fffaf0"/>`;
    default: return `<circle r="9" fill="${f}" ${st}/>`;
  }
}

/** One small person, feet at 0,0, about 76 units tall, facing right. */
function personSvg(skin, shirt, hair, style) {
  const st = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`;
  const hairPath = style === 0
    ? 'M-15,-58 C-16,-75 16,-75 15,-58 C10,-64 -6,-66 -15,-58 Z'
    : style === 1
      ? 'M-15,-56 C-18,-77 18,-77 15,-56 C16,-48 12,-44 12,-44 C12,-52 10,-60 0,-63 C-10,-60 -12,-52 -12,-44 C-12,-44 -16,-48 -15,-56 Z'
      : 'M-14,-60 C-14,-74 14,-74 14,-60 L10,-64 L4,-60 L-2,-65 L-8,-60 Z';
  return `<path d="M-7,-3 L-7,-17 M7,-3 L7,-17" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="-14" y="-44" width="28" height="30" rx="12" fill="${shirt}" ${st}/>` +
    `<circle cx="0" cy="-58" r="15" fill="${skin}" ${st}/>` +
    `<path d="${hairPath}" fill="${hair}" ${st}/>` +
    `<circle cx="6" cy="-57" r="2.2" fill="${INK}"/><circle cx="-2" cy="-57" r="2.2" fill="${INK}"/>`;
}

/** Spots for the crowd: the given homes, or a seeded scatter that keeps people apart. */
function homesOf(c, rand, H) {
  if (c.homes) return c.homes.map(([x, y]) => [x * 1000, y * H]);
  const pad = 60;
  const minD = Math.max(40, Math.sqrt((1000 * H) / c.count) * 0.7);
  const pts = [];
  for (let k = 0; k < c.count; k++) {
    let best = null;
    let bestD = -1;
    for (let tries = 0; tries < 40; tries++) {
      const p = [pad + rand() * (1000 - 2 * pad), pad + 40 + rand() * (H - 2 * pad - 40)];
      const d = pts.length ? Math.min(...pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))) : 1e9;
      if (d > bestD) { best = p; bestD = d; }
      if (d >= minD) break;
    }
    pts.push(best);
  }
  return pts;
}

/**
 * Who hears the news in what order and from whom: each new listener is, among those not told yet, one
 * of the nearest to someone who already knows. Returns [{who, from, t}] with t in seconds after the
 * crowd appears; the first entry is the one who starts with it (from = -1).
 */
export function spreadOrder(c, homes) {
  const s = c.spread;
  if (!s) return [];
  const rand = rng(`spread:${c.seed}`);
  const knows = [s.from];
  const out = [{ who: s.from, from: -1, t: s.at }];
  const left = new Set(homes.map((_, k) => k).filter((k) => k !== s.from));
  while (knows.length < s.to && left.size) {
    // The distance from each person not told yet to the nearest person who knows.
    const cand = [...left].map((k) => {
      let d = 1e9;
      let from = knows[0];
      for (const j of knows) {
        const dd = Math.hypot(homes[k][0] - homes[j][0], homes[k][1] - homes[j][1]);
        if (dd < d) { d = dd; from = j; }
      }
      return { k, d, from };
    }).sort((a, b) => a.d - b.d);
    const pick = cand[Math.min(cand.length - 1, Math.floor(rand() * Math.min(3, cand.length)))];
    left.delete(pick.k);
    knows.push(pick.k);
    out.push({ who: pick.k, from: pick.from, t: 0 });
  }
  const n = out.length - 1;
  // Slow at first, then faster, as more people pass it on.
  out.forEach((e, k) => { if (k > 0) e.t = s.at + 0.35 + s.dur * Math.pow(k / Math.max(1, n), 0.8); });
  return out;
}

/** The crowd as SVG, plus the times anyone hears the news (for sound effects). */
export function crowdSvg(c) {
  const H = Math.round(c.h * 1000);
  const rand = rng(`crowd:${c.seed}`);
  const homes = homesOf(c, rand, H);
  const order = spreadOrder(c, homes);
  const knowAt = new Map(order.map((e) => [e.who, e.t]));
  // Who walks to the gathering place, and where each one stands there.
  const gatherAt = new Map();
  if (c.gather) {
    const g = c.gather;
    const who = g.who || (order.length ? order.map((e) => e.who) : homes.map((_, k) => k)).slice(0, g.count);
    const [gx, gy] = [g.to[0] * 1000, g.to[1] * H];
    who.forEach((k, n) => {
      const a = (n / who.length) * Math.PI * 2 + 0.4;
      const rr = who.length > 1 ? 34 + 6 * who.length : 0;
      gatherAt.set(k, [gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * 0.55]);
    });
  }
  const s = c.size * 1000 / 76;
  const people = homes.map(([hx, hy], k) => {
    const skin = SKIN[Math.floor(rand() * SKIN.length)];
    const shirt = SHIRT[Math.floor(rand() * SHIRT.length)];
    const hair = HAIR[Math.floor(rand() * HAIR.length)];
    const style = Math.floor(rand() * 3);
    const ph = r1(rand() * 6.28);
    const sp = r1((0.6 + rand() * 0.8) * c.speed * 100) / 100;
    const know = knowAt.has(k) ? knowAt.get(k) : -1;
    const g = gatherAt.get(k);
    const ringAt = c.ring && c.ring.who === k ? c.ring.at : -1;
    const ring = c.ring && c.ring.who === k ? `<ellipse class="cring" cx="0" cy="-36" rx="38" ry="46" fill="none" stroke="${c.ring.color}" stroke-width="5" stroke-dasharray="10 8" opacity="0"/>` : '';
    const badge = know >= 0 ? `<g class="cbad" opacity="0">${badgeSvg(c.spread.badge, c.spread.color)}</g>` : '';
    return `<g class="cm" transform="translate(${r1(hx)},${r1(hy)})" data-i="${k}" data-hx="${r1(hx)}" data-hy="${r1(hy)}" data-ph="${ph}" data-sp="${sp}" data-wa="${r1(c.wander * 1000)}" data-s="${r1(s * 100) / 100}" data-know="${know}" data-ring="${ringAt}" data-gt="${g ? c.gather.at : -1}" data-gd="${g ? c.gather.dur : 1}" data-gx="${g ? r1(g[0]) : 0}" data-gy="${g ? r1(g[1]) : 0}">` +
      `${ring}<g class="cf" transform="scale(${r1(s * 100) / 100})">${personSvg(skin, shirt, hair, style)}</g>${badge}</g>`;
  });
  // Draw people lower on the map in front of people higher up.
  const byDepth = people.map((p, k) => [homes[k][1], p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const badgeFill = c.spread ? c.spread.color || BADGE_COLOR[c.spread.badge] : INK;
  const whisperColor = badgeFill === '#fffaf0' ? INK : badgeFill;
  const arcs = c.spread && c.spread.whisper ? order.slice(1).map((e) => `<path class="cw" data-a="${e.from}" data-b="${e.who}" data-t="${r1(e.t * 100) / 100}" fill="none" stroke="${whisperColor}" stroke-width="4" stroke-linecap="round" opacity="0"/>`).join('') : '';
  const svg = `<svg class="crowd" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${H}">${arcs}${byDepth.join('')}</svg>`;
  return { svg, knowAt: order.slice(1).map((e) => e.t) };
}

/** Validate and fill in a network: {nodes, from, to, at, dur, seed, color}. */
export function checkNetwork(where, n) {
  if (!n || typeof n !== 'object') throw new Error(`${where} network must be an object, e.g. {"nodes": 25, "from": 0.17, "to": 0.74}.`);
  const out = {
    nodes: int(`${where} network nodes`, n.nodes, 12, 3, 60),
    from: num(`${where} network from`, n.from, 0.1, 0, 1),
    to: num(`${where} network to`, n.to, 0.5, 0, 1),
    at: num(`${where} network at`, n.at, 0.5, 0, 600),
    dur: num(`${where} network dur`, n.dur, 4, 0.2, 120),
    seed: n.seed == null ? 'network' : String(n.seed).slice(0, 60),
    color: color(`${where} network color`, n.color, '#e2604f'),
  };
  if (out.to < out.from) throw new Error(`${where} network "to" must be at least "from".`);
  return out;
}

/**
 * A ring of faces and the ties between them: round(from * pairs) ties at the start, then new ones
 * appearing one by one until round(to * pairs). Returns {svg, ties: [start, end]}.
 */
export function networkSvg(n) {
  const rand = rng(`network:${n.seed}`);
  const N = n.nodes;
  const R = 400;
  const pts = Array.from({ length: N }, (_, k) => {
    const a = -Math.PI / 2 + (k / N) * Math.PI * 2;
    return [500 + Math.cos(a) * R, 500 + Math.sin(a) * R];
  });
  const pairs = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) pairs.push([a, b]);
  for (let k = pairs.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [pairs[k], pairs[j]] = [pairs[j], pairs[k]];
  }
  const e0 = Math.round(n.from * pairs.length);
  const e1 = Math.round(n.to * pairs.length);
  const grow = e1 - e0;
  const lines = pairs.slice(0, e1).map(([a, b], k) => {
    const t = k < e0 ? -1 : r1((n.at + (n.dur * (k - e0 + 1)) / Math.max(1, grow)) * 100) / 100;
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    return k < e0
      ? `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${INK}" stroke-width="3" opacity=".45"/>`
      : `<line class="ne" data-t="${t}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${n.color}" stroke-width="3" stroke-linecap="round" opacity="0"/>`;
  }).join('');
  const faces = pts.map(([x, y]) => {
    const skin = SKIN[Math.floor(rand() * SKIN.length)];
    const hair = HAIR[Math.floor(rand() * HAIR.length)];
    return `<g transform="translate(${r1(x)},${r1(y)})"><circle r="24" fill="${skin}" stroke="${INK}" stroke-width="4"/><path d="M-24,-4 C-24,-30 24,-30 24,-4 C16,-12 -10,-14 -24,-4 Z" fill="${hair}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="-8" cy="3" r="3" fill="${INK}"/><circle cx="8" cy="3" r="3" fill="${INK}"/><path d="M-7,11 Q0,16 7,11" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`;
  }).join('');
  return { svg: `<svg class="network" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${lines}${faces}</svg>`, ties: [e0, e1] };
}
