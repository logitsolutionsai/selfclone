// Style fingerprint: measurable habits of the user's writing, computed on the
// training split only. Output feeds the distill pack and the clone's voice rules.
import { features, words, emojis, FEATURE_LABELS, wordFrequencies, englishShare, normalizeQuotes, LAUGH_WORD } from './text.mjs';
import { FUNCTION_WORDS, FUNCTION_WORD_SET, EXTRA_STOPWORDS } from './functionwords.mjs';
import { mean, quantile, round } from './util.mjs';
import { kindOf } from './kinds.mjs';

const GREETINGS = new Set(['hi', 'hey', 'heya', 'hello', 'hiya', 'yo', 'morning', 'evening', 'afternoon', 'dear', 'sup', 'heyy', 'heyyy', 'hii', 'hiii', 'howdy', 'greetings', 'gm', 'ola', 'hola', 'salut', 'hallo', 'ciao']);
// Chat shorthand: reported on its own, kept out of topic words.
export const SHORTHAND = new Set(['lol', 'lmao', 'lmfao', 'rofl', 'haha', 'hahaha', 'hehe', 'omg', 'tbh', 'ngl', 'pls', 'plz', 'tho', 'idk', 'rn', 'btw', 'imo', 'imho', 'ty', 'thx', 'u', 'ur', 'obvs', 'lowkey', 'fr', 'bc', 'cuz', 'gonna', 'wanna', 'kinda', 'sorta', 'yall', 'ya', 'kk', 'ikr', 'smh', 'af', 'asap', 'irl', 'jk', 'omw', 'brb', 'nvm', 'tmrw', 'fyi', 'dm', 'np', 'yep', 'nope', 'yeah', 'yay', 'ugh', 'aw', 'oof', 'ofc', 'idc', 'wyd', 'hbu', 'ily', 'srsly', 'rly', 'yk', 'ik', 'probs', 'deffo', 'tmr', 'bday', 'pls', 'thnx', 'ok', 'okay', 'k', 'kk']);
const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'this', 'that', 'these', 'those', 'our', 'their', 'his', 'her', 'its']);
const SIGNOFFS = new Set(['cheers', 'thanks', 'thx', 'ty', 'best', 'regards', 'x', 'xx', 'xxx', 'xo', 'xoxo', 'love', 'later', 'bye', 'cya', 'ttyl', 'night', 'gn', 'talk soon', 'speak soon', 'ciao']);

function lengthStats(values) {
  return {
    mean: round(mean(values), 1),
    median: round(quantile(values, 0.5), 1),
    p10: round(quantile(values, 0.1), 1),
    p90: round(quantile(values, 0.9), 1),
  };
}

function wordBuckets(counts) {
  const buckets = [
    ['1-3', 1, 3],
    ['4-10', 4, 10],
    ['11-25', 11, 25],
    ['26-60', 26, 60],
    ['61+', 61, Infinity],
  ];
  const n = counts.length || 1;
  return Object.fromEntries(buckets.map(([k, lo, hi]) => [k, round(counts.filter((c) => c >= lo && c <= hi).length / n, 3)]));
}

const isStop = (w) => FUNCTION_WORD_SET.has(w) || EXTRA_STOPWORDS.has(w) || /^\d+$/.test(w);

export function signaturePhrases(records, { minMessages = 3, max = 25 } = {}) {
  const counts = new Map();
  for (const r of records) {
    const ws = words(r.text);
    const local = new Set();
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= ws.length; i++) {
        const gram = ws.slice(i, i + n);
        if (gram.every(isStop)) continue;
        if (n === 2 && DETERMINERS.has(gram[0])) continue; // "the glaze" is topic, not style
        if (gram.some((g) => /^(?:email|phone|url|token|card|iban|password|secret|api_key|id_number|account)$/.test(g))) continue;
        local.add(gram.join(' '));
      }
    }
    for (const g of local) {
      if (!counts.has(g)) counts.set(g, { count: 0, example: r.id });
      counts.get(g).count++;
    }
  }
  let list = [...counts]
    .filter(([, v]) => v.count >= minMessages)
    .map(([phrase, v]) => ({ phrase, messages: v.count, example: v.example, n: phrase.split(' ').length }));
  // Drop phrases that are just part of a longer phrase that is almost as common.
  list = list.filter((p) => !list.some((q) => q.n > p.n && q.messages >= 0.8 * p.messages && (' ' + q.phrase + ' ').includes(' ' + p.phrase + ' ')));
  list.sort((a, b) => b.messages * (1 + 0.5 * (b.n - 2)) - a.messages * (1 + 0.5 * (a.n - 2)) || a.phrase.localeCompare(b.phrase));
  return list.slice(0, max).map(({ phrase, messages, example }) => ({ phrase, messages, example }));
}

function edgeToken(text, end) {
  const t = normalizeQuotes(text).trim();
  if (!t) return null;
  const re = end
    ? /(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}\uFE0F]*|[:;]-?[)(DPp]|[\p{L}\p{N}']+)[^\p{L}\p{N}\p{Extended_Pictographic}]*$/u
    : /^[^\p{L}\p{N}\p{Extended_Pictographic}]*(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}\uFE0F]*|[\p{L}\p{N}']+)/u;
  const m = t.match(re);
  return m ? m[1] : null;
}

export function openersClosers(records, { min = 3, max = 12 } = {}) {
  // Counted case-insensitively, shown in the writer's most common casing ("I", not "i").
  const open = new Map();
  const close = new Map();
  const forms = new Map();
  const add = (m, tok) => {
    if (!tok) return;
    const k = tok.toLowerCase();
    m.set(k, (m.get(k) || 0) + 1);
    if (!forms.has(k)) forms.set(k, new Map());
    forms.get(k).set(tok, (forms.get(k).get(tok) || 0) + 1);
  };
  for (const r of records) {
    add(open, edgeToken(r.text, false));
    add(close, edgeToken(r.text, true));
  }
  const shown = (k) => [...forms.get(k)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const n = records.length || 1;
  const top = (m, known) =>
    [...m]
      .filter(([, v]) => v >= min && v / n >= 0.01)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([k, count]) => ({ token: shown(k), count, share: round(count / n, 3), known: known.has(k) }));
  return { openers: top(open, GREETINGS), closers: top(close, SIGNOFFS) };
}

/** How many messages make up one reply turn: the burst habit. */
export function bursts(records) {
  const turns = new Map();
  for (const r of records) turns.set(r.turn || r.id, (turns.get(r.turn || r.id) || 0) + 1);
  const sizes = [...turns.values()];
  const n = sizes.length || 1;
  return {
    turns: sizes.length,
    one: round(sizes.filter((x) => x === 1).length / n, 3),
    two: round(sizes.filter((x) => x === 2).length / n, 3),
    threePlus: round(sizes.filter((x) => x >= 3).length / n, 3),
    mean: round(mean(sizes), 2),
  };
}

/** Which character messages end with, after trailing emoji: the full stop habit, kept apart from ? and !. */
export function endings(records) {
  const c = { period: 0, exclamation: 0, question: 0, ellipsis: 0, other: 0, none: 0 };
  for (const r of records) {
    let t = normalizeQuotes(r.text).trim();
    for (const e of emojis(t)) t = t.split(e).join(' ');
    t = t.replace(/\s*https?:\/\/\S+$/, '').trim();
    if (/(?:\.\.\.|…)$/.test(t)) c.ellipsis++;
    else if (/\.$/.test(t)) c.period++;
    else if (/!$/.test(t)) c.exclamation++;
    else if (/\?$/.test(t)) c.question++;
    else if (/[\p{L}\p{N}]$/u.test(t) || !t) c.none++;
    else c.other++;
  }
  const n = records.length || 1;
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, round(v / n, 3)]));
}

export function topicWords(records, { max = 30 } = {}) {
  const c = new Map();
  for (const r of records) {
    for (const w of new Set(words(r.text))) {
      if (w.length < 3 || isStop(w) || SHORTHAND.has(w) || LAUGH_WORD.test(w) || /\d/.test(w)) continue;
      c.set(w, (c.get(w) || 0) + 1);
    }
  }
  return [...c]
    .filter(([, v]) => v >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([word, messages]) => ({ word, messages }));
}

export function shorthand(records, { max = 15 } = {}) {
  const c = new Map();
  for (const r of records) for (const w of new Set(words(r.text))) if (SHORTHAND.has(w) || LAUGH_WORD.test(w)) c.set(w, (c.get(w) || 0) + 1);
  return [...c].filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([word, messages]) => ({ word, messages }));
}

export function topEmoji(records, max = 10) {
  const c = new Map();
  for (const r of records) for (const e of emojis(r.text)) c.set(e, (c.get(e) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, max).map(([emoji, count]) => ({ emoji, count }));
}

/**
 * The main habits per kind of writing (chat messages, posts and notes, email), so a clone can match the
 * channel. Only filled when at least two kinds have 10 or more messages each; otherwise null.
 */
export function byKind(records, { min = 10 } = {}) {
  const groups = new Map();
  for (const r of records) {
    const k = kindOf(r.source);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const kinds = [...groups].filter(([, recs]) => recs.length >= min);
  if (kinds.length < 2) return null;
  const out = {};
  for (const [k, recs] of kinds) {
    const f = features(recs.map((r) => r.text));
    const sources = {};
    for (const r of recs) sources[r.source] = (sources[r.source] || 0) + 1;
    out[k] = {
      messages: recs.length,
      sources,
      lengthWords: lengthStats(recs.map((r) => words(r.text).length)),
      lowercaseStartRate: round(f.lowercaseStartRate, 3),
      endPunctRate: round(f.endPunctRate, 3),
      emojiMsgRate: round(f.emojiMsgRate, 3),
      laughMsgRate: round(f.laughMsgRate, 3),
      exclamationMsgRate: round(f.exclamationMsgRate, 3),
      apostropheDropRate: round(f.apostropheDropRate, 3),
      sentenceWords: round(f.sentenceWords, 1),
      openers: openersClosers(recs, { min: 2, max: 5 }).openers.map((o) => o.token),
      closers: openersClosers(recs, { min: 2, max: 5 }).closers.map((o) => o.token),
    };
  }
  return out;
}

export function fingerprint(records) {
  const texts = records.map((r) => r.text);
  const charCounts = texts.map((t) => t.length);
  const wordCounts = texts.map((t) => words(t).length);
  const f = features(texts);
  const fw = wordFrequencies(texts, FUNCTION_WORDS);
  const topFunctionWords = Object.entries(fw.freq)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, v]) => ({ word, per1kWords: round(v * 1000, 2) }));
  const sources = {};
  for (const r of records) sources[r.source] = (sources[r.source] || 0) + 1;
  const dates = records.map((r) => r.ts).filter(Boolean).sort();
  const eng = englishShare(texts);
  const kinds = byKind(records);
  return {
    version: 1,
    messages: records.length,
    words: fw.total,
    sources,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    englishShare: round(eng, 3),
    lengthChars: lengthStats(charCounts),
    lengthWords: lengthStats(wordCounts),
    lengthWordBuckets: wordBuckets(wordCounts),
    features: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round(v, 4)])),
    topEmoji: topEmoji(records),
    topFunctionWords,
    signaturePhrases: signaturePhrases(records),
    bursts: bursts(records),
    endings: endings(records),
    ...openersClosers(records),
    shorthand: shorthand(records),
    topicWords: topicWords(records),
    ...(kinds ? { byKind: kinds } : {}),
  };
}

const pct = (x) => `${round(x * 100, 1)}%`;

export function fingerprintMarkdown(fp, { name = 'the user' } = {}) {
  const f = fp.features;
  const lines = [];
  lines.push(`# Style Fingerprint: ${name}`);
  lines.push('');
  lines.push(`Computed from ${fp.messages} training messages (${fp.words} words). Sealed test messages are not included.`);
  lines.push(`Sources: ${Object.entries(fp.sources).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
  if (fp.dateRange) lines.push(`Dates: ${fp.dateRange.from.slice(0, 10)} to ${fp.dateRange.to.slice(0, 10)}.`);
  if (fp.englishShare < 0.15) lines.push(`Note: only ${pct(fp.englishShare)} of words are English function words, so word-level English measures are weak for this text. Character-level measures still apply.`);
  lines.push('');
  lines.push('## Length');
  lines.push('');
  lines.push(`- Words per message: median ${fp.lengthWords.median}, mean ${fp.lengthWords.mean}, 10th to 90th percentile ${fp.lengthWords.p10} to ${fp.lengthWords.p90}.`);
  lines.push(`- Characters per message: median ${fp.lengthChars.median}, mean ${fp.lengthChars.mean}.`);
  lines.push(`- Share of messages by word count: ${Object.entries(fp.lengthWordBuckets).map(([k, v]) => `${k} words ${pct(v)}`).join(', ')}.`);
  lines.push(`- Words per sentence: ${round(f.sentenceWords, 1)}. Letters per word: ${round(f.wordLength, 2)}.`);
  if (fp.bursts) lines.push(`- Messages per reply (a burst of messages sent within five minutes counts as one reply): 1 message ${pct(fp.bursts.one)}, 2 messages ${pct(fp.bursts.two)}, 3 or more ${pct(fp.bursts.threePlus)}; mean ${fp.bursts.mean}.`);
  if (fp.endings) lines.push(`- Last character of a message (after any emoji): full stop ${pct(fp.endings.period)}, exclamation mark ${pct(fp.endings.exclamation)}, question mark ${pct(fp.endings.question)}, ellipsis ${pct(fp.endings.ellipsis)}, a letter or digit ${pct(fp.endings.none)}, other ${pct(fp.endings.other)}.`);
  lines.push('');
  lines.push('## Habits');
  lines.push('');
  lines.push('| Measure | Value |');
  lines.push('| --- | --- |');
  for (const [k, label] of Object.entries(FEATURE_LABELS)) {
    if (['msgChars', 'msgWords', 'sentenceWords', 'wordLength'].includes(k)) continue;
    const v = f[k];
    const shown = /Rate$|Ratio$/.test(k) ? pct(v) : round(v, 2);
    lines.push(`| ${label} | ${shown} |`);
  }
  lines.push('');
  if (fp.topEmoji.length) {
    lines.push('## Emoji');
    lines.push('');
    lines.push(fp.topEmoji.map((e) => `${e.emoji} ${e.count}`).join('  '));
    lines.push('');
  }
  lines.push('## Openers And Closers');
  lines.push('');
  lines.push(`- Most common first word: ${fp.openers.map((o) => `"${o.token}" (${pct(o.share)})`).join(', ') || 'none stands out'}.`);
  lines.push(`- Most common last word or emoji: ${fp.closers.map((o) => `"${o.token}" (${pct(o.share)})`).join(', ') || 'none stands out'}.`);
  lines.push('');
  lines.push('## Signature Phrases');
  lines.push('');
  if (fp.signaturePhrases.length) for (const p of fp.signaturePhrases) lines.push(`- "${p.phrase}" in ${p.messages} messages (example: ${p.example})`);
  else lines.push('- None recur in 3 or more messages.');
  lines.push('');
  lines.push('## Function Words (per 1,000 words)');
  lines.push('');
  lines.push(fp.topFunctionWords.map((w) => `${w.word} ${w.per1kWords}`).join(', ') || 'none');
  lines.push('');
  lines.push('## Chat Shorthand');
  lines.push('');
  lines.push((fp.shorthand || []).map((w) => `${w.word} (${w.messages})`).join(', ') || 'none');
  lines.push('');
  lines.push('## Topic Words');
  lines.push('');
  lines.push(fp.topicWords.map((w) => `${w.word} (${w.messages})`).join(', ') || 'none');
  lines.push('');
  if (fp.byKind) {
    const names = { message: 'Chat messages', post: 'Posts and notes', email: 'Email' };
    lines.push('## By Kind Of Writing');
    lines.push('');
    lines.push('The same habits measured separately for each kind of writing in the exports. Use them to match the channel.');
    lines.push('');
    lines.push('| Kind | Messages | Median words | 10th to 90th percentile | Words per sentence | Start lowercase | End in punctuation | With emoji | With laughter | With "!" | Contractions without apostrophe | Common first words | Common last words |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const [k, v] of Object.entries(fp.byKind)) {
      const src = Object.entries(v.sources).map(([s, c]) => `${s} ${c}`).join(', ');
      lines.push(`| ${names[k] || k} (${src}) | ${v.messages} | ${v.lengthWords.median} | ${v.lengthWords.p10} to ${v.lengthWords.p90} | ${v.sentenceWords} | ${pct(v.lowercaseStartRate)} | ${pct(v.endPunctRate)} | ${pct(v.emojiMsgRate)} | ${pct(v.laughMsgRate)} | ${pct(v.exclamationMsgRate)} | ${pct(v.apostropheDropRate)} | ${v.openers.map((o) => `"${o}"`).join(', ') || 'none'} | ${v.closers.map((o) => `"${o}"`).join(', ') || 'none'} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
