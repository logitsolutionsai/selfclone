// "Does this sound like me?" Score any draft (an AI draft, a ghostwritten post,
// an email) against the user's own style, reusing the deterministic scorer in
// score.mjs, and turn the largest per-feature z-scores into plain instructions.
//
// The reference is the training split only (train.jsonl), never the sealed
// test set, so voicecheck can be run on held-out text honestly and a clone
// that runs it while answering the sealed prompts never sees the answers.
import { buildModel, scoreTexts, matchPercent } from './score.mjs';
import { features, words, emojis, sentences, normalizeQuotes, FEATURE_LABELS, LAUGH_WORD } from './text.mjs';
import { shorthand, signaturePhrases, SHORTHAND } from './fingerprint.mjs';
import { groupTurns } from './split.mjs';
import { quantile, round, mean } from './util.mjs';
import { KINDS, SOURCE_KIND, kindOf } from './kinds.mjs';

export { KINDS, SOURCE_KIND, kindOf };

// A kind needs this many reference units of its own before it is used; with fewer, the whole corpus is used.
export const MIN_KIND_UNITS = 30;

// Confidence by the number of words in the draft, calibrated with tools/voicecheck-calibration.mjs
// (see docs/SCORING.md). On the Maya example, a bare-model draft of about 15 words scored below 50%
// in only a third of the runs and one of about 31 words in 59%; from about 48 words it did every time.
export const LOW_WORDS = 40;
export const HIGH_WORDS = 80;

// A draft feature counts as drift beyond this many of the user's natural spreads.
export const DRIFT_Z = 2;

// Function-word frequencies are noise in a short text: in the calibration, F alone separated the
// same author from another better than (W + F) / 2 at every length tested (up to about 300 words).
// Below this many words the match uses F alone, against the feature-only baseline.
export const WORDS_FOR_FUNCTION_WORDS = 1000;

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * Reference units for a kind: what one "unit" of the user's writing looks like.
 * message: reply turns (a burst of messages joined by line breaks, as the scorer uses);
 * post: one record each (a post, a tweet, a paragraph of notes); email: one record each (a mail body).
 */
export function referenceUnits(train, kind) {
  const recs = kind ? train.filter((r) => kindOf(r.source) === kind) : train;
  if (kind === 'message' || !kind) {
    const turns = groupTurns(recs);
    const all = [];
    const replies = [];
    const sources = {};
    for (const t of turns.values()) {
      const text = t.map((r) => r.text).join('\n');
      all.push(text);
      if (t[0].context) replies.push(text);
    }
    for (const r of recs) sources[r.source] = (sources[r.source] || 0) + 1;
    return { all, replies, records: recs, sources };
  }
  const sources = {};
  for (const r of recs) sources[r.source] = (sources[r.source] || 0) + 1;
  const all = recs.map((r) => r.text);
  return { all, replies: recs.filter((r) => r.context).map((r) => r.text), records: recs, sources };
}

/** Split a draft into the units it is compared as. */
export function draftUnits(input, kind) {
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean);
  const text = String(input).replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  if (kind === 'post') return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // A message is one reply (its lines are the separate messages of a burst); an email is one mail.
  // Several drafts in one file can be separated by a line holding only ---.
  return text.split(/\n-{3,}\n/).map((p) => p.trim()).filter(Boolean);
}

function pickReference(train, kind) {
  const counts = {};
  for (const r of train) counts[kindOf(r.source)] = (counts[kindOf(r.source)] || 0) + 1;
  const available = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const wanted = kind || (available[0] ? available[0][0] : 'message');
  const own = referenceUnits(train, wanted);
  if (own.all.length >= MIN_KIND_UNITS) return { kind: wanted, ...own, fallback: null, counts };
  const whole = referenceUnits(train, null);
  return {
    kind: wanted,
    ...whole,
    fallback: `Your training data has ${plural(own.all.length, wanted === 'email' ? 'email' : wanted)} (fewer than ${MIN_KIND_UNITS}), so this is compared against all your writing instead.`,
    counts,
  };
}

// --- Concrete counts in the draft, for the instructions -------------------

function lines(units) {
  return units.flatMap((u) => u.split('\n')).map((l) => l.trim()).filter((l) => /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(l));
}

function startsCapital(s) {
  const m = s.replace(/https?:\/\/\S+/g, ' ').match(/\p{L}/u);
  return !!m && m[0] !== m[0].toLowerCase();
}

function countChar(units, re) {
  let n = 0;
  for (const u of units) {
    const t = normalizeQuotes(u).replace(/https?:\/\/\S+/g, ' ');
    n += (t.match(re) || []).length;
  }
  return n;
}

const CHAR_RE = {
  periodPer1k: { re: /(?<!\.)\.(?!\.)/g, one: 'full stop' },
  commaPer1k: { re: /,/g, one: 'comma' },
  exclamationPer1k: { re: /!/g, one: 'exclamation mark' },
  questionPer1k: { re: /\?/g, one: 'question mark' },
  ellipsisPer1k: { re: /\.{3,}|…/g, one: 'ellipsis', many: 'ellipses' },
  dashPer1k: { re: /—|–|\s-\s|--/g, one: 'dash', many: 'dashes' },
  semicolonPer1k: { re: /;/g, one: 'semicolon' },
  colonPer1k: { re: /:(?!\/\/)/g, one: 'colon' },
  digitPer1k: { re: /\p{N}/gu, one: 'digit' },
};

// Features that say the same thing; only the strongest of each group is reported.
const GROUPS = [
  ['msgWords', 'msgChars'],
  ['lowercaseStartRate', 'uppercaseRatio'],
  ['emojiMsgRate', 'emojiPer1k'],
  ['questionMsgRate', 'questionPer1k'],
  ['exclamationMsgRate', 'exclamationPer1k'],
];

function unitWord(kind) {
  return kind === 'email' ? 'email' : kind === 'post' ? 'post' : 'reply';
}
const units_ = (u) => (u === 'reply' ? 'replies' : u + 's');

/** Turn one drifting feature into a plain, fixable instruction. */
function instruction(k, z, ctx) {
  const { you, draft, units, kind, refUnits, fp } = ctx;
  const u = unitWord(kind);
  const more = z > 0; // the draft has more of it than the user
  const ls = lines(units);
  const nUnits = units.length;
  const thisDraft = nUnits > 1 ? 'these drafts' : 'this draft';
  const v = (one, many) => (nUnits > 1 ? many : one);
  const has = v('this has', 'these have');
  const uses = v('this uses', 'these use');
  const msgs = kind === 'message' ? 'messages' : units_(u);
  const perUnit = (per1k) => (per1k * you.msgChars) / 1000;

  switch (k) {
    case 'msgWords':
    case 'msgChars': {
      const med = round(quantile(refUnits.map((t) => words(t).length), 0.5), 0);
      const p90 = round(quantile(refUnits.map((t) => words(t).length), 0.9), 0);
      const dw = round(mean(units.map((t) => words(t).length)), 0);
      return more
        ? `Your typical ${u} is ${med} words (9 in 10 are ${p90} or fewer); ${thisDraft} ${nUnits > 1 ? 'average' : 'is'} ${dw}. Cut it down.`
        : `Your typical ${u} is ${med} words; ${thisDraft} ${nUnits > 1 ? 'average' : 'is'} ${dw}. Say a little more.`;
    }
    case 'sentenceWords': {
      const ss = units.flatMap((t) => sentences(t));
      const avg = round(mean(ss.map((s) => words(s).length)), 0);
      return more
        ? `Your sentences average ${round(you.sentenceWords, 0)} words; these average ${avg}. Split the long ones.`
        : `Your sentences average ${round(you.sentenceWords, 0)} words; these average ${avg}. Join some of the short ones.`;
    }
    case 'wordLength':
      return more
        ? `You use short, plain words (${round(you.wordLength, 1)} letters on average); ${v('this averages', 'these average')} ${round(draft.wordLength, 1)}. Swap the long words for everyday ones.`
        : `Your words average ${round(you.wordLength, 1)} letters; ${v('this averages', 'these average')} ${round(draft.wordLength, 1)}.`;
    case 'lowercaseStartRate':
    case 'uppercaseRatio': {
      const caps = ls.filter(startsCapital).length;
      const tooUpper = k === 'lowercaseStartRate' ? !more : more;
      if (tooUpper) {
        if (you.lowercaseStartRate >= 0.5 && caps) return `You start ${pct(you.lowercaseStartRate)} of ${msgs} lowercase; ${thisDraft} ${v('starts', 'start')} ${caps} of ${plural(ls.length, 'line')} with a capital. Start in lowercase.`;
        return `You rarely use capital letters (${pct(you.uppercaseRatio)} of letters); ${has} ${pct(draft.uppercaseRatio)}.`;
      }
      return `You start ${pct(1 - you.lowercaseStartRate)} of ${msgs} with a capital; ${thisDraft} ${v('starts', 'start')} ${ls.length - caps} of ${plural(ls.length, 'line')} in lowercase. Capitalise the first word.`;
    }
    case 'allCapsWordRate':
      return more
        ? `You rarely write words in ALL CAPS (${pct(you.allCapsWordRate)} of words); ${has} ${pct(draft.allCapsWordRate)}. Use normal case.`
        : `You sometimes write a word in ALL CAPS for emphasis (${pct(you.allCapsWordRate)} of words); ${has} none.`;
    case 'apostropheDropRate': {
      const withApos = units.flatMap((t) => normalizeQuotes(t).match(/\b[\p{L}]+'(?:t|s|re|ll|ve|d|m)\b/giu) || []);
      if (!more) {
        const shown = [...new Set(withApos.map((w) => w.toLowerCase()))].slice(0, 4);
        return `You write contractions without the apostrophe (${pct(you.apostropheDropRate)}: dont, im, thats); ${v('this writes', 'these write')} ${plural(withApos.length, 'contraction')} with one${shown.length ? ` (${shown.join(', ')})` : ''}. Drop the apostrophes.`;
      }
      return `You keep the apostrophe in contractions (${pct(1 - you.apostropheDropRate)} of them); ${v('this drops it', 'these drop it')}. Write don't, I'm.`;
    }
    case 'contractionRate':
      return more
        ? `You use few contractions (${pct(you.contractionRate)} of words); ${uses} ${pct(draft.contractionRate)}. Write some of them out.`
        : `You use contractions (${pct(you.contractionRate)} of words, ${fp.apostropheDrop ? 'dont, im, thats' : "don't, I'm, that's"}); ${uses} ${draft.contractionRate ? pct(draft.contractionRate) : 'none'}, so it reads stiffer than you.`;
    case 'endPunctRate': {
      const ended = ls.filter((l) => /[.!?…)]$/.test(l.replace(/\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}️]*/gu, '').trim())).length;
      return more
        ? `Only ${pct(you.endPunctRate)} of your ${msgs} end in punctuation; ${thisDraft} ${v('ends', 'end')} ${ended} of ${plural(ls.length, 'line')} with one. Drop the final full stops.`
        : `${pct(you.endPunctRate)} of your ${msgs} end in punctuation; ${thisDraft} ${v('ends', 'end')} ${ended} of ${plural(ls.length, 'line')} with one.`;
    }
    case 'multiLineRate':
      if (kind === 'message') {
        return more
          ? nUnits > 1
            ? `You send ${pct(1 - you.multiLineRate)} of replies as a single message; ${pct(draft.multiLineRate)} of these drafts are split into several lines. Send more of them as one message.`
            : `You send ${pct(1 - you.multiLineRate)} of replies as a single message; this draft splits into ${plural(ls.length, 'line')}. Put it in one message.`
          : nUnits > 1
            ? `You split ${pct(you.multiLineRate)} of replies into several short messages; ${draft.multiLineRate ? `only ${pct(draft.multiLineRate)} of these drafts are` : 'none of these drafts is'}. Break replies into short lines, one per message.`
            : `You split ${pct(you.multiLineRate)} of replies into several short messages; this draft is one block. Break it into short lines, one per message.`;
      }
      return more
        ? `You rarely break a ${u} over several lines (${pct(you.multiLineRate)}); ${has} ${plural(ls.length, 'line')}.`
        : `You break ${pct(you.multiLineRate)} of ${units_(u)} over several lines; ${v('this is one block', 'these are one block each')}.`;
    case 'laughMsgRate': {
      const top = (fp.laughs || []).slice(0, 2).map((w) => `"${w}"`).join(' or ') || '"lol" or "haha"';
      return more
        ? `You laugh (${top}) in ${pct(you.laughMsgRate)} of ${units_(u)}; ${thisDraft} ${v('laughs', 'laugh')} in ${pct(draft.laughMsgRate)}. Use it less.`
        : `You laugh (${top}) in ${pct(you.laughMsgRate)} of ${units_(u)}; ${has} none. Fine to leave out unless something is actually funny.`;
    }
    case 'emojiMsgRate':
    case 'emojiPer1k': {
      const n = units.reduce((a, t) => a + emojis(t).length, 0);
      const top = (fp.topEmoji || []).slice(0, 3).join(' ');
      return more
        ? `You use emoji in ${pct(you.emojiMsgRate)} of ${units_(u)}${top ? ` (most often ${top})` : ''}; ${has} ${n}. Keep one at most.`
        : `You use emoji in ${pct(you.emojiMsgRate)} of ${units_(u)}${top ? ` (most often ${top})` : ''}; ${has} none. One, where it fits, is enough.`;
    }
    case 'questionMsgRate':
    case 'questionPer1k': {
      const n = countChar(units, /\?/g);
      return more
        ? `You ask a question in ${pct(you.questionMsgRate)} of ${units_(u)}; ${has} ${plural(n, 'question mark')}.`
        : `You ask a question in ${pct(you.questionMsgRate)} of ${units_(u)}; this asks none.`;
    }
    case 'exclamationMsgRate':
    case 'exclamationPer1k': {
      const n = countChar(units, /!/g);
      return more
        ? `You use an exclamation mark in ${pct(you.exclamationMsgRate)} of ${units_(u)}; ${has} ${n}. Cut them to one at most.`
        : `You use an exclamation mark in ${pct(you.exclamationMsgRate)} of ${units_(u)}; ${has} none.`;
    }
    case 'linkMsgRate':
      return more ? `You rarely include links (${pct(you.linkMsgRate)} of ${units_(u)}); ${has} one.` : `You often include a link (${pct(you.linkMsgRate)} of ${units_(u)}); ${has} none.`;
    default: {
      const c = CHAR_RE[k];
      if (!c) return `${FEATURE_LABELS[k] || k}: you ${round(you[k], 2)}, this draft ${round(draft[k], 2)}.`;
      const n = countChar(units, c.re);
      const many = c.many || c.one + 's';
      const yourPer = perUnit(you[k]);
      if (you[k] < 0.05) return `You use no ${many}; ${has} ${n}. Take ${n === 1 ? 'it' : 'them'} out.`;
      const usual = yourPer >= 0.95 ? `about ${round(yourPer, 0)} per ${u}` : `about one every ${Math.max(2, Math.round(1 / yourPer))} ${units_(u)}`;
      return more
        ? `You use ${many} sparingly (${usual}); ${has} ${plural(n, c.one, c.many)}. Use fewer.`
        : `You use the occasional ${c.one} (${usual}); ${has} ${n ? `only ${n}` : 'none'}.`;
    }
  }
}

function phraseAdvice(units, ref, kind) {
  const text = units.join('\n');
  const ws = new Set(words(text));
  const lower = ' ' + words(text).join(' ') + ' ';
  const recs = ref.records;
  const total = recs.length || 1;
  // The user's own shorthand and recurring phrases, with the share of units that use them.
  const sh = shorthand(recs, { max: 8 }).filter((w) => w.messages / total >= 0.03);
  const sig = signaturePhrases(recs, { max: 8 }).filter((p) => p.messages / total >= 0.02);
  const theirs = [...sh.map((w) => w.word), ...sig.map((p) => p.phrase)];
  const used = theirs.filter((p) => lower.includes(' ' + p + ' '));
  const out = [];
  const draftWords = words(text).length;
  if (theirs.length && !used.length && draftWords >= 8) {
    const top = theirs.slice(0, 3).map((p) => `"${p}"`).join(', ');
    out.push({
      feature: 'phrases',
      instruction: `You often write ${top}; this uses none. One, where it fits naturally, is enough. Do not force them in.`,
      z: null,
    });
  }
  // Shorthand in the draft that the user never writes.
  const userWords = new Set(recs.flatMap((r) => words(r.text)));
  const foreign = [...ws].filter((w) => (SHORTHAND.has(w) || LAUGH_WORD.test(w)) && !userWords.has(w) && w.length > 1);
  if (foreign.length) {
    out.push({
      feature: 'foreign-shorthand',
      instruction: `Your ${kind === 'email' ? 'emails' : kind === 'post' ? 'posts' : 'messages'} never use ${foreign.slice(0, 3).map((w) => `"${w}"`).join(', ')}; this does. Use your own words unless it really is one of yours.`,
      z: null,
    });
  }
  // A crammed draft: many of the user's habits in one short text reads like a caricature.
  if (used.length >= 3 && draftWords < 40) {
    out.push({ feature: 'caricature', instruction: `This uses ${used.length} of your pet phrases (${used.slice(0, 4).map((p) => `"${p}"`).join(', ')}) in ${draftWords} words. You do not write that densely; keep one.`, z: null });
  }
  return { out, used, theirs };
}

// Building a model draws 200 bootstrap samples; cache it per training set, reference and draft size.
const MODEL_CACHE = new WeakMap();
function cachedModel(train, key, make) {
  if (!MODEL_CACHE.has(train)) MODEL_CACHE.set(train, new Map());
  const m = MODEL_CACHE.get(train);
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

/**
 * Score a draft against the user's training messages.
 * @param {object} o
 * @param {object[]} o.train  records from train.jsonl
 * @param {string|string[]} o.draft  draft text, or an array of drafts
 * @param {'message'|'post'|'email'} [o.kind]
 */
export function voicecheck({ train, draft, kind, seed = 'selfclone', top = 6, wordPart = 'auto' }) {
  if (kind && !KINDS.includes(kind)) throw new Error(`--as must be one of ${KINDS.join(', ')}, not "${kind}".`);
  if (!train.length) throw new Error('No training messages. Run selfclone ingest first.');
  const ref = pickReference(train, kind);
  const useKind = ref.fallback ? null : ref.kind;
  const units = draftUnits(draft, kind || ref.kind);
  if (!units.length) throw new Error('The draft is empty.');
  const n = units.length;
  const refTexts = ref.replies.length >= Math.max(3 * n, 60) ? ref.replies : ref.all;
  const model = cachedModel(train, `${kind || ref.kind}|${refTexts.length}|${n}|${seed}`, () => buildModel(refTexts, { n, seed }));
  const s = scoreTexts(model, units);
  const draftWords = units.reduce((a, t) => a + words(t).length, 0);
  const useWords = s.word != null && (wordPart === 'auto' ? draftWords >= WORDS_FOR_FUNCTION_WORDS : !!wordPart);
  const distance = useWords ? s.D : s.feature;
  const baseline = useWords ? model.m0 : model.m0Feature;
  const confidence = draftWords < LOW_WORDS ? 'low' : draftWords < HIGH_WORDS ? 'medium' : 'high';
  const confidenceNote =
    confidence === 'low'
      ? `Low confidence: ${plural(draftWords, 'word')}. A text this short cannot be scored reliably (${LOW_WORDS} words or more give a usable number, ${HIGH_WORDS} or more a steady one). Read the drift list as hints.`
      : confidence === 'medium'
        ? `Medium confidence: ${plural(draftWords, 'word')}. The number moves a few points with small edits; ${HIGH_WORDS} words or more give a steadier one.`
        : `High confidence: ${plural(draftWords, 'word')}.`;

  const you = model.fMu;
  const fp = {
    apostropheDrop: you.apostropheDropRate >= 0.5,
    laughs: shorthand(ref.records, { max: 15 }).filter((w) => LAUGH_WORD.test(w.word)).map((w) => w.word),
    topEmoji: (() => {
      const c = new Map();
      for (const r of ref.records) for (const e of emojis(r.text)) c.set(e, (c.get(e) || 0) + 1);
      return [...c].sort((a, b) => b[1] - a[1]).map(([e]) => e);
    })(),
  };
  const ctx = { you, draft: s.f, units, kind: ref.kind, refUnits: refTexts, fp };
  const skip = new Set();
  const ranked = model.featKeys
    .map((k) => ({ k, z: s.fz[k] }))
    .filter((x) => Number.isFinite(x.z) && Math.abs(x.z) >= DRIFT_Z)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const drifts = [];
  for (const { k, z } of ranked) {
    if (skip.has(k)) continue;
    for (const g of GROUPS) if (g.includes(k)) for (const x of g) skip.add(x);
    if (k === 'linkMsgRate' || k === 'digitPer1k') continue; // rarely a voice problem
    drifts.push({
      feature: k,
      label: FEATURE_LABELS[k] || k,
      z: round(Math.max(-5, Math.min(5, z)), 2),
      you: round(you[k], 4),
      draft: round(s.f[k], 4),
      instruction: instruction(k, z, ctx),
    });
  }
  // A habit the user keeps almost without exception (pooled over all their writing, so it does not
  // depend on the draft size): dropping or keeping the apostrophe in contractions.
  if (!drifts.some((d) => d.feature === 'apostropheDropRate')) {
    const pooled = features(ref.records.map((r) => r.text));
    const withApos = units.flatMap((t) => normalizeQuotes(t).match(/\b[\p{L}]+'(?:t|s|re|ll|ve|d|m)\b/giu) || []);
    if (pooled.contractionRate >= 0.005 && pooled.apostropheDropRate >= 0.9 && withApos.length) {
      const shown = [...new Set(withApos.map((w) => w.toLowerCase()))].slice(0, 4);
      drifts.splice(Math.min(2, drifts.length), 0, {
        feature: 'apostropheDropRate',
        label: FEATURE_LABELS.apostropheDropRate,
        z: null,
        you: round(pooled.apostropheDropRate, 4),
        draft: round(s.f.apostropheDropRate, 4),
        instruction: `You write contractions without the apostrophe (${pct(pooled.apostropheDropRate)}: dont, im, thats); ${units.length > 1 ? 'these write' : 'this writes'} ${plural(withApos.length, 'contraction')} with one (${shown.join(', ')}). Drop the apostrophes.`,
      });
    }
  }
  const phrases = phraseAdvice(units, ref, ref.kind);
  const advice = [...drifts.slice(0, top), ...phrases.out].slice(0, top + 2);
  const match = round(matchPercent(distance, baseline), 1);
  const verdict =
    confidence === 'low'
      ? 'Too short to judge reliably.'
      : match >= 80
        ? 'Sounds like you.'
        : match >= 50
          ? 'Close, with some drift.'
          : 'Does not sound like you yet.';
  const sources = Object.entries(ref.sources).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  return {
    version: 1,
    kind: kind || ref.kind,
    reference: {
      kind: useKind || 'all',
      units: refTexts.length,
      unitKind: refTexts === ref.replies ? 'replies with context' : useKind === 'message' || !useKind ? 'turns' : 'records',
      messages: ref.records.length,
      sources,
      fallback: ref.fallback,
      kinds: ref.counts,
    },
    draft: { units: n, words: draftWords },
    voiceMatch: match,
    verdict,
    confidence,
    confidenceNote,
    distance: round(distance, 3),
    baseline: round(baseline, 3),
    distanceKind: useWords ? 'words and features (W + F) / 2' : 'features only (F)',
    wordDistance: s.word == null ? null : round(s.word, 3),
    featureDistance: round(s.feature, 3),
    drifts,
    advice,
    phrasesUsed: phrases.used,
  };
}

export function voicecheckText(r, { name } = {}) {
  const L = [];
  L.push(`Voice match ${Math.round(r.voiceMatch)}%${name ? ` against ${name}` : ''}: ${r.verdict}`);
  L.push(`  ${r.confidenceNote}`);
  const what = r.reference.kind === 'all' ? 'all your writing' : `your ${r.reference.kind === 'message' ? 'messages' : r.reference.kind === 'post' ? 'posts and notes' : 'emails'}`;
  L.push(`  Compared as ${r.draft.units > 1 ? `${r.draft.units} ${r.kind}s` : `one ${r.kind}`} against ${what} (${r.reference.units} ${r.reference.unitKind}; ${r.reference.sources}).`);
  if (r.reference.fallback) L.push(`  ${r.reference.fallback}`);
  L.push('');
  if (r.advice.length) {
    L.push('To sound more like you:');
    for (const a of r.advice) L.push(`  - ${a.instruction}`);
  } else {
    L.push('No feature drifts beyond your usual range.');
  }
  L.push('');
  L.push('Surface style only (length, punctuation, casing, emoji, contractions, function words). It does not check facts or opinions. Do not chase 100% by cramming in habits; read the text too.');
  return L.join('\n');
}
