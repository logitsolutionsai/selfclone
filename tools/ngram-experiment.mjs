// Experiment, not part of the score: would a character n-gram component help the Style match?
// Adds C = |z| of the cosine distance between a reply set's profile of the 100 most frequent
// character 3- and 4-grams and your own profile (z against 200 bootstrap samples of your training
// replies, capped at 5), and scores D' = (W + F + C) / 3 next to today's D = (W + F) / 2.
// Prints the synthetic authors (as tools/calibration.mjs) and the Maya example, before and after.
// Run: node tools/ngram-experiment.mjs   Results and the decision are in docs/SCORING.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, scoreTexts, matchPercent } from '../src/score.mjs';
import { synthTexts } from '../tests/unit/synth.mjs';
import { rng, mean, std } from '../src/util.mjs';
import { groupTurns } from '../src/split.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOPK = 100;
const B = 200;

function grams(text) {
  const t = ' ' + String(text).replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const out = [];
  for (const n of [3, 4]) for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n));
  return out;
}

function profile(texts, vocab) {
  const c = new Map(vocab.map((g) => [g, 0]));
  let total = 0;
  for (const t of texts) {
    for (const g of grams(t)) {
      total++;
      if (c.has(g)) c.set(g, c.get(g) + 1);
    }
  }
  return vocab.map((g) => (total ? c.get(g) / total : 0));
}

function cosineDistance(a, b) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? 1 - ab / Math.sqrt(aa * bb) : 1;
}

/** The same seeded bootstrap draws as buildModel, so both components see the same samples. */
function bootstrap(refTexts, n, seed) {
  const rand = rng(`${seed}:bootstrap`);
  const size = Math.max(1, Math.min(n, refTexts.length));
  const out = [];
  for (let b = 0; b < B; b++) {
    const idx = refTexts.map((_, i) => i);
    for (let i = 0; i < size; i++) {
      const j = i + Math.floor(rand() * (idx.length - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    out.push(idx.slice(0, size).map((i) => refTexts[i]));
  }
  return out;
}

function evaluate(refTexts, n, seed, sets, halves) {
  const model = buildModel(refTexts, { n, seed });
  const counts = new Map();
  for (const t of refTexts) for (const g of grams(t)) counts.set(g, (counts.get(g) || 0) + 1);
  const vocab = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOPK).map((x) => x[0]);
  const draws = bootstrap(refTexts, n, seed);
  const profiles = draws.map((d) => profile(d, vocab));
  const centroid = vocab.map((_, k) => mean(profiles.map((p) => p[k])));
  const dists = profiles.map((p) => cosineDistance(p, centroid));
  const mu = mean(dists);
  const sd = std(dists, mu) || 1e-9;
  const C = (p) => Math.min(5, Math.abs((cosineDistance(p, centroid) - mu) / sd));
  const D2 = (s, c) => (s.word == null ? (s.feature + c) / 2 : (s.word + s.feature + c) / 3);
  const m0n = mean(draws.map((d, b) => D2(scoreTexts(model, d), C(profiles[b]))));
  const out = {};
  for (const [k, texts] of Object.entries(sets)) {
    const s = scoreTexts(model, texts);
    const c = C(profile(texts, vocab));
    out[k] = { before: s.match, W: s.word, F: s.feature, C: c, after: halves.map((h) => matchPercent(D2(s, c), m0n, h)) };
  }
  return out;
}

const HALVES = [1.0, 1.5];
const pct = (x) => `${x.toFixed(1)}%`;
const cell = (o) => `${pct(o.before)} / ${o.after.map(pct).join(' / ')} (C ${o.C.toFixed(2)})`;

console.log(`Style match: today / with C at H = ${HALVES.join(' / with C at H = ')}\n`);
console.log('| Synthetic authors, n | Same author | Near miss | Different author |');
console.log('| --- | --- | --- | --- |');
const trainA = synthTexts('casual', 400, 'trainA');
for (const n of [10, 20, 30, 60]) {
  const r = evaluate(trainA, n, 's', {
    same: synthTexts('casual', n, 'heldA' + n),
    near: synthTexts('casual', n, 'p' + n).map((t) => t[0].toUpperCase() + t.slice(1) + '.'),
    other: synthTexts('formal', n, 'heldB' + n),
  }, HALVES);
  console.log(`| ${n} | ${cell(r.same)} | ${cell(r.near)} | ${cell(r.other)} |`);
}

const W = path.join(ROOT, 'examples', 'maya', 'workspace');
const readJsonl = (f) => fs.readFileSync(path.join(W, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const train = readJsonl('train.jsonl');
const sealed = readJsonl('sealed.jsonl');
const replies = (f) => new Map(JSON.parse(fs.readFileSync(path.join(W, f), 'utf8')).map((r) => [r.id, r.reply]));
const clone = replies('clone-replies.json');
const bare = replies('bare-replies.json');
const ids = sealed.map((s) => s.id).filter((id) => clone.has(id) || bare.has(id));
const all = [];
const turnsWithContext = [];
for (const recs of groupTurns(train).values()) {
  const t = recs.map((r) => r.text).join('\n');
  all.push(t);
  if (recs[0].context) turnsWithContext.push(t);
}
const ref = turnsWithContext.length >= Math.max(3 * ids.length, 60) ? turnsWithContext : all;
const byId = new Map(sealed.map((s) => [s.id, s.reply]));
const m = evaluate(ref, ids.length, 'selfclone', {
  real: ids.map((id) => byId.get(id)),
  clone: ids.filter((id) => clone.has(id)).map((id) => clone.get(id)),
  bare: ids.filter((id) => bare.has(id)).map((id) => bare.get(id)),
}, HALVES);
console.log('\n| Maya example (20 sealed prompts) | Own held-out replies | Clone | Bare model |');
console.log('| --- | --- | --- | --- |');
console.log(`| Style match | ${cell(m.real)} | ${cell(m.clone)} | ${cell(m.bare)} |`);
console.log(`| Word distance W | ${m.real.W.toFixed(2)} | ${m.clone.W.toFixed(2)} | ${m.bare.W.toFixed(2)} |`);
console.log(`| Feature distance F | ${m.real.F.toFixed(2)} | ${m.clone.F.toFixed(2)} | ${m.bare.F.toFixed(2)} |`);
console.log(`| Character n-gram C | ${m.real.C.toFixed(2)} | ${m.clone.C.toFixed(2)} | ${m.bare.C.toFixed(2)} |`);
