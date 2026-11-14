// Deterministic fidelity scorer. No language model is involved.
//
// The user's style is modelled from TRAIN turns. We draw B seeded bootstrap
// samples of n turns (n = number of sealed prompts) to learn, for every
// function word and every stylometric feature, the mean and the natural
// spread of a genuine n-reply sample from this person. A candidate reply set
// (clone, bare model, or the real sealed replies) is then z-scored against
// that model:
//
//   z_w = (f_X(w) - mu_w) / sigma_w, capped at |z| <= 5     (function words)
//   z_k = (x_X(k) - mu_k) / sigma_k, capped at |z| <= 5     (features)
//   Delta(X) = mean |z_w|            Burrows' Delta against the author centroid (reported)
//   W(X)     = sqrt(mean z_w^2)      word distance (root mean square)
//   F(X)     = sqrt(mean z_k^2)      feature distance (root mean square)
//   D(X)     = (W(X) + F(X)) / 2
//
// The root mean square keeps a few large drifts (for example "never uses
// capitals" against "always does") from being averaged away by many small ones.
// D for the bootstrap samples themselves gives the "same person" baseline m0.
// Style match % = 100 * 2^(-(max(0, D - m0) / H)^2) with H = 1.0: a set that
// sits as close as your own messages scores near 100, and it falls to 50 at
// one unit of distance above your own baseline.
// See docs/SCORING.md for the full write-up and the calibration evidence.
import { features, wordFrequencies, englishShare, words, FEATURE_LABELS } from './text.mjs';
import { FUNCTION_WORDS } from './functionwords.mjs';
import { rng, mean, std, quantile, round } from './util.mjs';
import { groupTurns } from './split.mjs';

export const HALF_SCORE_EXCESS = 1.0;
export const Z_CAP = 5;
export const BOOTSTRAP = 200;

const FLOORS = {
  msgChars: 2,
  msgWords: 0.5,
  sentenceWords: 0.5,
  wordLength: 0.05,
};
function floorFor(k) {
  if (k in FLOORS) return FLOORS[k];
  if (/Per1k$/.test(k)) return 0.25;
  return 0.01; // rates and ratios
}

export function matchPercent(d, m0, half = HALF_SCORE_EXCESS) {
  const excess = Math.max(0, d - m0);
  return 100 * 2 ** -((excess / half) ** 2);
}

/** Pick the Delta vocabulary: English function words, or the corpus MFW for other languages. */
export function chooseVocab(texts, { mfw = 100 } = {}) {
  const eng = englishShare(texts);
  if (eng >= 0.15) return { vocab: FUNCTION_WORDS, kind: 'english-function-words', englishShare: eng };
  const c = new Map();
  for (const t of texts) for (const w of words(t)) c.set(w, (c.get(w) || 0) + 1);
  const vocab = [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, mfw).map(([w]) => w);
  return { vocab, kind: 'most-frequent-words', englishShare: eng };
}

/** Build the style model (means and spreads) from reference texts. */
export function buildModel(refTexts, { n, seed = 'selfclone', B = BOOTSTRAP, vocab } = {}) {
  if (!refTexts.length) throw new Error('No training texts to build a style model from');
  const voc = vocab || chooseVocab(refTexts);
  const rand = rng(`${seed}:bootstrap`);
  const size = Math.max(1, Math.min(n, refTexts.length));
  const samples = [];
  for (let b = 0; b < B; b++) {
    let pick;
    if (refTexts.length > size) {
      // sample without replacement (partial Fisher-Yates)
      const idx = refTexts.map((_, i) => i);
      for (let i = 0; i < size; i++) {
        const j = i + Math.floor(rand() * (idx.length - i));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      pick = idx.slice(0, size).map((i) => refTexts[i]);
    } else {
      pick = Array.from({ length: size }, () => refTexts[Math.floor(rand() * refTexts.length)]);
    }
    samples.push({ f: features(pick), g: wordFrequencies(pick, voc.vocab).freq });
  }
  const featKeys = Object.keys(samples[0].f);
  const fMu = {};
  const fSd = {};
  for (const k of featKeys) {
    const xs = samples.map((s) => s.f[k]);
    fMu[k] = mean(xs);
    fSd[k] = Math.max(std(xs, fMu[k]), floorFor(k));
  }
  // Keep words the person actually uses, so absent words do not dominate.
  const gMu = {};
  const gSd = {};
  const used = [];
  for (const w of voc.vocab) {
    const xs = samples.map((s) => s.g[w]);
    const mu = mean(xs);
    if (mu <= 0) continue;
    used.push(w);
    gMu[w] = mu;
    gSd[w] = Math.max(std(xs, mu), 0.0005);
  }
  const model = { n: size, B, vocabKind: voc.kind, englishShare: voc.englishShare, vocab: used, fMu, fSd, gMu, gSd, featKeys };
  const nullD = samples.map((s) => distanceParts(model, s.f, s.g).D);
  model.m0 = mean(nullD);
  model.s0 = std(nullD, model.m0);
  model.p95 = quantile(nullD, 0.95);
  return model;
}

function distanceParts(model, f, g) {
  const fz = {};
  for (const k of model.featKeys) fz[k] = (f[k] - model.fMu[k]) / model.fSd[k];
  const capped = (xs) => xs.map((x) => Math.min(Z_CAP, Math.abs(x)));
  const rms = (xs) => Math.sqrt(mean(xs.map((x) => x * x)));
  const feature = rms(capped(model.featKeys.map((k) => fz[k])));
  const gz = {};
  for (const w of model.vocab) gz[w] = ((g[w] || 0) - model.gMu[w]) / model.gSd[w];
  const useWords = model.vocab.length >= 20;
  const wz = useWords ? capped(model.vocab.map((w) => gz[w])) : [];
  const delta = useWords ? mean(wz) : null;
  const word = useWords ? rms(wz) : null;
  const D = useWords ? (word + feature) / 2 : feature;
  return { D, delta, word, feature, fz, gz };
}

export function scoreTexts(model, texts) {
  const f = features(texts);
  const g = wordFrequencies(texts, model.vocab).freq;
  const parts = distanceParts(model, f, g);
  return { ...parts, f, g, match: matchPercent(parts.D, model.m0), n: texts.length };
}

/** Classic pairwise Burrows' Delta between two text sets using the model's z-scaling. */
export function pairwiseDelta(model, a, b) {
  if (model.vocab.length < 20) return null;
  return mean(model.vocab.map((w) => Math.min(Z_CAP, Math.abs(a.gz[w] - b.gz[w]))));
}

export function parseReplies(raw) {
  // Agents often wrap the JSON in a code fence or put a sentence before it.
  let text = String(raw).replace(/^\uFEFF/, '').trim();
  const fenced = text.match(/```(?:json|jsonl)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenced) text = fenced[1].trim();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    try {
      data = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
    } catch {
      const start = text.search(/[[{]/);
      try {
        data = JSON.parse(text.slice(start, Math.max(text.lastIndexOf(']'), text.lastIndexOf('}')) + 1));
      } catch {
        throw new Error('The replies file is not JSON. Expected [{"id": "...", "reply": "..."}] or one such object per line.');
      }
    }
  }
  if (data && !Array.isArray(data) && Array.isArray(data.replies)) data = data.replies;
  const map = new Map();
  if (Array.isArray(data)) {
    for (const r of data) {
      if (!r || r.id == null) continue;
      const v = r.reply ?? r.text ?? r.answer ?? r.response;
      if (typeof v === 'string' && v.trim()) map.set(String(r.id), v.trim());
    }
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) if (typeof v === 'string' && v.trim()) map.set(k, v.trim());
  }
  return map;
}

function referenceTexts(train) {
  const turns = groupTurns(train);
  const all = [];
  const replies = [];
  for (const recs of turns.values()) {
    const t = recs.map((r) => r.text).join('\n');
    all.push(t);
    if (recs[0].context) replies.push(t);
  }
  return { all, replies };
}

/**
 * Score clone and bare replies against the sealed real replies and the train-based style model.
 * Returns a JSON-able report object.
 */
export function score({ train, sealed, clone, bare, seed = 'selfclone' }) {
  const ids = sealed.map((s) => s.id);
  const cloneMap = clone instanceof Map ? clone : new Map(Object.entries(clone || {}));
  const bareMap = bare instanceof Map ? bare : new Map(Object.entries(bare || {}));
  const answered = ids.filter((id) => cloneMap.has(id) || bareMap.has(id));
  if (!answered.length) throw new Error('No replies match the sealed prompt ids. Did you answer .selfclone/test-prompts.json?');
  const sealedById = new Map(sealed.map((s) => [s.id, s]));
  const real = answered.map((id) => sealedById.get(id).reply);
  const { all, replies } = referenceTexts(train);
  const n = answered.length;
  const ref = replies.length >= Math.max(3 * n, 60) ? replies : all;
  const model = buildModel(ref, { n, seed });

  const sets = { real: scoreTexts(model, real) };
  const cloneIds = answered.filter((id) => cloneMap.has(id));
  const bareIds = answered.filter((id) => bareMap.has(id));
  if (cloneIds.length) sets.clone = scoreTexts(model, cloneIds.map((id) => cloneMap.get(id)));
  if (bareIds.length) sets.bare = scoreTexts(model, bareIds.map((id) => bareMap.get(id)));

  const featureTable = model.featKeys.map((k) => {
    const row = {
      feature: k,
      label: FEATURE_LABELS[k] || k,
      youMean: round(model.fMu[k], 4),
      youSpread: round(model.fSd[k], 4),
      real: round(sets.real.f[k], 4),
    };
    for (const s of ['clone', 'bare']) {
      if (!sets[s]) continue;
      row[s] = round(sets[s].f[k], 4);
      row[`${s}Z`] = round(sets[s].fz[k], 2);
    }
    row.drift = sets.clone ? Math.abs(sets.clone.fz[k]) > 2 : null;
    return row;
  });

  const wordDrift = sets.clone && model.vocab.length >= 20
    ? model.vocab
        .map((w) => ({ word: w, youPer1k: round(model.gMu[w] * 1000, 2), clonePer1k: round(sets.clone.g[w] * 1000, 2), z: round(sets.clone.gz[w], 2) }))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
        .slice(0, 12)
    : [];

  // Leakage check: verbatim copies of sealed replies are a red flag.
  const copies = cloneIds.filter((id) => {
    const r = sealedById.get(id).reply.trim().toLowerCase();
    return words(r).length >= 4 && cloneMap.get(id).trim().toLowerCase() === r;
  });

  const summarize = (s) =>
    s && {
      replies: s.n,
      styleMatch: round(s.match, 1),
      distance: round(s.D, 3),
      wordDistance: s.word == null ? null : round(s.word, 3),
      featureDistance: round(s.feature, 3),
      delta: s.delta == null ? null : round(s.delta, 3),
      deltaToReal: pairwiseDelta(model, s, sets.real) == null ? null : round(pairwiseDelta(model, s, sets.real), 3),
    };

  const meanWords = (texts) => round(mean(texts.map((t) => words(t).length)), 1);
  const result = {
    version: 1,
    method: 'function-word z-scores (Burrows Delta, single-author centroid) + stylometric feature z-scores, root-mean-square, bootstrap-calibrated',
    prompts: ids.length,
    answered: n,
    model: {
      referenceTurns: ref.length,
      referenceKind: ref === replies ? 'train replies with context' : 'all train turns',
      sampleSize: model.n,
      bootstrap: model.B,
      vocabulary: model.vocabKind,
      vocabularySize: model.vocab.length,
      englishShare: round(model.englishShare, 3),
      baselineDistance: round(model.m0, 3),
      baselineSpread: round(model.s0, 3),
      halfScoreExcess: HALF_SCORE_EXCESS,
    },
    sets: {
      real: { ...summarize(sets.real), meanWords: meanWords(real) },
      clone: sets.clone ? { ...summarize(sets.clone), meanWords: meanWords(cloneIds.map((id) => cloneMap.get(id))) } : null,
      bare: sets.bare ? { ...summarize(sets.bare), meanWords: meanWords(bareIds.map((id) => bareMap.get(id))) } : null,
    },
    features: featureTable,
    wordDrift,
    warnings: [],
  };
  if (n < 10) result.warnings.push(`Only ${n} sealed prompts were answered; scores are noisy below about 20.`);
  if (sets.real.match < 80) result.warnings.push(`Your own held-out replies score only ${Math.round(sets.real.match)}%, so this test set does not look like your training messages (too few prompts, or a different kind of chat). Read the clone and bare numbers as rough.`);
  if (model.vocab.length < 20) result.warnings.push('Too few function words in use; Delta skipped and only character-level features were scored.');
  if (model.vocabKind !== 'english-function-words') result.warnings.push('Text is mostly not English; Delta uses the most frequent words of your own corpus instead of the English function-word list.');
  if (copies.length) result.warnings.push(`${copies.length} clone replies are verbatim copies of sealed replies. The clone may have seen the sealed set; the score is not trustworthy.`);
  if (cloneIds.length && cloneIds.length < n) result.warnings.push(`Clone answered ${cloneIds.length} of ${n} prompts.`);
  if (bareIds.length && bareIds.length < n) result.warnings.push(`Bare model answered ${bareIds.length} of ${n} prompts.`);
  return result;
}

const fmtVal = (k, v) => (v == null ? '' : /Rate$|Ratio$/.test(k) ? `${round(v * 100, 1)}%` : `${round(v, 2)}`);

export function reportMarkdown(r, { name = 'you' } = {}) {
  const L = [];
  const c = r.sets.clone;
  const b = r.sets.bare;
  L.push(`# Clone Fidelity Report: ${name}`);
  L.push('');
  if (c) L.push(`**Style match ${Math.round(c.styleMatch)}%${b ? ` (bare model ${Math.round(b.styleMatch)}%)` : ''}.** Your own held-out replies score ${Math.round(r.sets.real.styleMatch)}% on the same scale.`);
  L.push('');
  L.push(`Scored ${r.answered} sealed prompts. The sealed replies were set aside before distillation and never shown to the clone. No language model graded anything; every number below comes from counting words and characters.`);
  L.push('');
  if (r.warnings.length) {
    L.push('## Warnings');
    L.push('');
    for (const w of r.warnings) L.push(`- ${w}`);
    L.push('');
  }
  L.push('## Scores');
  L.push('');
  L.push('| Reply set | Style match | Distance D | Word distance W | Feature distance F | Burrows Delta | Delta to your real replies | Mean words |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const row = (label, s) => s && L.push(`| ${label} | ${round(s.styleMatch, 1)}% | ${s.distance} | ${s.wordDistance ?? 'n/a'} | ${s.featureDistance} | ${s.delta ?? 'n/a'} | ${s.deltaToReal ?? 'n/a'} | ${s.meanWords} |`);
  row('Your real held-out replies (ceiling)', r.sets.real);
  row('Clone', c);
  row('Bare model', b);
  L.push('');
  L.push(`Baseline: random samples of ${r.model.sampleSize} of your own training replies sit at D = ${r.model.baselineDistance} (spread ${r.model.baselineSpread}). Style match is 100% at or below that baseline and halves for every ${r.model.halfScoreExcess} of extra distance. Reference: ${r.model.referenceTurns} ${r.model.referenceKind}, ${r.model.bootstrap} bootstrap samples, ${r.model.vocabularySize} ${r.model.vocabulary}.`);
  L.push('');
  L.push('## Where The Clone Drifts');
  L.push('');
  L.push('z is how many of your natural spreads the clone sits from your average. Rows marked "drift" are beyond 2.');
  L.push('');
  L.push(`| Feature | You (mean) | Your real replies | Clone | Clone z | ${b ? 'Bare | Bare z | ' : ''}Flag |`);
  L.push(`| --- | --- | --- | --- | --- | ${b ? '--- | --- | ' : ''}--- |`);
  const rows = r.features.slice().sort((x, y) => Math.abs(y.cloneZ ?? 0) - Math.abs(x.cloneZ ?? 0));
  for (const f of rows) {
    L.push(`| ${f.label} | ${fmtVal(f.feature, f.youMean)} | ${fmtVal(f.feature, f.real)} | ${fmtVal(f.feature, f.clone)} | ${f.cloneZ ?? ''} | ${b ? `${fmtVal(f.feature, f.bare)} | ${f.bareZ ?? ''} | ` : ''}${f.drift ? 'drift' : ''} |`);
  }
  L.push('');
  if (r.wordDrift.length) {
    L.push('## Function Words With The Largest Drift');
    L.push('');
    L.push('| Word | You per 1k words | Clone per 1k words | z |');
    L.push('| --- | --- | --- | --- |');
    for (const w of r.wordDrift) L.push(`| ${w.word} | ${w.youPer1k} | ${w.clonePer1k} | ${w.z} |`);
    L.push('');
  }
  L.push('## What This Measures And What It Does Not');
  L.push('');
  L.push('- It measures surface style: length, punctuation, casing, emoji, contractions, laughter, links and how often you use common function words.');
  L.push('- It does not measure whether the clone says what you would say, holds your opinions, knows your facts, or would fool someone who knows you. Use the Can You Tell game for that.');
  L.push('- A high score can be gamed by copying your habits mechanically. Read the replies too.');
  L.push('');
  return L.join('\n');
}
