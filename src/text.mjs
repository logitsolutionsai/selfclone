// Text measurement shared by the fingerprint and the scorer.
// Everything here is deterministic and works on any script: character-level
// features are always computed; the English function-word features simply go
// to zero for text in other languages.
import { FUNCTION_WORDS, FUNCTION_WORD_SET } from './functionwords.mjs';

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const LETTER_RE = /\p{L}/gu;
const UPPER_RE = /\p{Lu}/gu;
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.[^\s]+|\[(?:URL|TOKEN_URL)\]/gi;
// Laughter in English and in the spellings Portuguese, Spanish and French writers use (ahah, jaja, kkkk, rsrs, mdr).
export const LAUGH_WORD = /^(?:lol+|lmao+|lmfao|rofl|ha(?:ha)+h?|he(?:he)+|ah(?:ah)+h?|ja(?:ja)+|je(?:je)+|k{3,}|rs(?:rs)+|mdr|xd)$/i;
const LAUGH_RE = /(?<![\p{L}\p{N}])(?:lol+|lmao+|lmfao|rofl|ha(?:ha)+h?|he(?:he)+|ah(?:ah)+h?|ja(?:ja)+|je(?:je)+|k{3,}|rs(?:rs)+|mdr|xd)(?![\p{L}\p{N}])|\u{1F602}|\u{1F923}/iu;
const PLACEHOLDER_RE = /\[(?:EMAIL|PHONE|CARD|IBAN|API_KEY|SECRET|TOKEN|TOKEN_URL|PASSWORD|PRIVATE_KEY|URL|ID_NUMBER|ACCOUNT)\]/g;

const CONTRACTION_APOS = /^[\p{L}]+'(?:t|s|re|ll|ve|d|m)$/u;
const CONTRACTION_BARE = new Set([
  'dont', 'cant', 'wont', 'didnt', 'doesnt', 'isnt', 'wasnt', 'werent', 'arent', 'couldnt',
  'shouldnt', 'wouldnt', 'havent', 'hasnt', 'hadnt', 'im', 'ive', 'youre', 'youve', 'youll',
  'theyre', 'theyve', 'thats', 'whats', 'theres', 'heres', 'lets', 'itll', 'shes', 'hes',
  'ill', 'id', 'wed', 'were', 'weve', 'aint',
]);
// "were", "ill", "id", "wed" are real words too; only count them as dropped
// apostrophes when the text shows other dropped-apostrophe habits.
const AMBIGUOUS_BARE = new Set(['were', 'ill', 'id', 'wed', 'lets', 'hes', 'shes']);

export function normalizeQuotes(s) {
  return String(s).replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

export function words(text) {
  const t = normalizeQuotes(text).replace(URL_RE, ' ').replace(PLACEHOLDER_RE, ' ');
  return (t.match(WORD_RE) || []).map((w) => w.toLowerCase());
}

export function sentences(text) {
  return normalizeQuotes(text)
    .replace(URL_RE, ' ')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => (s.match(WORD_RE) || []).length > 0);
}

/**
 * How much a reply says, for deciding whether it is worth sealing as a test item.
 * Chinese and Japanese are written without spaces, so each Han or kana character
 * counts on its own; emoji count too, so an emoji-heavy writer still gets a test set.
 */
export function tokenCount(text) {
  const t = normalizeQuotes(text).replace(URL_RE, ' ').replace(PLACEHOLDER_RE, ' ');
  const cjk = (t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  const rest = t.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ');
  return (rest.match(WORD_RE) || []).length + cjk + emojis(t).length;
}

export function emojis(text) {
  return String(text).match(EMOJI_RE) || [];
}

export function hasUrl(text) {
  URL_RE.lastIndex = 0;
  const r = URL_RE.test(text);
  URL_RE.lastIndex = 0;
  return r;
}

function count(re, s) {
  re.lastIndex = 0;
  const m = s.match(re);
  return m ? m.length : 0;
}

// Punctuation counts on text with URLs removed. "..." and the single-character
// ellipsis both count as one ellipsis and are not counted as periods.
export function punctuation(text) {
  let t = normalizeQuotes(text).replace(URL_RE, ' ').replace(PLACEHOLDER_RE, ' ');
  const ellipsis = count(/\.{3,}|…/g, t);
  t = t.replace(/\.{3,}|…/g, ' ');
  // Decimal points and abbreviations like "e.g." still count as periods; that is fine for style.
  const dash = count(/—|–|\s-\s|--/g, t);
  return {
    period: count(/\./g, t),
    comma: count(/,/g, t),
    exclamation: count(/!/g, t),
    question: count(/\?/g, t),
    ellipsis,
    dash,
    semicolon: count(/;/g, t),
    colon: count(/:(?!\/\/)/g, t),
  };
}

export const PUNCT_KEYS = ['period', 'comma', 'exclamation', 'question', 'ellipsis', 'dash', 'semicolon', 'colon'];

/**
 * Stylometric feature vector for a set of messages. Every value is a rate or a
 * mean, so samples of different sizes are comparable.
 */
export function features(texts) {
  const msgs = texts.map((t) => String(t || '')).filter((t) => t.trim());
  const n = msgs.length || 1;
  let chars = 0;
  let wordsTotal = 0;
  let letters = 0;
  let uppers = 0;
  let wordLetters = 0;
  let sentCount = 0;
  let sentWords = 0;
  let emojiCount = 0;
  let emojiMsgs = 0;
  let casedStarts = 0;
  let lowerStarts = 0;
  let capsWords = 0;
  let casedWords = 0;
  let contractions = 0;
  let bareContractions = 0;
  let questionMsgs = 0;
  let exclaimMsgs = 0;
  let linkMsgs = 0;
  let multiLine = 0;
  let endPunct = 0;
  let laughMsgs = 0;
  let digits = 0;
  const punct = Object.fromEntries(PUNCT_KEYS.map((k) => [k, 0]));
  const fw = new Map();

  for (const raw of msgs) {
    const m = normalizeQuotes(raw);
    const noUrl = m.replace(URL_RE, ' ').replace(PLACEHOLDER_RE, ' ');
    chars += noUrl.replace(/\s+/g, ' ').trim().length;
    const ws = words(m);
    wordsTotal += ws.length;
    letters += count(LETTER_RE, noUrl);
    uppers += count(UPPER_RE, noUrl);
    digits += count(/\p{N}/gu, noUrl);
    for (const w of ws) {
      const l = count(LETTER_RE, w);
      wordLetters += l;
      if (FUNCTION_WORD_SET.has(w)) fw.set(w, (fw.get(w) || 0) + 1);
      if (CONTRACTION_APOS.test(w)) contractions++;
      else if (CONTRACTION_BARE.has(w) && !AMBIGUOUS_BARE.has(w)) {
        contractions++;
        bareContractions++;
      }
    }
    // all-caps words: look at the original casing
    const origWords = noUrl.match(WORD_RE) || [];
    for (const w of origWords) {
      const lettersOnly = w.replace(/[^\p{L}]/gu, '');
      if (lettersOnly.length < 2) continue;
      if (lettersOnly.toLowerCase() === lettersOnly.toUpperCase()) continue; // uncased script
      casedWords++;
      if (lettersOnly === lettersOnly.toUpperCase()) capsWords++;
    }
    const ss = sentences(m);
    sentCount += ss.length;
    for (const s of ss) sentWords += (s.match(WORD_RE) || []).length;
    const em = emojis(m);
    emojiCount += em.length;
    if (em.length) emojiMsgs++;
    const firstLetter = noUrl.match(/\p{L}/u);
    if (firstLetter) {
      const c = firstLetter[0];
      if (c.toLowerCase() !== c.toUpperCase()) {
        casedStarts++;
        if (c === c.toLowerCase()) lowerStarts++;
      }
    }
    if (m.includes('?')) questionMsgs++;
    if (m.includes('!')) exclaimMsgs++;
    if (hasUrl(m)) linkMsgs++;
    if (/\n/.test(m.trim())) multiLine++;
    const trimmed = noUrl.replace(EMOJI_RE, '').trim();
    if (/[.!?…)]$/.test(trimmed)) endPunct++;
    if (LAUGH_RE.test(m)) laughMsgs++;
    const p = punctuation(m);
    for (const k of PUNCT_KEYS) punct[k] += p[k];
  }

  const per1k = (x) => (chars ? (x * 1000) / chars : 0);
  const out = {
    msgChars: chars / n,
    msgWords: wordsTotal / n,
    sentenceWords: sentCount ? sentWords / sentCount : 0,
    wordLength: wordsTotal ? wordLetters / wordsTotal : 0,
  };
  for (const k of PUNCT_KEYS) out[`${k}Per1k`] = per1k(punct[k]);
  Object.assign(out, {
    emojiPer1k: per1k(emojiCount),
    emojiMsgRate: emojiMsgs / n,
    lowercaseStartRate: casedStarts ? lowerStarts / casedStarts : 0,
    allCapsWordRate: casedWords ? capsWords / casedWords : 0,
    contractionRate: wordsTotal ? contractions / wordsTotal : 0,
    apostropheDropRate: contractions ? bareContractions / contractions : 0,
    questionMsgRate: questionMsgs / n,
    exclamationMsgRate: exclaimMsgs / n,
    linkMsgRate: linkMsgs / n,
    multiLineRate: multiLine / n,
    endPunctRate: endPunct / n,
    laughMsgRate: laughMsgs / n,
    uppercaseRatio: letters ? uppers / letters : 0,
    digitPer1k: per1k(digits),
  });
  return out;
}

export const FEATURE_LABELS = {
  msgChars: 'Characters per message',
  msgWords: 'Words per message',
  sentenceWords: 'Words per sentence',
  wordLength: 'Letters per word',
  periodPer1k: 'Periods per 1k chars',
  commaPer1k: 'Commas per 1k chars',
  exclamationPer1k: 'Exclamation marks per 1k chars',
  questionPer1k: 'Question marks per 1k chars',
  ellipsisPer1k: 'Ellipses per 1k chars',
  dashPer1k: 'Dashes ( - , –, —) per 1k chars',
  semicolonPer1k: 'Semicolons per 1k chars',
  colonPer1k: 'Colons per 1k chars',
  emojiPer1k: 'Emoji per 1k chars',
  emojiMsgRate: 'Messages with emoji',
  lowercaseStartRate: 'Messages starting lowercase',
  allCapsWordRate: 'ALL-CAPS words',
  contractionRate: 'Contractions per word',
  apostropheDropRate: 'Contractions without apostrophe',
  questionMsgRate: 'Messages with a question mark',
  exclamationMsgRate: 'Messages with an exclamation mark',
  linkMsgRate: 'Messages with a link',
  multiLineRate: 'Multi-line messages',
  endPunctRate: 'Messages ending in punctuation',
  laughMsgRate: 'Messages with laughter (lol, haha, ahah, jaja, kkkk)',
  uppercaseRatio: 'Uppercase share of letters',
  digitPer1k: 'Digits per 1k chars',
};

// Relative frequency (per word) of each word in `vocab` across all texts.
export function wordFrequencies(texts, vocab = FUNCTION_WORDS) {
  const counts = new Map(vocab.map((w) => [w, 0]));
  let total = 0;
  for (const t of texts) {
    for (const w of words(t)) {
      total++;
      if (counts.has(w)) counts.set(w, counts.get(w) + 1);
    }
  }
  const freq = {};
  for (const [w, c] of counts) freq[w] = total ? c / total : 0;
  return { freq, total };
}

// Share of word tokens that are English function words; a rough "is this English" signal.
export function englishShare(texts) {
  let total = 0;
  let hits = 0;
  for (const t of texts) {
    for (const w of words(t)) {
      total++;
      if (FUNCTION_WORD_SET.has(w)) hits++;
    }
  }
  return total ? hits / total : 0;
}
