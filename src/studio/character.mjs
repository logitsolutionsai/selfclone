// selfclone studio: a drawn character made from a face photo or clip. No image model and no GPU: the
// face landmarks found at enrolment give the proportions, the photo gives the colours, and the
// character is drawn as SVG with switchable mouth, eye and pose groups so a video can animate it.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256, rng } from '../util.mjs';

export const MOUTHS = ['rest', 'smile', 'small', 'wide', 'open', 'round', 'pucker', 'fv'];
// Arm gestures. Per arm (right and left as the viewer sees them): shoulder angle out from hanging down,
// elbow angle (positive bends the forearm outward and up, negative across the body), and the hand shape.
// `lift` raises the shoulders (a shrug); `wave` swings the right forearm.
export const GESTURES = {
  rest: { right: [5, -6, 'rest'], left: [5, -6, 'rest'] },
  point: { right: [58, 122, 'point'], left: [5, -6, 'rest'] },
  wave: { right: [64, 110, 'open'], left: [5, -6, 'rest'], wave: 1 },
  explain: { right: [24, -112, 'open'], left: [5, -6, 'rest'] },
  present: { right: [34, 100, 'open'], left: [34, 100, 'open'] },
  shrug: { right: [30, 92, 'open'], left: [30, 92, 'open'], lift: 1 },
  // Thinking swaps the right arm for a hand at the chin; the left arm folds across the waist.
  think: { right: [5, -6, 'rest'], left: [14, -86, 'rest'], chin: 1 },
  thumbs: { right: [44, 136, 'thumb'], left: [5, -6, 'rest'] },
  count: { right: [50, 128, 'two'], left: [5, -6, 'rest'] },
};
export const POSES = Object.keys(GESTURES);
export const MOODS = ['neutral', 'happy', 'surprised', 'serious', 'sad', 'curious'];
// Brow raise (in eye heights, up is positive) and tilt (degrees, positive lifts the outer end) per mood,
// for [right brow, left brow]; `smile` turns the resting mouth into a smile; `wide` opens the eyes.
export const MOOD_FACES = {
  neutral: { brows: [[0, 0], [0, 0]] },
  happy: { brows: [[0.25, 4], [0.25, 4]], smile: 1 },
  surprised: { brows: [[0.9, 0], [0.9, 0]], wide: 1 },
  serious: { brows: [[-0.35, -10], [-0.35, -10]] },
  sad: { brows: [[0.2, 14], [0.2, 14]] },
  curious: { brows: [[0.75, 0], [-0.1, -6]] },
};
export const HAIR_STYLES = ['short', 'bun', 'updo', 'long', 'curly', 'bald', 'ponytail', 'afro', 'wild', 'sidepart', 'headscarf', 'buzz'];
export const FACIAL_HAIR = ['none', 'mustache', 'beard', 'stubble', 'goatee'];
export const OUTFITS = ['sweater', 'labcoat', 'suit', 'tshirt', 'hoodie'];
export const BODIES = ['bust', 'full'];
const HAIR_COLORS = ['#1d1a20', '#2b1d16', '#3d2a1e', '#5a3a2a', '#8a5a32', '#b07a3e', '#d9b26a', '#c9c5bd', '#7a2f1f', '#e8d9b0'];
const HEX = /^#[0-9a-f]{6}$/i;

// ---- colour helpers ----
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));

// Skin tones for photos with no usable colour (black and white), from light to deep.
const SKIN_RAMP = ['#f3d2bd', '#e8b996', '#d29a74', '#b07850', '#8a5636', '#5e3a24'];

/** Median colour of the pixels in a disc. `img` is {width, height, data} with RGB or RGBA bytes. */
export function sampleDisc(img, x, y, r) {
  const ch = img.data.length / (img.width * img.height);
  const rs = [];
  const gs = [];
  const bs = [];
  for (let j = Math.floor(y - r); j <= y + r; j++) {
    for (let i = Math.floor(x - r); i <= x + r; i++) {
      if (i < 0 || j < 0 || i >= img.width || j >= img.height || (i - x) ** 2 + (j - y) ** 2 > r * r) continue;
      const o = (j * img.width + i) * ch;
      rs.push(img.data[o]);
      gs.push(img.data[o + 1]);
      bs.push(img.data[o + 2]);
    }
  }
  if (!rs.length) return null;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

const P = (lm, i) => ({ x: lm[i][0], y: lm[i][1] });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Character parameters from a bake record ({landmarks, size, checks}) and its decoded image. Pure.
 * Proportions come from the 478 landmarks; colours from small discs of the photo. A black and white
 * photo keeps its lightness (grey or white hair stays light) and gets a skin tone from the ramp.
 */
export function characterFromFace(bake, img, { hairStyle, facialHair, glasses, outfit } = {}) {
  const lm = bake.landmarks;
  const top = P(lm, 10);
  const chin = P(lm, 152);
  const left = P(lm, 234);
  const right = P(lm, 454);
  const faceH = dist(top, chin);
  const faceW = dist(left, right);
  const eyeR = P(lm, 468) || P(lm, 159);
  const eyeL = P(lm, 473) || P(lm, 386);
  const mouthL = P(lm, 61);
  const mouthR = P(lm, 291);
  const noseTip = P(lm, 1);
  const mouthC = { x: (P(lm, 13).x + P(lm, 14).x) / 2, y: (P(lm, 13).y + P(lm, 14).y) / 2 };
  const along = (p) => ((p.x - top.x) * (chin.x - top.x) + (p.y - top.y) * (chin.y - top.y)) / (faceH * faceH);
  const r = Math.max(2, faceW * 0.035);
  const at = (p, dx = 0, dy = 0) => sampleDisc(img, p.x + dx * faceW, p.y + dy * faceH, r) || [128, 128, 128];
  const avg = (cs) => cs[0].map((_, k) => cs.reduce((s, c) => s + c[k], 0) / cs.length);
  const skin = avg([at(P(lm, 50)), at(P(lm, 280)), at(P(lm, 151))]);
  const hair = avg([at(top, 0, -0.1), at(P(lm, 103), -0.06, -0.05), at(P(lm, 332), 0.06, -0.05)]);
  const lips = avg([at({ x: mouthC.x, y: (P(lm, 0).y + P(lm, 13).y) / 2 }), at({ x: mouthC.x, y: (P(lm, 14).y + P(lm, 17).y) / 2 })]);
  const clothes = avg([at(chin, -0.75, 0.45), at(chin, 0.75, 0.45)]);
  const collar = at(chin, 0, 0.42);
  const grey = sat(skin) < 0.08 && sat(lips) < 0.08;
  let skinHex;
  let lipsHex;
  if (grey) {
    // No colour to read: pick a skin tone from how light the skin looks next to the rest of the photo.
    const l = luma(skin);
    skinHex = SKIN_RAMP[clamp(Math.round((1 - l / 255) * (SKIN_RAMP.length - 1) * 1.2 - 0.6), 0, SKIN_RAMP.length - 1)];
    lipsHex = mix(skinHex, '#b5525a', 0.45);
  } else {
    skinHex = mix(hex(skin), '#f0b48c', 0.25);
    lipsHex = mix(hex(lips), '#c0505a', 0.35);
  }
  // Hair close to the skin colour, or close to the background, means there is little hair to see.
  const tint = (c, toward) => (grey ? hex([luma(c), luma(c), luma(c)].map((v, i) => v + [6, 2, -6][i])) : mix(hex(c), toward, 0.15));
  const hairHex = tint(hair, '#5a3a2a');
  const clothesHex = tint(clothes, '#3b4a6b');
  const collarHex = tint(collar, '#f2efe8');
  return {
    version: 1,
    colors: {
      skin: skinHex,
      hair: hairHex,
      lips: lipsHex,
      clothes: luma(rgbOf(clothesHex)) < 30 ? '#2f3348' : clothesHex,
      collar: luma(rgbOf(collarHex)) < 90 ? '#ece6da' : collarHex,
      eyes: '#26243f',
      ink: '#2a2346',
    },
    hairStyle: HAIR_STYLES.includes(hairStyle) ? hairStyle : 'short',
    facialHair: FACIAL_HAIR.includes(facialHair) ? facialHair : 'none',
    glasses: glasses == null ? !!(bake.checks && bake.checks.glassesLikely) : !!glasses,
    outfit: OUTFITS.includes(outfit) ? outfit : 'sweater',
    face: {
      aspect: round(clamp(faceW / faceH, 0.62, 0.95)),
      eyeSpacing: round(clamp(dist(eyeL, eyeR) / faceW, 0.32, 0.5)),
      eyeY: round(clamp(along({ x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 }), 0.3, 0.5)),
      noseY: round(clamp(along(noseTip), 0.5, 0.7)),
      mouthY: round(clamp(along(mouthC), 0.65, 0.85)),
      mouthWidth: round(clamp(dist(mouthL, mouthR) / faceW, 0.3, 0.5)),
    },
    source: { grey },
  };
}
const round = (x) => Math.round(x * 1000) / 1000;

/** Check a character file and fill defaults. Throws with a plain message. */
export function checkCharacter(c) {
  if (!c || typeof c !== 'object' || c.version !== 1) throw new Error('Not a selfclone character file (version 1).');
  for (const k of ['skin', 'hair', 'lips', 'clothes', 'collar', 'eyes', 'ink']) {
    if (!HEX.test(String(c.colors && c.colors[k]))) throw new Error(`character colors.${k} must be a colour like #a0b1c2.`);
  }
  if (!HAIR_STYLES.includes(c.hairStyle)) throw new Error(`character hairStyle must be one of ${HAIR_STYLES.join(', ')}.`);
  if (!FACIAL_HAIR.includes(c.facialHair)) throw new Error(`character facialHair must be one of ${FACIAL_HAIR.join(', ')}.`);
  if (c.outfit == null) c.outfit = 'sweater';
  if (!OUTFITS.includes(c.outfit)) throw new Error(`character outfit must be one of ${OUTFITS.join(', ')}.`);
  const f = c.face || {};
  for (const [k, lo, hi] of [['aspect', 0.5, 1.1], ['eyeSpacing', 0.25, 0.6], ['eyeY', 0.2, 0.6], ['noseY', 0.4, 0.8], ['mouthY', 0.55, 0.9], ['mouthWidth', 0.2, 0.6]]) {
    if (!(f[k] >= lo && f[k] <= hi)) throw new Error(`character face.${k} must be from ${lo} to ${hi}.`);
  }
  const k = c.consent;
  if (!k || String(k.statement || '').trim().length < 8 || !Number.isFinite(Date.parse(k.date))) {
    throw new Error('This character has no consent record. Make it with selfclone character --photo <img> --consent "<statement>".');
  }
  return c;
}

/** Decode an image file or buffer to RGB bytes with the installed ffmpeg. */
export function decodeImage(input) {
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', '-i', 'pipe:0'], { input: buf, encoding: 'utf8' });
  if (probe.error && probe.error.code === 'ENOENT') throw new Error('ffprobe was not found. Install ffmpeg and make sure it is on your PATH.');
  const [width, height] = String(probe.stdout).trim().split(',').map(Number);
  if (!(width > 0 && height > 0)) throw new Error('Could not read the image.');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { input: buf, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode the image: ${String(r.stderr).trim().split('\n').pop()}`);
  return { width, height, data: r.stdout };
}

/** Make a character from a photo or video file: landmarks in headless Chrome, colours with ffmpeg. */
export async function characterFromMedia({ photo, video, consent, name, hairStyle, facialHair, glasses, outfit }) {
  if (!consent || String(consent).trim().length < 8) throw new Error('Refusing to make a character without a consent statement.');
  const { detectPhoto, detectVideo } = await import('../face/bake.mjs');
  const bake = video ? await detectVideo(video) : await detectPhoto(photo);
  const jpeg = Buffer.from(bake.image.split(',')[1], 'base64');
  const img = decodeImage(jpeg);
  const c = characterFromFace(bake, img, { hairStyle, facialHair, outfit, glasses: glasses === 'yes' ? true : glasses === 'no' ? false : undefined });
  c.consent = { name: name || '', statement: String(consent).trim(), date: new Date().toISOString(), method: video ? 'video' : 'photo', sourceSha256: sha256(fs.readFileSync(video || photo)) };
  return { character: c, bake };
}

/**
 * A random fictional person, from a seed: skin, hair, face proportions, outfit and accessories drawn
 * from natural ranges. Nobody's likeness, so the consent record says it is fictional.
 */
export function randomCharacter(seed = String(Date.now())) {
  const r = rng(`character:${seed}`);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (lo, hi) => Math.round((lo + r() * (hi - lo)) * 1000) / 1000;
  const skin = mix(pick(SKIN_RAMP), pick(SKIN_RAMP), r() * 0.5);
  const hairStyle = pick(HAIR_STYLES.filter((h) => h !== 'bald' || r() < 0.3));
  const outfit = pick(OUTFITS);
  // Clothes and hair must stand apart from the skin, or the drawing turns into one blob.
  const far = (a, b, d) => rgbOf(a).reduce((s, v, k) => s + (v - rgbOf(b)[k]) ** 2, 0) > d * d;
  const pickFar = (list, d) => {
    const ok = list.filter((x) => far(x, skin, d));
    return pick(ok.length ? ok : list);
  };
  const clothes = pickFar(['#2f3348', '#3b5b8c', '#7a3b4a', '#2f6b5a', '#8a5a32', '#5a4a8a', '#c0603a', '#2a2a2a', '#4f7a9a'], 90);
  const hair = hairStyle === 'headscarf' ? pickFar(['#c0603a', '#3b5b8c', '#2f6b5a', '#7a3b4a', '#d9a441'], 90) : pickFar(HAIR_COLORS, 70);
  return {
    version: 1,
    colors: {
      skin,
      hair,
      lips: mix(skin, '#b5525a', 0.45),
      clothes,
      collar: outfit === 'suit' ? '#f4f2ee' : pick(['#f2efe8', '#e8d9b0', '#cfe0ea', '#f4f2ee']),
      eyes: pick(['#26243f', '#3a2a1e', '#2f4a5a', '#2f4a2f']),
      ink: '#2a2346',
    },
    hairStyle,
    facialHair: r() < 0.3 ? pick(FACIAL_HAIR.filter((f) => f !== 'none')) : 'none',
    glasses: r() < 0.3,
    outfit,
    face: {
      aspect: between(0.72, 0.9),
      eyeSpacing: between(0.4, 0.48),
      eyeY: between(0.3, 0.37),
      noseY: between(0.55, 0.62),
      mouthY: between(0.72, 0.79),
      mouthWidth: between(0.32, 0.42),
    },
    source: { random: true, seed: String(seed) },
    consent: {
      name: 'Fictional character',
      statement: `A fictional character generated by selfclone from the seed "${seed}"; not a real person.`,
      date: new Date().toISOString(),
      method: 'random',
    },
  };
}

// ---- drawing ----
// The character is drawn in a 600 x 720 box: head and shoulders, arms at the sides or one arm pointing.
export const CHAR_BOX = { width: 600, height: 720 };
export const FULL_BOX = { width: 600, height: 1280 };

function headGeometry(c) {
  // H spans the face landmarks (hairline to chin); the skull adds a quarter of that above the hairline.
  const H = 270;
  const W = H * c.face.aspect * 0.86;
  const cx = 300;
  const top = 125;
  const skull = top - H * 0.27;
  return { H, W, cx, top, skull, bottom: top + H, left: cx - W / 2, right: cx + W / 2 };
}

function facePath({ cx, skull, bottom, W, left, right }) {
  const top = skull;
  const H = bottom - skull;
  return `M${cx},${top} C${cx + W * 0.56},${top} ${right},${top + H * 0.22} ${right},${top + H * 0.45} ` +
    `C${right},${top + H * 0.72} ${cx + W * 0.26},${bottom} ${cx},${bottom} ` +
    `C${cx - W * 0.26},${bottom} ${left},${top + H * 0.72} ${left},${top + H * 0.45} ` +
    `C${left},${top + H * 0.22} ${cx - W * 0.56},${top} ${cx},${top} Z`;
}

function hairLayers(c, g) {
  const { cx, top, H, W, left, right } = g;
  const col = c.colors.hair;
  const ink = c.colors.ink;
  const dark = mix(col, '#000000', 0.25);
  const m = W * 0.07;
  const st = `fill="${col}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"`;
  // A cap over the top of the head, with a hairline across the forehead.
  const sk = g.skull;
  const cap = (drop = 0.3, lift = 1) =>
    // Control points placed so the curve's peak sits just above the top of the skull.
    `<path ${st} d="M${left - m},${top + H * drop} C${left - m * 1.5},${top - H * ((0.33 + 0.25 * drop) / 0.75 + 0.08 * (lift - 1))} ${right + m * 1.5},${top - H * ((0.33 + 0.25 * drop) / 0.75 + 0.08 * (lift - 1))} ${right + m},${top + H * drop} ` +
    `L${right - W * 0.03},${top + H * drop} C${right - W * 0.06},${top + H * 0.02} ${cx + W * 0.2},${top - H * 0.03} ${cx},${top + H * 0.01} C${cx - W * 0.2},${top - H * 0.03} ${left + W * 0.06},${top + H * 0.02} ${left + W * 0.03},${top + H * drop} Z"/>`;
  const strands = (n, y0, y1) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = left + W * (0.15 + (0.7 * i) / Math.max(1, n - 1));
      s += `<path d="M${x},${y0 + (y1 - y0) * 0.15} Q${x + (x - cx) * 0.35},${(y0 + y1) / 2} ${x + (x - cx) * 0.2},${y1}" fill="none" stroke="${dark}" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/>`;
    }
    return s;
  };
  let back = '';
  let front = '';
  switch (c.hairStyle) {
    case 'bun':
      back = `<circle cx="${cx}" cy="${sk - H * 0.1}" r="${W * 0.2}" ${st}/>` + `<path d="M${cx - W * 0.12},${sk - H * 0.12} q${W * 0.12},${-H * 0.07} ${W * 0.24},0" fill="none" stroke="${dark}" stroke-width="2"/>`;
      front = cap(0.3) + strands(5, sk, top - H * 0.02);
      break;
    case 'updo':
      // Swept up and back with volume at the sides, gathered at the crown.
      back = `<ellipse cx="${cx}" cy="${top + H * 0.12}" rx="${W * 0.64}" ry="${H * 0.42}" ${st}/>` +
        `<ellipse cx="${cx + W * 0.05}" cy="${sk - H * 0.06}" rx="${W * 0.26}" ry="${H * 0.12}" ${st}/>` +
        `<path d="M${cx - W * 0.12},${sk - H * 0.07} q${W * 0.15},${-H * 0.08} ${W * 0.32},${H * 0.01}" fill="none" stroke="${dark}" stroke-width="2"/>`;
      front = cap(0.36, 1.25) + strands(4, sk - H * 0.04, top + H * 0.02);
      break;
    case 'long':
      back = `<path ${st} d="M${left - m},${top + H * 0.1} C${left - m * 2},${top + H * 1.0} ${left - m},${top + H * 1.35} ${left + W * 0.1},${top + H * 1.4} L${right - W * 0.1},${top + H * 1.4} C${right + m},${top + H * 1.35} ${right + m * 2},${top + H * 1.0} ${right + m},${top + H * 0.1} Z"/>`;
      front = cap(0.45) + strands(6, sk, top + H * 0.02);
      break;
    case 'curly': {
      let blobs = '';
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.95 + (1.1 * i) / 10);
        blobs += `<circle cx="${cx + Math.cos(a) * W * 0.55}" cy="${top + H * 0.2 + Math.sin(a) * H * 0.48}" r="${W * 0.17}" ${st}/>`;
      }
      back = blobs;
      front = cap(0.26, 1.2);
      break;
    }
    case 'bald':
      back = '';
      front = `<path d="M${left + W * 0.02},${top + H * 0.38} q${-m},${H * 0.08} ${0},${H * 0.16}" ${st}/><path d="M${right - W * 0.02},${top + H * 0.38} q${m},${H * 0.08} ${0},${H * 0.16}" ${st}/>`;
      break;
    case 'ponytail':
      back = `<path ${st} d="M${right - W * 0.05},${top + H * 0.05} C${right + W * 0.35},${top + H * 0.1} ${right + W * 0.3},${top + H * 0.75} ${right + W * 0.12},${top + H * 0.95} C${right + W * 0.05},${top + H * 0.7} ${right + W * 0.08},${top + H * 0.35} ${right - W * 0.05},${top + H * 0.2} Z"/>` +
        `<circle cx="${right + W * 0.02}" cy="${top + H * 0.12}" r="${W * 0.06}" fill="${mix(col, '#c0603a', 0.5)}" stroke="${ink}" stroke-width="2.5"/>`;
      front = cap(0.3) + strands(4, sk, top - H * 0.02);
      break;
    case 'afro': {
      let blobs = '';
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * (0.85 + (1.3 * i) / 15);
        blobs += `<circle cx="${cx + Math.cos(a) * W * 0.66}" cy="${top + H * 0.12 + Math.sin(a) * H * 0.62}" r="${W * 0.2}" ${st}/>`;
      }
      back = `<ellipse cx="${cx}" cy="${top + H * 0.05}" rx="${W * 0.78}" ry="${H * 0.66}" fill="${col}"/>` + blobs;
      front = cap(0.24, 1.3);
      break;
    }
    case 'wild': {
      // Wild, swept-out hair: spikes all round the top and sides.
      let d = `M${left - m},${top + H * 0.42}`;
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (1.05 + (0.9 * i) / n);
        const rr = i % 2 ? 0.58 : 0.8;
        d += ` L${cx + Math.cos(a) * W * rr},${top + H * 0.18 + Math.sin(a) * H * (i % 2 ? 0.5 : 0.7)}`;
      }
      back = `<path ${st} d="${d} L${right + m},${top + H * 0.42} Z"/>`;
      front = cap(0.22, 1.1) + strands(6, sk - H * 0.05, top + H * 0.02);
      break;
    }
    case 'sidepart':
      front = `<path ${st} d="M${left - m},${top + H * 0.3} C${left - m * 1.5},${sk - H * 0.2} ${right + m * 1.5},${sk - H * 0.2} ${right + m},${top + H * 0.3} L${right - W * 0.03},${top + H * 0.3} C${right - W * 0.1},${top + H * 0.05} ${cx - W * 0.05},${top + H * 0.12} ${left + W * 0.08},${top + H * 0.2} L${left + W * 0.03},${top + H * 0.3} Z"/>` +
        `<path d="M${cx - W * 0.18},${sk + H * 0.02} Q${cx - W * 0.1},${top - H * 0.05} ${cx + W * 0.3},${top + H * 0.08}" fill="none" stroke="${dark}" stroke-width="2" opacity="0.6"/>`;
      break;
    case 'headscarf':
      // A scarf over the hair and the sides of the face, wrapped under the chin.
      back = `<path ${st} d="M${left - m * 1.4},${top + H * 0.2} C${left - m * 2},${sk - H * 0.35} ${right + m * 2},${sk - H * 0.35} ${right + m * 1.4},${top + H * 0.2} C${right + m * 1.6},${top + H * 0.8} ${right + W * 0.1},${top + H * 1.12} ${cx},${top + H * 1.16} C${left - W * 0.1},${top + H * 1.12} ${left - m * 1.6},${top + H * 0.8} ${left - m * 1.4},${top + H * 0.2} Z"/>`;
      // The band's peak sits above the skull, as the cap's does, so no scalp shows over it when the head turns.
      front = `<path ${st} d="M${left - m},${top + H * 0.5} C${left - m * 2.6},${top - H * 0.61} ${right + m * 2.6},${top - H * 0.61} ${right + m},${top + H * 0.5} L${right - W * 0.05},${top + H * 0.5} C${right - W * 0.02},${top + H * 0.05} ${left + W * 0.02},${top + H * 0.05} ${left + W * 0.05},${top + H * 0.5} Z"/>` +
        `<path d="M${left + W * 0.02},${top + H * 0.02} Q${cx},${top - H * 0.12} ${right - W * 0.02},${top + H * 0.02}" fill="none" stroke="${dark}" stroke-width="2.5"/>`;
      break;
    case 'buzz':
      front = `<path d="M${left},${top + H * 0.3} C${left - m},${sk - H * 0.15} ${right + m},${sk - H * 0.15} ${right},${top + H * 0.3} L${right - W * 0.03},${top + H * 0.3} C${right - W * 0.06},${top + H * 0.04} ${left + W * 0.06},${top + H * 0.04} ${left + W * 0.03},${top + H * 0.3} Z" fill="${col}" opacity="0.85" stroke="${ink}" stroke-width="2"/>`;
      break;
    default: // short
      front = cap(0.28) + strands(5, sk, top - H * 0.02);
  }
  return { back, front };
}

function mouthGroup(c, g, shape) {
  const { cx, top, H, W } = g;
  const y = top + H * c.face.mouthY;
  const mw = W * c.face.mouthWidth * 0.82;
  const ink = c.colors.ink;
  const lips = c.colors.lips;
  const cav = '#3a1d2a';
  if (shape === 'smile') {
    return `<path d="M${cx - mw * 0.55},${y - mw * 0.06} Q${cx},${y + mw * 0.34} ${cx + mw * 0.55},${y - mw * 0.06} Q${cx},${y + mw * 0.16} ${cx - mw * 0.55},${y - mw * 0.06} Z" fill="${lips}" stroke="${ink}" stroke-width="2"/>` +
      `<path d="M${cx - mw * 0.58},${y - mw * 0.08} Q${cx},${y + mw * 0.24} ${cx + mw * 0.58},${y - mw * 0.08}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (shape === 'fv') {
    // F and V: the upper teeth on the lower lip.
    return `<path d="M${cx - mw * 0.5},${y} Q${cx},${y - mw * 0.16} ${cx + mw * 0.5},${y} Q${cx},${y + mw * 0.22} ${cx - mw * 0.5},${y} Z" fill="#3a1d2a" stroke="${ink}" stroke-width="2"/>` +
      `<rect x="${cx - mw * 0.32}" y="${y - mw * 0.08}" width="${mw * 0.64}" height="${mw * 0.1}" rx="2" fill="#f4efe6"/>` +
      `<path d="M${cx - mw * 0.5},${y + mw * 0.02} Q${cx},${y + mw * 0.3} ${cx + mw * 0.5},${y + mw * 0.02} Q${cx},${y + mw * 0.12} ${cx - mw * 0.5},${y + mw * 0.02} Z" fill="${lips}" stroke="${ink}" stroke-width="2"/>`;
  }
  if (shape === 'rest') {
    return `<path d="M${cx - mw / 2},${y} Q${cx},${y + mw * 0.1} ${cx + mw / 2},${y} Q${cx},${y + mw * 0.26} ${cx - mw / 2},${y} Z" fill="${lips}" stroke="${ink}" stroke-width="2"/>` +
      `<path d="M${cx - mw / 2},${y} Q${cx},${y + mw * 0.08} ${cx + mw / 2},${y}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const dims = { small: [0.8, 0.16], wide: [1.12, 0.26], open: [0.95, 0.5], round: [0.58, 0.42], pucker: [0.42, 0.24] }[shape];
  const w = mw * dims[0];
  const h = mw * dims[1];
  const lip = Math.max(4, mw * 0.09);
  const id = `${g.pid}-m-${shape}`;
  const inner = `M${cx - w / 2},${y} C${cx - w / 2},${y - h * 0.62} ${cx + w / 2},${y - h * 0.62} ${cx + w / 2},${y} C${cx + w / 2},${y + h * 0.9} ${cx - w / 2},${y + h * 0.9} ${cx - w / 2},${y} Z`;
  const outer = `M${cx - w / 2 - lip},${y} C${cx - w / 2 - lip},${y - h * 0.62 - lip * 1.3} ${cx + w / 2 + lip},${y - h * 0.62 - lip * 1.3} ${cx + w / 2 + lip},${y} C${cx + w / 2 + lip},${y + h * 0.9 + lip * 1.5} ${cx - w / 2 - lip},${y + h * 0.9 + lip * 1.5} ${cx - w / 2 - lip},${y} Z`;
  const teeth = shape === 'wide' || shape === 'open' ? `<rect x="${cx - w / 2}" y="${y - h * 0.5}" width="${w}" height="${h * 0.24}" fill="#f4efe6"/>` : '';
  const tongue = shape === 'open' || shape === 'round' ? `<ellipse cx="${cx}" cy="${y + h * 0.62}" rx="${w * 0.32}" ry="${h * 0.28}" fill="#b4545e"/>` : '';
  return `<clipPath id="${id}"><path d="${inner}"/></clipPath>` +
    `<path d="${outer}" fill="${lips}" stroke="${ink}" stroke-width="2"/>` +
    `<path d="${inner}" fill="${cav}"/>` +
    `<g clip-path="url(#${id})">${teeth}${tongue}</g>` +
    `<path d="${inner}" fill="none" stroke="${ink}" stroke-width="2.5"/>`;
}

function eyes(c, g) {
  const { cx, top, H, W } = g;
  const y = top + H * c.face.eyeY;
  const dx = (W * c.face.eyeSpacing) / 2;
  const ew = W * 0.2;
  const eh = ew * 0.48;
  const ink = c.colors.ink;
  let open = '';
  let half = '';
  let closed = '';
  let glasses = '';
  const brows = [];
  const browCol = mix(c.colors.hair, c.colors.ink, 0.45);
  for (const s of [-1, 1]) {
    const x = cx + s * dx;
    const id = `${g.pid}-eye${s < 0 ? 'R' : 'L'}`;
    const almond = `M${x - ew / 2},${y} C${x - ew / 4},${y - eh} ${x + ew / 4},${y - eh} ${x + ew / 2},${y} C${x + ew / 4},${y + eh * 0.75} ${x - ew / 4},${y + eh * 0.75} ${x - ew / 2},${y} Z`;
    const upper = `M${x - ew / 2 - 2},${y + 1} C${x - ew / 4},${y - eh - 1} ${x + ew / 4},${y - eh - 1} ${x + ew / 2 + 2},${y + 1}`;
    const ball = `<path d="${almond}" fill="#f7f3ec"/>` +
      `<g clip-path="url(#${id})"><g class="iris"><circle cx="${x}" cy="${y - eh * 0.04}" r="${eh * 0.6}" fill="${c.colors.eyes}"/><circle cx="${x + eh * 0.18}" cy="${y - eh * 0.24}" r="${eh * 0.14}" fill="#ffffff" opacity="0.9"/></g></g>` +
      `<path d="M${x - ew / 2},${y} C${x - ew / 4},${y + eh * 0.75} ${x + ew / 4},${y + eh * 0.75} ${x + ew / 2},${y}" fill="none" stroke="${ink}" stroke-width="1.5" opacity="0.6"/>`;
    open += `<clipPath id="${id}"><path d="${almond}"/></clipPath>${ball}<path d="${upper}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    // Half shut: the lid (skin) comes down over the top half; its edge is the lash line.
    const lidY = y + eh * 0.12;
    half += `${ball}<path d="M${x - ew / 2 - 2},${y + 1} C${x - ew / 4},${y - eh - 2} ${x + ew / 4},${y - eh - 2} ${x + ew / 2 + 2},${y + 1} C${x + ew / 4},${lidY} ${x - ew / 4},${lidY} ${x - ew / 2 - 2},${y + 1} Z" fill="${c.colors.skin}"/>` +
      `<path d="M${x - ew / 2 - 2},${y + 1} C${x - ew / 4},${lidY} ${x + ew / 4},${lidY} ${x + ew / 2 + 2},${y + 1}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    closed += `<path d="M${x - ew / 2},${y + eh * 0.1} C${x - ew / 4},${y + eh * 0.55} ${x + ew / 4},${y + eh * 0.55} ${x + ew / 2},${y + eh * 0.1}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    const by = y - eh * 1.45;
    brows.push(`<g id="${g.pid}-brow${s < 0 ? 'R' : 'L'}" data-x="${x}" data-y="${by}" data-side="${s}" data-eh="${eh}"><path d="M${x - ew * 0.55},${y - eh * 1.25} Q${x},${y - eh * 1.85} ${x + ew * 0.55},${y - eh * 1.3}" fill="none" stroke="${browCol}" stroke-width="6" stroke-linecap="round"/></g>`);
    if (c.glasses) glasses += `<circle cx="${x}" cy="${y}" r="${ew * 0.62}" fill="#ffffff" fill-opacity="0.08" stroke="${ink}" stroke-width="3.5"/>`;
  }
  if (c.glasses) glasses += `<path d="M${cx - dx + ew * 0.62},${y - 2} Q${cx},${y - eh * 0.6} ${cx + dx - ew * 0.62},${y - 2}" fill="none" stroke="${ink}" stroke-width="3"/>`;
  return { open, half, closed, brows: brows.join(''), glasses };
}

function hands(c, x, y, key, pid) {
  // Drawn pointing down (+y) from the wrist at (x, y); the forearm's rotation turns them.
  const ink = c.colors.ink;
  const sk = c.colors.skin;
  const st = `fill="${sk}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"`;
  const rest = `<ellipse cx="${x}" cy="${y + 20}" rx="19" ry="23" ${st}/>`;
  let fingers = '';
  for (const [dx, len, rot] of [[-12, 30, 14], [-4, 36, 4], [5, 35, -4], [13, 28, -14]]) {
    fingers += `<rect x="${x + dx - 4.5}" y="${y + 22}" width="9" height="${len}" rx="4.5" transform="rotate(${rot} ${x + dx} ${y + 24})" ${st}/>`;
  }
  const open = `${fingers}<ellipse cx="${x}" cy="${y + 20}" rx="20" ry="19" ${st}/><rect x="${x - 26}" y="${y + 8}" width="9" height="26" rx="4.5" transform="rotate(38 ${x - 21} ${y + 12})" ${st}/>`;
  const point = `<rect x="${x - 5}" y="${y + 26}" width="11" height="44" rx="5.5" ${st}/><ellipse cx="${x}" cy="${y + 20}" rx="19" ry="20" ${st}/>`;
  const thumb = `<rect x="${x - 13}" y="${y + 24}" width="13" height="34" rx="6.5" ${st}/><ellipse cx="${x + 3}" cy="${y + 20}" rx="20" ry="21" ${st}/><path d="M${x - 6},${y + 12} l16,0 M${x - 6},${y + 20} l17,0 M${x - 6},${y + 28} l15,0" stroke="${ink}" stroke-width="2" opacity="0.5"/>`;
  const two = `<rect x="${x - 12}" y="${y + 26}" width="10" height="42" rx="5" transform="rotate(8 ${x - 7} ${y + 28})" ${st}/><rect x="${x + 2}" y="${y + 26}" width="10" height="42" rx="5" transform="rotate(-8 ${x + 7} ${y + 28})" ${st}/><ellipse cx="${x}" cy="${y + 20}" rx="19" ry="20" ${st}/>`;
  const shapes = { rest, open, point, thumb, two };
  return ['rest', 'open', 'point', 'thumb', 'two'].map((h) => `<g id="${pid}-hand${key}-${h}"${h === 'rest' ? '' : ' display="none"'}>${shapes[h]}</g>`).join('');
}

/** Outfit colours: the coat or top, the sleeves (upper arm, forearm), and the trousers. */
function outfitColors(c) {
  const cl = c.colors.clothes;
  const ink = c.colors.ink;
  const coat = '#f3f1ec';
  switch (c.outfit) {
    case 'labcoat': return { top: coat, upper: coat, fore: coat, legs: mix(cl, ink, 0.35) };
    case 'tshirt': return { top: cl, upper: cl, fore: c.colors.skin, legs: '#3b4a6b' };
    default: return { top: cl, upper: cl, fore: cl, legs: c.outfit === 'suit' ? cl : mix(cl, ink, 0.4) };
  }
}

/**
 * The torso for the outfit: `bottom` is where it ends (below the frame for a bust, the waist for a full
 * body). Returns the shape (drawn under the arms) and the neckline details (drawn over).
 */
function torsoFor(c, g, shoulderY, bodyW, neckW, bottom, full) {
  const { cx, H } = g;
  const ink = c.colors.ink;
  const oc = outfitColors(c);
  const wb = full ? bodyW * 0.4 : bodyW / 2;
  const shape = `<path d="M${cx - wb},${bottom} C${cx - bodyW / 2},${shoulderY + H * 0.05} ${cx - bodyW * 0.3},${shoulderY - H * 0.02} ${cx - neckW * 0.55},${shoulderY - H * 0.04} ` +
    `L${cx + neckW * 0.55},${shoulderY - H * 0.04} C${cx + bodyW * 0.3},${shoulderY - H * 0.02} ${cx + bodyW / 2},${shoulderY + H * 0.05} ${cx + wb},${bottom} Z" fill="${oc.top}" stroke="${ink}" stroke-width="3"/>`;
  const vee = (depth, col) => `<path d="M${cx - neckW * 0.62},${shoulderY - H * 0.04} L${cx},${shoulderY + H * depth} L${cx + neckW * 0.62},${shoulderY - H * 0.04} L${cx + neckW * 0.3},${shoulderY - H * 0.05} L${cx},${shoulderY + H * 0.12} L${cx - neckW * 0.3},${shoulderY - H * 0.05} Z" fill="${col}" stroke="${ink}" stroke-width="2.5"/>`;
  let detail;
  switch (c.outfit) {
    case 'labcoat':
      // Lapels open over a shirt in the clothes colour, a pocket and a pen.
      detail = `<path d="M${cx - neckW * 0.62},${shoulderY - H * 0.04} L${cx},${shoulderY + H * 0.62} L${cx + neckW * 0.62},${shoulderY - H * 0.04} Z" fill="${c.colors.clothes}" stroke="${ink}" stroke-width="2.5"/>` +
        vee(0.3, c.colors.collar) +
        `<path d="M${cx - neckW * 0.62},${shoulderY - H * 0.04} L${cx - neckW * 0.25},${shoulderY + H * 0.62} M${cx + neckW * 0.62},${shoulderY - H * 0.04} L${cx + neckW * 0.25},${shoulderY + H * 0.62}" stroke="${ink}" stroke-width="2.5" fill="none"/>` +
        `<rect x="${cx + bodyW * 0.14}" y="${shoulderY + H * 0.5}" width="${bodyW * 0.12}" height="${H * 0.16}" fill="none" stroke="${ink}" stroke-width="2"/>` +
        `<rect x="${cx + bodyW * 0.17}" y="${shoulderY + H * 0.44}" width="6" height="${H * 0.12}" fill="#3b5b8c" stroke="${ink}" stroke-width="1.5"/>`;
      break;
    case 'suit':
      detail = vee(0.55, c.colors.collar) +
        `<path d="M${cx},${shoulderY + H * 0.1} L${cx - 9},${shoulderY + H * 0.2} L${cx},${shoulderY + H * 0.55} L${cx + 9},${shoulderY + H * 0.2} Z" fill="#b8423a" stroke="${ink}" stroke-width="2"/>` +
        `<path d="M${cx - neckW * 0.62},${shoulderY - H * 0.04} L${cx - neckW * 0.15},${shoulderY + H * 0.62} M${cx + neckW * 0.62},${shoulderY - H * 0.04} L${cx + neckW * 0.15},${shoulderY + H * 0.62}" stroke="${ink}" stroke-width="2.5" fill="none"/>`;
      break;
    case 'tshirt':
      detail = `<path d="M${cx - neckW * 0.6},${shoulderY - H * 0.04} Q${cx},${shoulderY + H * 0.14} ${cx + neckW * 0.6},${shoulderY - H * 0.04}" fill="${mix(oc.top, ink, 0.2)}" stroke="${ink}" stroke-width="2.5"/>`;
      break;
    case 'hoodie':
      detail = `<path d="M${cx - neckW * 0.95},${shoulderY - H * 0.02} Q${cx},${shoulderY - H * 0.2} ${cx + neckW * 0.95},${shoulderY - H * 0.02} Q${cx},${shoulderY + H * 0.16} ${cx - neckW * 0.95},${shoulderY - H * 0.02} Z" fill="${mix(oc.top, ink, 0.25)}" stroke="${ink}" stroke-width="2.5"/>` +
        `<path d="M${cx - 12},${shoulderY + H * 0.06} l-3,${H * 0.3} M${cx + 12},${shoulderY + H * 0.06} l3,${H * 0.3}" stroke="${c.colors.collar}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    default:
      detail = vee(0.32, c.colors.collar);
  }
  return { shape, detail };
}

/** A jointed leg for the full body: the thigh turns at the hip, the shin at the knee; a shoe at the end. */
function leg(c, g, side, hipX, hipY, legs) {
  const key = side > 0 ? 'Rt' : 'Lt';
  const ink = c.colors.ink;
  const L = g.H * 0.74;
  const kx = hipX;
  const ky = hipY + L;
  const fy = ky + L;
  const limb = (x0, y0, x1, y1, w) => `<path d="M${x0},${y0} L${x1},${y1}" fill="none" stroke="${ink}" stroke-width="${w + 6}" stroke-linecap="round"/><path d="M${x0},${y0} L${x1},${y1}" fill="none" stroke="${legs}" stroke-width="${w}" stroke-linecap="round"/>`;
  const shoe = `<ellipse cx="${kx + side * 14}" cy="${fy + 2}" rx="38" ry="16" fill="${ink}"/>`;
  return `<g id="${g.pid}-leg${key}" data-x="${hipX}" data-y="${hipY}">${limb(hipX, hipY, kx, ky, 74)}` +
    `<g id="${g.pid}-shin${key}" data-x="${kx}" data-y="${ky}">${limb(kx, ky, kx, fy - 6, 66)}${shoe}</g></g>`;
}

/** Thinking: a hand at the chin, the elbow resting low, as one drawing shown in place of the right arm. */
function chinArm(c, g, shoulderX, shoulderY, sleeves) {
  const { cx, bottom, H, W } = g;
  const ink = c.colors.ink;
  const ex = cx + W * 0.55;
  const ey = shoulderY + H * 0.78;
  const hx = cx + W * 0.1;
  const hy = bottom + H * 0.02;
  const limb = (x0, y0, x1, y1, w, col) => `<path d="M${x0},${y0} L${x1},${y1}" fill="none" stroke="${ink}" stroke-width="${w + 6}" stroke-linecap="round"/><path d="M${x0},${y0} L${x1},${y1}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  const st = `fill="${c.colors.skin}" stroke="${ink}" stroke-width="2.5"`;
  return `<g id="${g.pid}-chin" display="none">${limb(shoulderX, shoulderY, ex, ey, 50, sleeves.upper)}${limb(ex, ey, hx + 8, hy + 22, 44, sleeves.fore)}` +
    `<ellipse cx="${hx}" cy="${hy + 6}" rx="20" ry="17" ${st}/><rect x="${hx - 5}" y="${hy - 30}" width="10" height="34" rx="5" transform="rotate(-18 ${hx} ${hy})" ${st}/></g>`;
}

/** One jointed arm: the upper arm turns at the shoulder, the forearm at the elbow, the hand is swapped. */
function arm(c, g, side, shoulderX, shoulderY, sleeves) {
  const key = side > 0 ? 'Rt' : 'Lt';
  const ink = c.colors.ink;
  const L1 = g.H * 0.58;
  const L2 = g.H * 0.5;
  const ex = shoulderX;
  const ey = shoulderY + L1;
  const wy = ey + L2;
  const limb = (x0, y0, x1, y1, w, col) => `<path d="M${x0},${y0} L${x1},${y1}" fill="none" stroke="${ink}" stroke-width="${w + 6}" stroke-linecap="round"/>` +
    `<path d="M${x0},${y0} L${x1},${y1}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  const cuff = sleeves.fore === c.colors.skin ? '' : `<path d="M${ex - 22},${wy - 12} L${ex + 22},${wy - 12}" stroke="${mix(sleeves.fore, ink, 0.45)}" stroke-width="2.5"/>`;
  return `<g id="${g.pid}-arm${key}" data-side="${side}" data-x="${shoulderX}" data-y="${shoulderY}">` +
    limb(shoulderX, shoulderY, ex, ey, 50, sleeves.upper) +
    `<g id="${g.pid}-fore${key}" data-x="${ex}" data-y="${ey}">${hands(c, ex, wy, key, g.pid)}${limb(ex, ey, ex, wy - 8, 44, sleeves.fore)}${cuff}</g>` +
    `</g>`;
}

/** The box a character is drawn in: head and shoulders, or the full body with legs. */
export function charBox(body = 'bust') {
  return body === 'full' ? FULL_BOX : CHAR_BOX;
}

/**
 * The character as one SVG string, built as a rig the page animates: every mouth shape and three eye
 * states (open, half, closed) are groups with ids; the brows, the facial features (for looking aside),
 * the head, the torso, two jointed arms with three hand shapes each, a hand-at-the-chin arm and, for the
 * full body, two jointed legs are groups the page moves. Ids are prefixed with `id` so several
 * characters can share a page.
 */
export function characterSvg(c, { id = 'char', body = 'bust' } = {}) {
  const full = body === 'full';
  const box = charBox(body);
  const g = { ...headGeometry(c), pid: id };
  const { cx, top, H, W, bottom } = g;
  const ink = c.colors.ink;
  const skin = c.colors.skin;
  const shade = mix(skin, '#7a3b3b', 0.18);
  const hair = hairLayers(c, g);
  const e = eyes(c, g);
  const noseY = top + H * c.face.noseY;
  const eyeY = top + H * c.face.eyeY;
  const neckW = W * 0.4;
  const shoulderY = bottom + H * 0.22;
  const bodyW = W * 2.3;
  const oc = outfitColors(c);
  const neck = `<path d="M${cx - neckW / 2},${bottom - H * 0.12} L${cx - neckW / 2},${shoulderY} L${cx + neckW / 2},${shoulderY} L${cx + neckW / 2},${bottom - H * 0.12} Z" fill="${shade}" stroke="${ink}" stroke-width="3"/>`;
  const waistY = shoulderY + H * 1.45;
  const torso = torsoFor(c, g, shoulderY, bodyW, neckW, full ? waistY : box.height + 10, full);
  // Light comes from the upper left: a shadow down the right of the face and torso, a fold under the collar.
  const faceShade = mix(skin, '#5a2a3a', 0.35);
  const shading = `<clipPath id="${id}-fc"><path d="${facePath(g)}"/></clipPath><g clip-path="url(#${id}-fc)">` +
    `<ellipse cx="${cx + W * 0.62}" cy="${top + H * 0.42}" rx="${W * 0.36}" ry="${H * 0.95}" fill="${faceShade}" opacity="0.22"/>` +
    `<ellipse cx="${cx}" cy="${bottom + H * 0.02}" rx="${W * 0.34}" ry="${H * 0.06}" fill="${faceShade}" opacity="0.18"/></g>`;
  const topCol = outfitColors(c).top;
  const torsoBottom = full ? waistY : box.height + 10;
  const clothShade = `<clipPath id="${id}-tc">${torso.shape.replace(/ fill="[^"]*" stroke="[^"]*" stroke-width="[^"]*"/, '')}</clipPath><g clip-path="url(#${id}-tc)">` +
    `<ellipse cx="${cx + bodyW * 0.62}" cy="${(shoulderY + torsoBottom) / 2}" rx="${bodyW * 0.42}" ry="${(torsoBottom - shoulderY) * 0.9 + H * 0.3}" fill="${mix(topCol, '#1d1840', 0.35)}" opacity="0.32"/>` +
    `<path d="M${cx - bodyW * 0.22},${shoulderY + H * 0.55} q${bodyW * 0.08},${-H * 0.06} ${bodyW * 0.16},0" fill="none" stroke="${mix(topCol, '#1d1840', 0.4)}" stroke-width="2.5" opacity="0.6"/></g>`;
  // A lighter streak on the hair, toward the light.
  const hairLight = c.hairStyle === 'bald' || c.hairStyle === 'buzz' ? '' :
    `<path d="M${cx - W * 0.32},${top - H * 0.08} Q${cx - W * 0.12},${g.skull - H * 0.02} ${cx + W * 0.05},${g.skull + H * 0.02}" fill="none" stroke="${mix(c.colors.hair, '#ffffff', 0.35)}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>`;
  const belt = full ? `<path d="M${cx - bodyW * 0.4},${waistY - 4} L${cx + bodyW * 0.4},${waistY - 4}" stroke="${ink}" stroke-width="10" stroke-linecap="round"/>` : '';
  const legs = full ? `<g id="${id}-legs">${leg(c, g, -1, cx - W * 0.3, waistY - 10, oc.legs)}${leg(c, g, 1, cx + W * 0.3, waistY - 10, oc.legs)}</g>` : '';
  const armY = shoulderY + H * 0.16;
  const sleeves = { upper: oc.upper, fore: oc.fore };
  const arms = `<g id="${id}-arms">${arm(c, g, -1, cx - bodyW * 0.31, armY, sleeves)}${arm(c, g, 1, cx + bodyW * 0.31, armY, sleeves)}${chinArm(c, g, cx + bodyW * 0.31, armY, sleeves)}</g>`;
  // The shoulders drawn again over the tops of the arms, so the arms come out from under the jacket.
  const yoke = `<clipPath id="${id}-yoke"><rect x="0" y="0" width="${box.width}" height="${armY + H * 0.08}"/></clipPath><g clip-path="url(#${id}-yoke)">${torso.shape}${torso.detail}</g>`;
  // A headscarf covers the ears.
  const ears = c.hairStyle === 'headscarf' ? '' : [-1, 1].map((s) => `<ellipse cx="${cx + s * W * 0.49}" cy="${eyeY + H * 0.07}" rx="${W * 0.07}" ry="${H * 0.085}" fill="${skin}" stroke="${ink}" stroke-width="3"/>`).join('');
  const nose = `<path d="M${cx + W * 0.025},${eyeY + H * 0.04} Q${cx + W * 0.075},${noseY - H * 0.03} ${cx + W * 0.05},${noseY} Q${cx + W * 0.01},${noseY + H * 0.03} ${cx - W * 0.055},${noseY - H * 0.006}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const blush = [-1, 1].map((s) => `<ellipse cx="${cx + s * W * 0.27}" cy="${noseY + H * 0.02}" rx="${W * 0.09}" ry="${H * 0.04}" fill="#d9646a" opacity="0.22"/>`).join('');
  const my = top + H * c.face.mouthY;
  const mw = W * c.face.mouthWidth * 0.82;
  const hc = c.colors.hair;
  const fh = c.facialHair;
  let beard = '';
  if (fh === 'mustache' || fh === 'beard') {
    beard += `<path d="M${cx - mw * 0.75},${my - mw * 0.05} Q${cx},${my - mw * 0.45} ${cx + mw * 0.75},${my - mw * 0.05} Q${cx},${my - mw * 0.22} ${cx - mw * 0.75},${my - mw * 0.05} Z" fill="${hc}" stroke="${ink}" stroke-width="2.5"/>`;
  }
  if (fh === 'goatee') {
    beard += `<path d="M${cx - mw * 0.4},${my + mw * 0.3} Q${cx},${my + mw * 0.2} ${cx + mw * 0.4},${my + mw * 0.3} Q${cx + mw * 0.2},${bottom + H * 0.02} ${cx},${bottom + H * 0.03} Q${cx - mw * 0.2},${bottom + H * 0.02} ${cx - mw * 0.4},${my + mw * 0.3} Z" fill="${hc}" stroke="${ink}" stroke-width="2.5"/>`;
  }
  let beardBack = fh === 'beard'
    ? `<path d="M${g.left + W * 0.04},${top + H * 0.55} C${g.left + W * 0.08},${bottom + H * 0.12} ${g.right - W * 0.08},${bottom + H * 0.12} ${g.right - W * 0.04},${top + H * 0.55} C${g.right - W * 0.2},${top + H * 0.68} ${g.left + W * 0.2},${top + H * 0.68} ${g.left + W * 0.04},${top + H * 0.55} Z" fill="${hc}" stroke="${ink}" stroke-width="3"/>`
    : '';
  if (fh === 'stubble') {
    // A shadow of stubble over the jaw: a soft band of the hair colour, dotted.
    beardBack = `<path d="M${g.left + W * 0.06},${top + H * 0.6} C${g.left + W * 0.1},${bottom + H * 0.02} ${g.right - W * 0.1},${bottom + H * 0.02} ${g.right - W * 0.06},${top + H * 0.6} C${g.right - W * 0.2},${top + H * 0.7} ${g.left + W * 0.2},${top + H * 0.7} ${g.left + W * 0.06},${top + H * 0.6} Z" fill="${hc}" opacity="0.28"/>`;
  }
  const mouths = MOUTHS.map((m) => `<g id="${id}-mouth-${m}" class="mouth" data-shape="${m}"${m === 'rest' ? '' : ' display="none"'}>${mouthGroup(c, g, m)}</g>`).join('');
  const eyeStates = `<g id="${id}-eyes-open">${e.open}</g><g id="${id}-eyes-half" display="none">${e.half}</g><g id="${id}-eyes-closed" display="none">${e.closed}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.width} ${box.height}" width="${box.width}" height="${box.height}" overflow="visible">` +
    `<g id="${id}-body" data-x="${cx}" data-y="${box.height}">${legs}${neck}${torso.shape}${clothShade}${belt}${torso.detail}${arms}${yoke}</g>` +
    `<g id="${id}-head" data-x="${cx}" data-y="${bottom}" data-w="${W}" data-h="${H}">` +
    `<g id="${id}-hairback">${hair.back}</g><g id="${id}-ears">${ears}</g><path d="${facePath(g)}" fill="${skin}" stroke="${ink}" stroke-width="3.5"/>${shading}${beardBack}` +
    `<g id="${id}-face">${blush}${eyeStates}${e.brows}${e.glasses}<g id="${id}-nose" data-x="${cx}">${nose}</g>${mouths}${beard}</g>` +
    `<g id="${id}-hairfront">${hair.front}${hairLight}</g>` +
    `</g></svg>`;
}
