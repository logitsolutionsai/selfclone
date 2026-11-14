// voice-profile.v1.json: a private, versioned summary of the user's writing per channel, built from
// the training split only (train.jsonl). It holds numbers and enums, never text, sender ids, URLs or
// file paths. Features reuse features() from text.mjs, the same extractor the fingerprint and the
// scorer use; this release adds no new scoring math.
import { features, words } from '../text.mjs';
import { quantile, round, sha256, VERSION } from '../util.mjs';
import { CHANNELS, PARENT, channelOf, conversationKey } from './channels.mjs';
import { canonicalJson, validateNamed, formatErrors } from '../schema.mjs';
import { invalid } from '../errors.mjs';

export const EXTRACTOR_VERSION = '1';
// The score report format in score.mjs is version 1; profile numbers are comparable only within it.
export const SCORER_VERSION = '1';

// The frozen feature list. Names are the established ones from text.mjs, plus two length quantiles.
export const PROFILE_FEATURES = [
  'medianWords', 'p90Words', 'sentenceWords', 'wordLength',
  'periodPer1k', 'commaPer1k', 'exclamationPer1k', 'questionPer1k', 'ellipsisPer1k', 'dashPer1k', 'semicolonPer1k', 'colonPer1k',
  'emojiPer1k', 'emojiMsgRate', 'lowercaseStartRate', 'allCapsWordRate', 'contractionRate', 'apostropheDropRate',
  'questionMsgRate', 'exclamationMsgRate', 'multiLineRate', 'endPunctRate', 'laughMsgRate', 'uppercaseRatio',
];

// Names some documents use for the same measures. The profile keeps the established names.
export const FEATURE_ALIASES = {
  terminalPunctuationRate: 'endPunctRate',
  questionRate: 'questionMsgRate',
  emojiPer1kChars: 'emojiPer1k',
  semicolonPer1kChars: 'semicolonPer1k',
};

// Evidence thresholds for a channel estimate of its own.
export const HIGH_MESSAGES = 100;
export const MIN_MESSAGES = 30;
export const MIN_THREADS = 10;
// Shrinkage toward the parent pool: w = n / (n + SHRINK_K).
export const SHRINK_K = 50;

export function featureVector(records) {
  const texts = records.map((r) => r.text);
  const counts = texts.map((t) => words(t).length);
  const f = features(texts);
  const out = { medianWords: round(quantile(counts, 0.5), 2), p90Words: round(quantile(counts, 0.9), 2) };
  for (const k of PROFILE_FEATURES) if (!(k in out)) out[k] = round(f[k] || 0, 4);
  return out;
}

const threadCount = (records) => new Set(records.map(conversationKey)).size;

export function shrink(own, parent, n) {
  const w = n / (n + SHRINK_K);
  const out = {};
  for (const k of PROFILE_FEATURES) out[k] = round(w * (own ? own[k] : 0) + (1 - w) * parent[k], 4);
  return { features: out, w: round(w, 4) };
}

/** Normalise and digest the training records: sorted by id, keys sorted, strings NFC. */
export function trainingDigest(train) {
  const sorted = train.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return `sha256:${sha256(canonicalJson(sorted))}`;
}

/**
 * Build the profile.
 * @param {object[]} train  records from train.jsonl (never sealed.jsonl)
 * @param {{consentRecordId: string|null}} o
 */
export function buildProfile(train, { consentRecordId = null } = {}) {
  if (!Array.isArray(train) || !train.length) throw invalid('E_NO_TRAINING', 'There are no training messages.', 'Run selfclone ingest first.');
  const byChannel = new Map();
  for (const r of train) {
    const c = channelOf(r);
    if (!byChannel.has(c)) byChannel.set(c, []);
    byChannel.get(c).push(r);
  }
  const global = { messageCount: train.length, threadCount: threadCount(train), features: featureVector(train) };
  const channels = {};
  const warnings = [];
  // Top-level channels first, so a child can back off to its parent's estimate.
  const order = CHANNELS.filter((c) => PARENT[c] === null).concat(CHANNELS.filter((c) => PARENT[c] !== null));
  for (const c of order) {
    const recs = byChannel.get(c);
    if (!recs || !recs.length) continue;
    const n = recs.length;
    const t = threadCount(recs);
    const own = featureVector(recs);
    if (n >= MIN_MESSAGES && t >= MIN_THREADS) {
      channels[c] = { messageCount: n, threadCount: t, confidence: n >= HIGH_MESSAGES ? 'high' : 'medium', fallback: null, shrinkWeight: null, features: own };
      continue;
    }
    const parentId = PARENT[c] && channels[PARENT[c]] ? PARENT[c] : 'global';
    const parent = parentId === 'global' ? global.features : channels[parentId].features;
    const s = shrink(own, parent, n);
    channels[c] = { messageCount: n, threadCount: t, confidence: 'low', fallback: parentId, shrinkWeight: s.w, features: s.features };
    warnings.push(`${c}: ${n} messages in ${t} conversations (needs ${MIN_MESSAGES} in ${MIN_THREADS}), so it is blended with ${parentId === 'global' ? 'all your writing' : parentId} (weight ${s.w} on its own numbers).`);
  }
  const body = {
    schemaVersion: 1,
    source: { trainingDigest: trainingDigest(train), trainMessages: train.length, sealedMessagesRead: false, consentRecordId },
    channels,
    global,
    extractorVersion: EXTRACTOR_VERSION,
    scorerVersion: SCORER_VERSION,
  };
  const profileId = sha256(canonicalJson(body)).slice(0, 20);
  const profile = { schemaVersion: 1, profileId, createdBy: `selfclone/${VERSION}`, ...body };
  assertProfile(profile);
  return { profile, warnings };
}

export function assertProfile(p) {
  const errs = validateNamed(p, 'voice-profile.v1.schema.json');
  if (errs.length) throw invalid('E_PROFILE_SCHEMA', `The voice profile does not match schemas/voice-profile.v1.schema.json: ${formatErrors(errs)}`, 'Rebuild it with selfclone profile build.');
  return p;
}

/** The channel estimate lint and the passport use: the channel if present, else its parent, else global. */
export function channelEstimate(profile, channel) {
  if (profile.channels[channel]) return { id: channel, ...profile.channels[channel] };
  const parent = PARENT[channel];
  if (parent && profile.channels[parent]) return { id: parent, ...profile.channels[parent], fallback: parent, confidence: 'low' };
  return { id: 'global', ...profile.global, confidence: profile.global.messageCount >= HIGH_MESSAGES ? 'medium' : 'low', fallback: 'global', shrinkWeight: null };
}
