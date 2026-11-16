// selfclone studio: per-frame tracks computed from the narration before rendering. All pure.
import { rng, quantile } from '../util.mjs';
import { textToVisemes } from '../../face/lib/geometry.js';

// Text visemes (face/lib/geometry.js) mapped onto the drawn mouths.
const VMAP = { rest: 'rest', AA: 'open', E: 'wide', I: 'wide', O: 'round', U: 'pucker', FV: 'fv', L: 'small' };

/**
 * A function from audio time to text time for one spoken line: linear from the line's start to its end,
 * anchored in between at pauses, matching the pauses in the text (commas and full stops) with the
 * silences in the audio when there are as many of each.
 */
function aligner(line, segs, feat, quiet) {
  const t0 = segs[0].start / 1000;
  const t1 = segs[segs.length - 1].end / 1000;
  const textPauses = segs.slice(1, -1).filter((g) => g.v === 'rest' && g.word === -1).map((g) => (g.start + g.end) / 2000);
  const gaps = [];
  let from = -1;
  for (let i = Math.ceil(line.start / feat.hop); i <= Math.floor(line.end / feat.hop); i++) {
    const silent = (feat.rms[i] || 0) < quiet;
    if (silent && from < 0) from = i;
    if (!silent && from >= 0) {
      if ((i - from) * feat.hop >= 0.12 && from * feat.hop > line.start + 0.1) gaps.push(((from + i) / 2) * feat.hop);
      from = -1;
    }
  }
  const anchors = [[line.start, t0]];
  if (textPauses.length && textPauses.length === gaps.length) textPauses.forEach((tp, k) => anchors.push([gaps[k], tp]));
  anchors.push([line.end, t1]);
  return (t) => {
    for (let k = 1; k < anchors.length; k++) {
      const [a0, b0] = anchors[k - 1];
      const [a1, b1] = anchors[k];
      if (t <= a1) return b0 + ((t - a0) / Math.max(1e-6, a1 - a0)) * (b1 - b0);
    }
    return t1;
  };
}

/**
 * The mouth shape for every video frame. Lines with text are lip-read from the text: its letters give
 * the shapes (closed lips for M, B and P, teeth on the lip for F and V, rounded O and U), stretched onto
 * the line's audio and anchored at its pauses, while the loudness decides how far the mouth opens and
 * closes it in silences. Lines without text fall back to loudness and spectral centroid alone. Outside
 * spoken lines the mouth rests. Shapes change on twos (every other frame at 24 fps).
 */
export function mouthTrack(feat, fps, frames, spans) {
  const inSpan = (t, pad = 0) => spans.find((s) => t >= s.start - pad && t <= s.end + pad);
  const voicedRms = [];
  const voicedCen = [];
  feat.rms.forEach((r, i) => {
    if (r > 0.003 && inSpan(i * feat.hop)) {
      voicedRms.push(r);
      voicedCen.push(feat.centroid[i]);
    }
  });
  const loud = quantile(voicedRms, 0.9) || 0.05;
  const cMed = quantile(voicedCen, 0.5) || 1500;
  const quiet = loud * 0.12;
  const lip = new Map();
  for (const s of spans) {
    if (!s.text) continue;
    // Phoneme segments when the caller looked them up, else the letter table.
    const tv = s.segs ? { segments: s.segs } : textToVisemes(s.text);
    const segs = tv.segments.filter((g, k, a) => !(g.v === 'rest' && g.word === -1 && (k === 0 || k === a.length - 1)));
    if (segs.length) lip.set(s, { segs, map: aligner(s, segs, feat, quiet) });
  }
  const step = fps >= 20 ? 2 : 1;
  const out = new Array(frames);
  for (let f = 0; f < frames; f++) {
    if (f % step) {
      out[f] = out[f - 1];
      continue;
    }
    const t = f / fps;
    const span = inSpan(t, 0.02);
    if (!span) {
      out[f] = 'rest';
      continue;
    }
    const a = Math.max(0, Math.floor((t - 0.03) / feat.hop));
    const b = Math.min(feat.rms.length - 1, Math.ceil((t + 0.03) / feat.hop));
    let r = 0;
    let cw = 0;
    let c = 0;
    for (let i = a; i <= b; i++) {
      r += feat.rms[i];
      c += feat.centroid[i] * feat.rms[i];
      cw += feat.rms[i];
    }
    r /= Math.max(1, b - a + 1);
    c = cw > 0 ? c / cw : cMed;
    const o = r / loud;
    const L = lip.get(span);
    let shape;
    if (L) {
      const tt = L.map(t) * 1000;
      const seg = L.segs.find((g) => tt >= g.start && tt < g.end) || L.segs[L.segs.length - 1];
      shape = VMAP[seg.v] || 'small';
      if (o < 0.1 && shape !== 'fv') shape = 'rest';
      else if (shape === 'open' && o < 0.45) shape = 'small';
      else if (shape === 'wide' && o < 0.25) shape = 'small';
    } else {
      const dark = c < cMed * 0.82;
      const bright = c > cMed * 1.18;
      if (o < 0.15) shape = 'rest';
      else if (o < 0.4) shape = dark ? 'pucker' : 'small';
      else if (o < 0.7) shape = dark ? 'round' : bright ? 'wide' : 'small';
      else shape = dark ? 'round' : bright ? 'wide' : 'open';
    }
    out[f] = shape;
  }
  return out;
}

/**
 * Blinks: one every 2.2 to 5.5 s (sometimes a quick double blink). Each frame is 0 (open), 1 (half
 * shut) or 2 (shut): a blink is half, shut, half, about 0.17 s at 24 fps. Seeded.
 */
export function blinkTrack(frames, fps, seed = 'blink') {
  const rand = rng(seed);
  const out = new Array(frames).fill(0);
  const shut = Math.max(1, Math.round(0.08 * fps));
  const one = (at) => {
    const seq = [1, ...new Array(shut).fill(2), 1];
    seq.forEach((v, k) => {
      if (at + k < frames) out[at + k] = v;
    });
    return seq.length;
  };
  let next = Math.round((1 + rand() * 2) * fps);
  while (next < frames) {
    let len = one(next);
    if (rand() < 0.15) len += Math.round(0.12 * fps) + one(next + len + Math.round(0.12 * fps));
    next += len + Math.round((2.2 + rand() * 3.3) * fps);
  }
  return out;
}

/**
 * Emphasis (0 to 1) for every frame: a short bump around each stressed syllable, found as a loudness
 * peak well above the speaker's usual level and at least 0.45 s from the last one. The page uses it for
 * nods, brow lifts and beat gestures, which is what makes a talking head look like it means it.
 */
export function emphasisTrack(feat, fps, frames, spans) {
  const n = feat.rms.length;
  const k = Math.max(1, Math.round(0.04 / feat.hop));
  const smooth = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = i - k; j <= i + k; j++) {
      if (j >= 0 && j < n) {
        s += feat.rms[j];
        c++;
      }
    }
    smooth[i] = s / c;
  }
  const inSpan = (t) => spans.some((s) => t >= s.start && t <= s.end);
  const voiced = smooth.filter((v, i) => v > 0.003 && inSpan(i * feat.hop));
  // A peak must be in the top fifth of the speech and clearly above its median, so flat speech has none.
  const hi = Math.max(quantile(voiced, 0.8), 1.4 * quantile(voiced, 0.5)) || Infinity;
  const win = Math.round(0.2 / feat.hop);
  const peaks = [];
  for (let i = 0; i < n; i++) {
    if (smooth[i] <= hi || !inSpan(i * feat.hop)) continue;
    let top = true;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
      if (smooth[j] > smooth[i]) {
        top = false;
        break;
      }
    }
    const t = i * feat.hop;
    if (top && (!peaks.length || t - peaks[peaks.length - 1] >= 0.45)) peaks.push(t);
  }
  const out = new Array(frames).fill(0);
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    let v = 0;
    for (const p of peaks) {
      if (Math.abs(t - p) < 0.4) v = Math.max(v, Math.exp(-(((t - p) / 0.13) ** 2)));
    }
    out[f] = Math.round(v * 100) / 100;
  }
  return out;
}

// IPA (from the phonemizer Kokoro installs) to the photo avatar's viseme names.
const IPA = [
  [/^(aɪ|aʊ)/, 'AA', 160], [/^(eɪ)/, 'E', 150], [/^(oʊ|ɔɪ)/, 'O', 160], [/^(tʃ|dʒ)/, 'U', 90],
  [/^[aɑæʌɐ]/, 'AA', 120], [/^[ɛe]/, 'E', 120], [/^[iɪᵻ]/, 'I', 110], [/^[oɔɒ]/, 'O', 120], [/^[uʊw]/, 'U', 110],
  [/^[ʃʒ]/, 'U', 80], [/^[əɚɜɝ]/, 'L', 90], [/^[pbm]/, 'rest', 85], [/^[fv]/, 'FV', 80],
  [/^[tdnszlkɡgŋhjθðɾɹrxʔ]/, 'L', 70],
];

/**
 * Viseme segments for a line from its phonemes, when the phonemizer is installed (it comes with
 * kokoro-js): spelling like "though", "knight" or "one" then gets the right mouth. Pauses at commas and
 * full stops are kept so the alignment can anchor on them. Returns null without the phonemizer.
 */
export async function phonemeSegments(text, lang = 'en-us') {
  let phonemize;
  try {
    ({ phonemize } = await import('phonemizer'));
  } catch {
    return null;
  }
  const segs = [];
  let t = 0;
  let word = 0;
  const push = (v, ms, w) => {
    const last = segs[segs.length - 1];
    if (last && last.v === v && v !== 'rest') last.end += ms;
    else segs.push({ v, start: t, end: t + ms, word: w });
    t += ms;
  };
  // Phonemise clause by clause so the punctuation pauses survive.
  const parts = String(text).split(/([,;:.!?…]+)/);
  for (const part of parts) {
    if (/^[,;:]+$/.test(part)) {
      push('rest', 220, -1);
      continue;
    }
    if (/^[.!?…]+$/.test(part)) {
      push('rest', 380, -1);
      continue;
    }
    if (!part.trim()) continue;
    let ipa;
    try {
      ipa = (await phonemize(part, lang)).join(' ');
    } catch {
      return null;
    }
    for (const w of ipa.split(/\s+/).filter(Boolean)) {
      let s = w.replace(/[ˈˌː]/g, '');
      while (s.length) {
        const rule = IPA.find(([re]) => re.test(s));
        if (!rule) {
          s = s.slice(1);
          continue;
        }
        const m = rule[0].exec(s)[0];
        push(rule[1], rule[2], word);
        s = s.slice(m.length);
      }
      word++;
    }
  }
  push('rest', 120, -1);
  return segs.length > 1 ? segs : null;
}
