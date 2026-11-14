// Voice Drift: how the owner's own writing changed between two non-overlapping date windows of the
// training split. Surface features only; no model grades anything and nothing is inferred about beliefs,
// personality, health or identity. Confidence intervals come from a percentile bootstrap that resamples
// whole conversations (one thread on one day), never sentences, with a fixed seed and 1,000 rounds,
// computed from per-conversation aggregates so the cost stays linear in the number of conversations.
import { features, words, emojis } from '../text.mjs';
import { rng, quantile, round } from '../util.mjs';
import { channelOf, conversationKey, CHANNELS } from '../profile/channels.mjs';
import { requireConsent } from '../consent.mjs';
import { invalid } from '../errors.mjs';

export const ROUNDS = 1000;
export const MIN_MESSAGES = 100;
export const MIN_CONVERSATIONS = 20;
export const MIN_SPAN_DAYS = 28;

// Features tested, with the smallest change that counts as practical.
export const DRIFT_FEATURES = [
  { id: 'medianWords', label: 'Median words per message', threshold: 5 },
  { id: 'lowercaseStartRate', label: 'Messages starting lowercase', threshold: 0.1 },
  { id: 'endPunctRate', label: 'Messages ending in punctuation', threshold: 0.1 },
  { id: 'questionMsgRate', label: 'Messages with a question mark', threshold: 0.1 },
  { id: 'exclamationMsgRate', label: 'Messages with an exclamation mark', threshold: 0.1 },
  { id: 'emojiMsgRate', label: 'Messages with emoji', threshold: 0.1 },
  { id: 'commaPer1k', label: 'Commas per 1,000 characters', threshold: 2 },
  { id: 'periodPer1k', label: 'Full stops per 1,000 characters', threshold: 2 },
  { id: 'semicolonPer1k', label: 'Semicolons per 1,000 characters', threshold: 2 },
  { id: 'dashPer1k', label: 'Dashes per 1,000 characters', threshold: 2 },
  { id: 'exclamationPer1k', label: 'Exclamation marks per 1,000 characters', threshold: 2 },
  { id: 'questionPer1k', label: 'Question marks per 1,000 characters', threshold: 2 },
];
const PER1K = ['comma', 'period', 'semicolon', 'dash', 'exclamation', 'question'];

const DAY = 86400e3;

export function parseWindow(s, flag) {
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(String(s || ''));
  if (!m) throw invalid('E_ARGS', `${flag} must look like 2026-01-01..2026-04-30, not "${s ?? ''}".`, 'Give two dates, inclusive, joined by two dots.');
  const from = Date.parse(`${m[1]}T00:00:00Z`);
  const to = Date.parse(`${m[2]}T00:00:00Z`) + DAY - 1;
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw invalid('E_ARGS', `${flag} has a date that does not exist.`, 'Check the dates.');
  if (from > to) throw invalid('E_ARGS', `${flag} ends before it starts.`, 'Put the earlier date first.');
  return { from, to, text: `${m[1]}..${m[2]}` };
}

/** Per-message measures, from the same extractor the fingerprint and the profile use. */
function measure(text) {
  const f = features([text]);
  const chars = f.msgChars;
  const noUrl = String(text).replace(/\bhttps?:\/\/\S+|\bwww\.[^\s]+/gi, ' ');
  const first = noUrl.match(/\p{L}/u);
  const cased = !!first && first[0].toLowerCase() !== first[0].toUpperCase();
  const m = {
    words: words(text).length,
    chars,
    casedStart: cased ? 1 : 0,
    lowerStart: cased && first[0] === first[0].toLowerCase() ? 1 : 0,
    endPunct: f.endPunctRate,
    question: f.questionMsgRate,
    exclamationMsg: f.exclamationMsgRate,
    emoji: emojis(text).length ? 1 : 0,
  };
  for (const k of PER1K) m[`c_${k}`] = Math.round((f[`${k}Per1k`] * chars) / 1000);
  return m;
}

const FIELDS = ['n', 'chars', 'casedStart', 'lowerStart', 'endPunct', 'question', 'exclamationMsg', 'emoji', ...PER1K.map((k) => `c_${k}`)];
const FI = Object.fromEntries(FIELDS.map((k, i) => [k, i]));

/** Pack per-conversation sums into typed arrays, so a bootstrap round is a tight loop over indices. */
function pack(convs) {
  const F = FIELDS.length;
  const data = new Float64Array(convs.length * F);
  const hOff = new Int32Array(convs.length + 1);
  const hw = [];
  const hc = [];
  convs.forEach((msgs, ci) => {
    const hist = new Map();
    for (const m of msgs) {
      data[ci * F + FI.n] += 1;
      for (let k = 1; k < F; k++) data[ci * F + k] += m[FIELDS[k]];
      hist.set(m.words, (hist.get(m.words) || 0) + 1);
    }
    for (const [w, c] of [...hist].sort((a, b) => a[0] - b[0])) {
      hw.push(w);
      hc.push(c);
    }
    hOff[ci + 1] = hw.length;
  });
  return { count: convs.length, F, data, hOff, hw: Int32Array.from(hw), hc: Float64Array.from(hc), maxWord: hw.length ? Math.max(...hw) : 0 };
}

/** Feature values from conversations picked by index (with repeats, for the bootstrap). */
function valuesOf(p, idx, scratch, t) {
  const F = p.F;
  t.fill(0);
  scratch.fill(0);
  for (let j = 0; j < idx.length; j++) {
    const ci = idx[j];
    const base = ci * F;
    for (let k = 0; k < F; k++) t[k] += p.data[base + k];
    for (let h = p.hOff[ci]; h < p.hOff[ci + 1]; h++) scratch[p.hw[h]] += p.hc[h];
  }
  const n = t[FI.n];
  // Median as util.quantile computes it (linear between the two middle values), from the histogram.
  const pos = (n - 1) * 0.5;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  let seen = 0;
  let vlo = null;
  let vhi = null;
  for (let w = 0; w < scratch.length && vhi == null; w++) {
    seen += scratch[w];
    if (vlo == null && seen > lo) vlo = w;
    if (seen > hi) vhi = w;
  }
  const chars = t[FI.chars];
  const per1k = (x) => (chars ? (x * 1000) / chars : 0);
  return {
    medianWords: vlo + (vhi - vlo) * (pos - lo),
    lowercaseStartRate: t[FI.casedStart] ? t[FI.lowerStart] / t[FI.casedStart] : 0,
    endPunctRate: t[FI.endPunct] / n,
    questionMsgRate: t[FI.question] / n,
    exclamationMsgRate: t[FI.exclamationMsg] / n,
    emojiMsgRate: t[FI.emoji] / n,
    commaPer1k: per1k(t[FI.c_comma]),
    periodPer1k: per1k(t[FI.c_period]),
    semicolonPer1k: per1k(t[FI.c_semicolon]),
    dashPer1k: per1k(t[FI.c_dash]),
    exclamationPer1k: per1k(t[FI.c_exclamation]),
    questionPer1k: per1k(t[FI.c_question]),
  };
}

function windowData(train, w, channel) {
  const recs = train.filter((r) => {
    const ms = r.ts ? Date.parse(r.ts) : NaN;
    return Number.isFinite(ms) && ms >= w.from && ms <= w.to && (!channel || channelOf(r) === channel);
  });
  const byConv = new Map();
  for (const r of recs) {
    const k = conversationKey(r);
    if (!byConv.has(k)) byConv.set(k, []);
    byConv.get(k).push(measure(r.text));
  }
  const keys = [...byConv.keys()].sort();
  const packed = pack(keys.map((k) => byConv.get(k)));
  const times = recs.map((r) => Date.parse(r.ts)).sort((a, b) => a - b);
  const spanDays = times.length ? (times[times.length - 1] - times[0]) / DAY : 0;
  return { messages: recs.length, conversations: keys.length, spanDays: round(spanDays, 1), packed };
}

/**
 * Compare two windows of the training split.
 * @returns the drift report; status insufficient_data (with no numbers) when a window is too small.
 */
export function drift(train, { before, after, channel = null, seed = 'selfclone', rounds = ROUNDS }) {
  if (channel && !CHANNELS.includes(channel)) throw invalid('E_ARGS', `--channel must be one of ${CHANNELS.join(', ')}, not "${channel}".`, 'Pick a channel, or leave it out for all writing.');
  if (before.from <= after.to && after.from <= before.to) throw invalid('E_DRIFT_OVERLAP', `The windows ${before.text} and ${after.text} overlap.`, 'Use two windows that share no day, so no message counts twice.');
  const b = windowData(train, before, channel);
  const a = windowData(train, after, channel);
  const base = {
    schemaVersion: 1,
    kind: 'selfclone-drift',
    channel: channel || 'all',
    seed,
    rounds,
    resampleUnit: 'conversation (one thread on one UTC day)',
    requirements: { minMessages: MIN_MESSAGES, minConversations: MIN_CONVERSATIONS, minSpanDays: MIN_SPAN_DAYS },
    windows: {
      before: { range: before.text, messages: b.messages, conversations: b.conversations, spanDays: b.spanDays },
      after: { range: after.text, messages: a.messages, conversations: a.conversations, spanDays: a.spanDays },
    },
  };
  const short = [];
  for (const [name, w] of [['before', b], ['after', a]]) {
    if (w.messages < MIN_MESSAGES) short.push(`${name}: ${w.messages} messages (needs ${MIN_MESSAGES})`);
    if (w.conversations < MIN_CONVERSATIONS) short.push(`${name}: ${w.conversations} conversations (needs ${MIN_CONVERSATIONS})`);
    if (w.spanDays < MIN_SPAN_DAYS) short.push(`${name}: spans ${w.spanDays} days (needs ${MIN_SPAN_DAYS})`);
  }
  if (short.length) {
    return { ...base, status: 'insufficient_data', features: [], warnings: [`Not enough data to compare, so no numbers are reported: ${short.join('; ')}.`], note: 'insufficient_data is a normal result, not an error.' };
  }
  const scratch = new Float64Array(Math.max(b.packed.maxWord, a.packed.maxWord) + 1);
  const t = new Float64Array(FIELDS.length);
  const all = (p) => Int32Array.from({ length: p.count }, (_, i) => i);
  const pb = valuesOf(b.packed, all(b.packed), scratch, t);
  const pa = valuesOf(a.packed, all(a.packed), scratch, t);
  const rand = rng(`${seed}:drift:${channel || 'all'}`);
  const diffs = Object.fromEntries(DRIFT_FEATURES.map((f) => [f.id, new Float64Array(rounds)]));
  const ib = new Int32Array(b.packed.count);
  const ia = new Int32Array(a.packed.count);
  const sample = (idx) => {
    for (let i = 0; i < idx.length; i++) idx[i] = Math.floor(rand() * idx.length);
    return idx;
  };
  for (let r = 0; r < rounds; r++) {
    const vb = valuesOf(b.packed, sample(ib), scratch, t);
    const va = valuesOf(a.packed, sample(ia), scratch, t);
    for (const f of DRIFT_FEATURES) diffs[f.id][r] = va[f.id] - vb[f.id];
  }
  const feats = DRIFT_FEATURES.map((f) => {
    const d = Array.from(diffs[f.id]);
    const lo = quantile(d, 0.025);
    const hi = quantile(d, 0.975);
    const change = pa[f.id] - pb[f.id];
    const flagged = (lo > 0 || hi < 0) && Math.abs(change) >= f.threshold;
    const dp = f.id === 'medianWords' || /Per1k$/.test(f.id) ? 2 : 3;
    return { feature: f.id, label: f.label, before: round(pb[f.id], dp), after: round(pa[f.id], dp), change: round(change, dp), ci95: [round(lo, dp), round(hi, dp)], threshold: f.threshold, flagged, direction: flagged ? (change > 0 ? 'up' : 'down') : null };
  });
  const n = feats.filter((f) => f.flagged).length;
  return {
    ...base,
    status: 'ok',
    features: feats,
    warnings: [],
    note: `Exploratory: ${feats.length} features were tested at once, so expect about one in twenty to look changed by chance; ${n} passed both the 95% interval and the practical threshold. Surface style only: this says nothing about beliefs, personality, health or identity, and no change is statistically certain.`,
  };
}

export function driftMarkdown(r) {
  const L = [];
  L.push(`# Voice Drift (${r.channel})`);
  L.push('');
  L.push(`Before ${r.windows.before.range}: ${r.windows.before.messages} messages in ${r.windows.before.conversations} conversations. After ${r.windows.after.range}: ${r.windows.after.messages} messages in ${r.windows.after.conversations} conversations.`);
  L.push('');
  if (r.status !== 'ok') {
    L.push(`**insufficient_data.** ${r.warnings.join(' ')}`);
    return L.join('\n') + '\n';
  }
  L.push(`Bootstrap: ${r.rounds} resamples of whole conversations, seed "${r.seed}".`);
  L.push('');
  L.push('| Feature | Before | After | Change | 95% interval | Threshold | Changed |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const f of r.features) L.push(`| ${f.label} | ${f.before} | ${f.after} | ${f.change > 0 ? '+' : ''}${f.change} | ${f.ci95[0]} to ${f.ci95[1]} | ${f.threshold} | ${f.flagged ? `yes, ${f.direction}` : 'no'} |`);
  L.push('');
  L.push(r.note);
  return L.join('\n') + '\n';
}

export async function cmdDrift(args, dir, { readTrain, writeOut, outLine, relShown }) {
  const before = parseWindow(args.before, '--before');
  const after = parseWindow(args.after, '--after');
  requireConsent(dir, 'local-lint');
  const train = readTrain(dir);
  const r = drift(train, { before, after, channel: args.channel && args.channel !== true ? String(args.channel) : null, seed: String(args.seed || 'selfclone') });
  const text = args.json ? JSON.stringify(r, null, 2) : driftMarkdown(r);
  if (args.out && args.out !== true) {
    writeOut(String(args.out), text.endsWith('\n') ? text : text + '\n');
    outLine(`Wrote ${relShown(String(args.out))} (${r.status}).`);
  } else outLine(text.trimEnd());
}
