// Distill pack: a stratified sample of TRAIN turns plus the fingerprint, sized
// for Claude to read in one go. A turn is one reply: the message someone sent
// (context) and every message the user sent back in a burst. Sealed messages
// never enter the pack.
import { rng, shuffle } from './util.mjs';
import { words } from './text.mjs';
import { FUNCTION_WORD_SET, EXTRA_STOPWORDS } from './functionwords.mjs';
import { fingerprintMarkdown } from './fingerprint.mjs';
import { groupTurns } from './split.mjs';

function lengthBucket(n) {
  if (n <= 3) return 'short';
  if (n <= 15) return 'medium';
  if (n <= 50) return 'long';
  return 'very-long';
}

function contentSet(text) {
  return new Set(words(text).filter((w) => w.length > 2 && !FUNCTION_WORD_SET.has(w) && !EXTRA_STOPWORDS.has(w)));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function oneLine(s, max) {
  const t = s.replace(/\s*\n\s*/g, ' / ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Format one turn (array of records from the same reply burst). */
export function formatEntry(turn) {
  const recs = Array.isArray(turn) ? turn : [turn];
  const first = recs[0];
  const date = first.ts ? first.ts.slice(0, 10) : 'no date';
  const ids = recs.map((r) => r.id).join(', ');
  const ctxRec = recs.find((r) => r.context);
  const ctx = ctxRec ? `\n> them: ${oneLine(ctxRec.context, 240)}` : '';
  const lines = recs.map((r) => `me: ${r.text.replace(/\n/g, '\n    ')}`).join('\n');
  return `[${ids}] ${first.source}, ${date}${ctx}\n${lines}\n`;
}

/**
 * Choose a varied sample of turns: stratify by (source, length bucket), visit
 * strata round-robin in seeded order, prefer turns with context, skip near-duplicates.
 */
export function selectSample(train, { maxChars = 60000, seed = 'selfclone', exclude = new Set() } = {}) {
  const rand = rng(`${seed}:pack`);
  const strata = new Map();
  for (const unsorted of groupTurns(train).values()) {
    const recs = unsorted.filter((r) => !exclude.has(r.id) && !exclude.has(r.text.trim().toLowerCase()));
    if (!recs.length) continue;
    recs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const text = recs.map((r) => r.text).join('\n');
    const key = `${recs[0].source}|${lengthBucket(words(text).length)}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(recs);
  }
  const hasCtx = (t) => t.some((r) => r.context);
  const queues = [...strata.keys()].sort().map((k) => {
    const list = strata.get(k);
    return [...shuffle(list.filter(hasCtx), rand), ...shuffle(list.filter((t) => !hasCtx(t)), rand)];
  });
  const order = shuffle(queues.map((_, i) => i), rand);
  const chosen = [];
  const sets = [];
  let used = 0;
  let progress = true;
  while (progress && used < maxChars) {
    progress = false;
    for (const qi of order) {
      const q = queues[qi];
      while (q.length) {
        const t = q.shift();
        const cs = contentSet(t.map((r) => r.text).join(' '));
        if (cs.size >= 3 && sets.some((s) => jaccard(s, cs) > 0.8)) continue;
        const entry = formatEntry(t);
        if (used + entry.length > maxChars) {
          q.length = 0;
          break;
        }
        chosen.push(t);
        sets.push(cs);
        used += entry.length;
        progress = true;
        break;
      }
    }
  }
  // Present in date order so the reader sees conversations unfold naturally.
  chosen.sort((a, b) => String(a[0].ts).localeCompare(String(b[0].ts)));
  return chosen;
}

export function buildPack({ train, sealed = [], fp, name, maxChars = 60000, seed = 'selfclone' }) {
  const sealedIds = new Set(sealed.flatMap((s) => s.ids));
  const exclude = new Set([...sealedIds]);
  // Also exclude any train message whose exact text equals a sealed reply line (common short replies).
  for (const s of sealed) for (const line of s.reply.split('\n')) exclude.add(line.trim().toLowerCase());
  const header = [
    `# Distill Pack: ${name}`,
    '',
    'This file is what Claude reads to distill the persona. It holds the style fingerprint and a',
    'stratified sample of TRAINING turns. Sealed test messages are never included, so the fidelity',
    'score stays honest. Each turn shows the message ids (cite them as evidence), the source, the date,',
    'what the other person said just before (when known) and every message sent back, one per line.',
    '',
  ].join('\n');
  const fpMd = fingerprintMarkdown(fp, { name }).replace(/^# .*\n/, '## Fingerprint Summary\n');
  const budget = Math.max(2000, maxChars - header.length - fpMd.length - 200);
  const turns = selectSample(train, { maxChars: budget, seed, exclude });
  const sample = turns.flat();
  const bySource = {};
  for (const r of sample) bySource[r.source] = (bySource[r.source] || 0) + 1;
  const body = [
    header,
    fpMd,
    '## Sample Turns',
    '',
    `${turns.length} turns (${sample.length} of ${train.length} training messages), by source: ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    '',
    ...turns.map(formatEntry),
  ].join('\n');
  const cited = new Set();
  for (const m of body.matchAll(/^\[([^\]\n]+)\] /gm)) for (const id of m[1].split(', ')) cited.add(id);
  for (const id of sealedIds) if (cited.has(id)) throw new Error(`Sealed message ${id} leaked into the pack`);
  return { markdown: body, sample, turns };
}
