// selfclone studio: sound effects, synthesised in code (no sample files, nothing to license): a soft pop
// when an item pops in, a whoosh for slides and scene pushes, pencil scratches while words are written
// or drawings drawn, a small chime for fades. Mixed quietly under the narration. All pure and seeded.
import { rng } from '../util.mjs';
import { SR } from './speech.mjs';

const SOUND_FOR_ENTER = { pop: 'pop', zoom: 'pop', grow: 'chime', 'slide-left': 'whoosh', 'slide-right': 'whoosh', 'slide-up': 'whoosh', 'slide-down': 'whoosh', write: 'scribble', draw: 'scribble', fade: 'chime' };
const SOUND_FOR_TRANSITION = { wipe: 'whoosh', push: 'whoosh', zoom: 'whoosh', iris: 'chime' };

/** The sound events for a built timeline: [{t, kind, dur}]. */
export function sfxEvents(timeline) {
  const ev = [];
  timeline.forEach((s, i) => {
    if (i > 0 && SOUND_FOR_TRANSITION[s.transition]) ev.push({ t: s.start, kind: SOUND_FOR_TRANSITION[s.transition], dur: 0.45 });
    for (const it of s.items) {
      const kind = it.sound && SOUND_FOR_ENTER[it.enter];
      if (kind) ev.push({ t: it.t, kind, dur: kind === 'scribble' ? it.enterDur : 0.4 });
      if (it.sound && it.mark !== 'none') ev.push({ t: it.markT, kind: 'scribble', dur: 0.5 });
    }
  });
  return ev.sort((a, b) => a.t - b.t);
}

function pop(out, at, rand) {
  const n = Math.round(0.11 * SR);
  let ph = 0;
  for (let i = 0; i < n && at + i < out.length; i++) {
    const t = i / SR;
    const f = 380 + 520 * Math.exp(-t * 40);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 38);
    out[at + i] += 0.32 * env * Math.sin(ph) + 0.03 * env * (rand() * 2 - 1);
  }
}

function whoosh(out, at, rand, dur) {
  const n = Math.round(dur * SR);
  let lp = 0;
  let bp = 0;
  for (let i = 0; i < n && at + i < out.length; i++) {
    const u = i / n;
    // Noise through a low-pass whose cut-off sweeps up then down, minus a slower one: a band that moves.
    const a = 0.02 + 0.25 * Math.sin(Math.PI * u);
    const x = rand() * 2 - 1;
    lp += a * (x - lp);
    bp += 0.02 * (lp - bp);
    out[at + i] += 0.5 * (lp - bp) * Math.sin(Math.PI * u) ** 2;
  }
}

function scribble(out, at, rand, dur) {
  const n = Math.round(Math.min(2.6, dur) * SR);
  let hp = 0;
  let prev = 0;
  let stroke = 0;
  let next = 0;
  for (let i = 0; i < n && at + i < out.length; i++) {
    if (i >= next) {
      // A new pencil stroke every 60 to 160 ms, of random strength.
      next = i + Math.round((0.06 + rand() * 0.1) * SR);
      stroke = 0.4 + rand() * 0.6;
    }
    const x = rand() * 2 - 1;
    hp = 0.85 * (hp + x - prev);
    prev = x;
    const u = (i % Math.round(0.11 * SR)) / Math.round(0.11 * SR);
    out[at + i] += 0.045 * stroke * Math.sin(Math.PI * u) * hp * Math.min(1, (n - i) / (0.05 * SR));
  }
}

function chime(out, at) {
  const n = Math.round(0.7 * SR);
  for (let i = 0; i < n && at + i < out.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 6);
    out[at + i] += 0.05 * env * (Math.sin(2 * Math.PI * 1046.5 * t) + 0.6 * Math.sin(2 * Math.PI * 1568 * t));
  }
}

/** Render the events into a buffer of `seconds` at 24 kHz. */
export function synthSfx(events, seconds, seed = 'sfx') {
  const rand = rng(seed);
  const out = new Float32Array(Math.ceil(seconds * SR));
  for (const e of events) {
    const at = Math.max(0, Math.round(e.t * SR));
    if (e.kind === 'pop') pop(out, at, rand);
    else if (e.kind === 'whoosh') whoosh(out, at, rand, e.dur);
    else if (e.kind === 'scribble') scribble(out, at, rand, e.dur);
    else if (e.kind === 'chime') chime(out, at);
  }
  return out;
}

/** Narration plus effects at `gain`, soft-clipped so nothing wraps. */
export function mixSfx(voice, sfx, gain = 0.7) {
  const out = new Float32Array(voice.length);
  for (let i = 0; i < voice.length; i++) {
    const v = voice[i] + gain * (sfx[i] || 0);
    out[i] = Math.abs(v) < 0.9 ? v : Math.sign(v) * (0.9 + 0.1 * Math.tanh((Math.abs(v) - 0.9) / 0.1));
  }
  return out;
}

/**
 * A quiet ambient music bed, synthesised: a slow I-V-vi-IV progression of soft detuned pads with a slow
 * swell and a simple echo. Nothing to license; the mix ducks it under the voice like any other music.
 */
export function ambientMusic(seconds, seed = 'ambient') {
  const rand = rng(`music:${seed}`);
  const n = Math.ceil(seconds * SR);
  const out = new Float32Array(n);
  const root = [196, 220, 174.6, 207.7][Math.floor(rand() * 4)];
  const ratio = (semi) => 2 ** (semi / 12);
  // Chords as semitones from the key's root: I, V, vi, IV, four seconds each.
  const chords = [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]];
  const len = 4 * SR;
  const ph = new Float64Array(16);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(i / len);
    const pos = (i % len) / len;
    const chord = chords[c % 4];
    const next = chords[(c + 1) % 4];
    // Each chord swells in and out, overlapping the next a little.
    const env = Math.sin(Math.PI * Math.min(1, pos * 1.15)) ** 1.5;
    const envN = pos > 0.87 ? Math.sin(Math.PI * ((pos - 0.87) / 1.15)) ** 1.5 : 0;
    let v = 0;
    chord.forEach((s, k) => {
      for (const d of [-0.004, 0.004]) {
        const j = k * 2 + (d > 0 ? 1 : 0);
        ph[j] += (2 * Math.PI * root * ratio(s) * (1 + d)) / SR;
        v += env * (Math.sin(ph[j]) + 0.25 * Math.sin(2 * ph[j]));
      }
    });
    if (envN) next.forEach((s, k) => { v += envN * Math.sin((2 * Math.PI * root * ratio(s) * i) / SR + k); });
    out[i] = v * 0.08;
  }
  // Echo: two taps, for some space.
  for (const [delay, g] of [[0.31, 0.35], [0.53, 0.2]]) {
    const dn = Math.round(delay * SR);
    for (let i = n - 1; i >= dn; i--) out[i] += out[i - dn] * g;
  }
  // A soft limiter keeps the peaks well inside full scale.
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * 1.2) / 1.25;
  const fade = Math.round(2 * SR);
  for (let i = 0; i < Math.min(fade, n); i++) {
    out[i] *= i / fade;
    out[n - 1 - i] *= i / fade;
  }
  return out;
}
