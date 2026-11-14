// Voice Passport: a presentation of coarse writing tendencies, projected from the private voice profile.
// The public projection is built only from bucketed, allowlisted features: every string in it comes
// from the fixed catalogs below, never from messages or a model. A last check walks the result and
// refuses any string that is not in the allowlist. These are heuristics against casual leaks, not a
// formal anonymity guarantee (docs/PASSPORT-PRIVACY.md).
import { sha256, round, VERSION } from '../util.mjs';
import { canonicalJson, validateNamed, formatErrors } from '../schema.mjs';
import { CHANNELS, CHANNEL_LABELS } from '../profile/channels.mjs';
import { scrub } from '../scrub.mjs';
import { invalid } from '../errors.mjs';

export const DISCLAIMER = 'AI-derived writing-style summary; not identity proof.';
export const DEFAULT_TITLE = 'My writing style';
export const MIN_TOTAL = 100;
export const MIN_CHANNEL = 30;
export const MIN_CHANNEL_THREADS = 10;
export const MAX_PUBLIC_HABITS = 3;

export const evidenceBand = (n) => (n < 100 ? '<100' : n < 500 ? '100–499' : '500+');

export const LENGTHS = ['very short', 'short', 'short-to-medium', 'medium', 'long'];
export const CASINGS = ['mostly lowercase', 'mixed', 'capitalised'];
export const PUNCTUATIONS = ['light', 'moderate', 'full'];

export const lengthBucket = (median) => (median <= 6 ? 'very short' : median <= 15 ? 'short' : median <= 30 ? 'short-to-medium' : median <= 60 ? 'medium' : 'long');
export const casingBucket = (rate) => (rate >= 0.7 ? 'mostly lowercase' : rate <= 0.15 ? 'capitalised' : 'mixed');
export const punctuationBucket = (rate) => (rate >= 0.7 ? 'full' : rate <= 0.3 ? 'light' : 'moderate');

// The fixed phrase catalog, in priority order. Each habit is a description, never a quotation.
export const HABITS = [
  ['Usually concise in developer discussions', (g, c) => c.dev && c.dev.features.medianWords <= 20],
  ['Often starts messages in lowercase', (g) => g.lowercaseStartRate >= 0.6],
  ['Uses direct questions sparingly', (g) => g.questionMsgRate <= 0.1],
  ['Asks questions often', (g) => g.questionMsgRate >= 0.3],
  ['Rarely uses exclamation marks', (g) => g.exclamationMsgRate <= 0.03],
  ['Uses exclamation marks freely', (g) => g.exclamationMsgRate >= 0.25],
  ['Writes longer in email than in chat', (g, c) => c.email && c.message && c.email.features.medianWords >= 2 * c.message.features.medianWords],
  ['Keeps changelog entries short', (g, c) => c.changelog && c.changelog.features.medianWords <= 12],
  ['Often leaves off the final full stop', (g) => g.endPunctRate <= 0.3],
  ['Ends sentences with punctuation', (g) => g.endPunctRate >= 0.85],
  ['Rarely uses emoji', (g) => g.emojiMsgRate <= 0.02],
  ['Uses emoji in casual writing', (g) => g.emojiMsgRate >= 0.2],
  ['Uses semicolons', (g) => g.semicolonPer1k >= 1],
  ['Often drops apostrophes in contractions', (g) => g.contractionRate >= 0.02 && g.apostropheDropRate >= 0.5],
  ['Writes long sentences', (g) => g.sentenceWords >= 18],
  ['Writes short sentences', (g) => g.sentenceWords <= 8],
];

export const PRIVACY_NOTES = [
  'No message text',
  'No names, email addresses or links from your writing',
  'No writing samples or rare phrases',
  'No exact message counts',
  'Rounded and bucketed tendencies only',
];

function registersOf(profile, { audience }) {
  const out = [];
  for (const id of CHANNELS) {
    const c = profile.channels[id];
    if (!c) continue;
    const own = !c.fallback && c.messageCount >= MIN_CHANNEL && c.threadCount >= MIN_CHANNEL_THREADS;
    if (!own && audience === 'public') continue; // low-volume channels are left out of a public card entirely
    out.push({
      id,
      label: CHANNEL_LABELS[id],
      coverage: own ? (c.confidence === 'high' ? 'supported' : 'partial') : 'limited',
      length: lengthBucket(c.features.medianWords),
      casing: casingBucket(c.features.lowercaseStartRate),
      punctuation: punctuationBucket(c.features.endPunctRate),
    });
  }
  return out;
}

function digestOf(card) {
  return `sha256:${sha256(canonicalJson(card))}`;
}

/** Build the passport object for an audience ('public' or 'private'). */
export function projectPassport(profile, { audience = 'public', displayName = null } = {}) {
  if (!['public', 'private'].includes(audience)) throw invalid('E_ARGS', `--audience must be public or private, not "${audience}".`, 'Pick public for a card to share, private for a local view.');
  if (displayName != null) checkDisplayName(displayName);
  const g = profile.global.features;
  const total = profile.global.messageCount;
  const base = {
    schemaVersion: 1,
    kind: 'selfclone-voice-passport',
    audience,
    generatedBy: `selfclone/${VERSION}`,
    disclaimer: DISCLAIMER,
    title: DEFAULT_TITLE,
    ...(displayName ? { displayName } : {}),
    evidenceBand: evidenceBand(total),
  };
  let card;
  if (audience === 'public' && total < MIN_TOTAL) {
    card = { ...base, status: 'insufficient_data', registers: [], habits: [], privacy: PRIVACY_NOTES.slice() };
  } else {
    const registers = registersOf(profile, { audience });
    const habits = HABITS.filter(([, test]) => test(g, profile.channels)).map(([h]) => h);
    card = {
      ...base,
      status: registers.length ? 'ok' : 'insufficient_data',
      registers,
      habits: audience === 'public' ? habits.slice(0, MAX_PUBLIC_HABITS) : habits,
      privacy: PRIVACY_NOTES.slice(),
    };
    if (audience === 'private') {
      card.details = {
        trainMessages: total,
        channels: Object.fromEntries(
          Object.entries(profile.channels).map(([id, c]) => [
            id,
            { messageCount: c.messageCount, threadCount: c.threadCount, confidence: c.confidence, fallback: c.fallback, medianWords: round(c.features.medianWords, 1), lowercaseStartRate: round(c.features.lowercaseStartRate, 2), endPunctRate: round(c.features.endPunctRate, 2), questionMsgRate: round(c.features.questionMsgRate, 2), emojiMsgRate: round(c.features.emojiMsgRate, 2) },
          ]),
        ),
      };
    }
  }
  card.projectionDigest = digestOf(card);
  const errs = validateNamed(card, 'passport.v1.schema.json');
  if (errs.length) throw invalid('E_PASSPORT_SCHEMA', `The passport does not match schemas/passport.v1.schema.json: ${formatErrors(errs)}`, 'Rebuild the profile with selfclone profile build.');
  if (audience === 'public') assertPublicAllowlist(card, { displayName });
  return card;
}

export function checkDisplayName(name) {
  const s = String(name);
  if (!s.trim() || Array.from(s).length > 60) throw invalid('E_ARGS', '--display-name must have 1 to 60 characters.', 'Pass a short name, or leave it out to show "My writing style".');
  if (/https?:|www\.|@|[<>{}]|[\u0000-\u001f\u200B-\u200D\u2060\uFEFF]/.test(s) || Object.keys(scrub(s).counts).length) {
    throw invalid('E_ARGS', '--display-name may not hold a link, an email address, markup, control characters or anything the scrubber treats as a secret.', 'Use a plain name.');
  }
  return s;
}

const ALLOWED = new Set([
  'selfclone-voice-passport', 'public', 'ok', 'insufficient_data', DISCLAIMER, DEFAULT_TITLE, '<100', '100–499', '500+',
  'supported', 'partial', 'limited', ...LENGTHS, ...CASINGS, ...PUNCTUATIONS, ...CHANNELS, ...Object.values(CHANNEL_LABELS),
  ...HABITS.map(([h]) => h), ...PRIVACY_NOTES,
]);

/** Defence in depth: every string in a public card must come from the allowlist. Throws otherwise. */
export function assertPublicAllowlist(card, { displayName = null } = {}) {
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const ok = ALLOWED.has(v) || (where === 'generatedBy' && /^selfclone\/\d+\.\d+\.\d+$/.test(v)) || (where === 'projectionDigest' && /^sha256:[0-9a-f]{64}$/.test(v)) || (where === 'displayName' && v === displayName);
      if (!ok) throw invalid('E_PASSPORT_LEAK', `Refusing to write a public passport: the field ${where} holds a value outside the allowlist.`, 'This is a bug; please report it. No file was written.');
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(card, 'card');
  return true;
}
