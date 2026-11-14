// Deterministic, seeded train / sealed split.
// Only turns that answer someone (they have context) can be sealed. A whole
// turn goes to one side, so no part of a sealed reply leaks into training.
import { hashUnit, sha1, sha256 } from './util.mjs';
import { tokenCount } from './text.mjs';

export function groupTurns(records) {
  const turns = new Map();
  for (const r of records) {
    const key = r.turn || r.id;
    if (!turns.has(key)) turns.set(key, []);
    turns.get(key).push(r);
  }
  return turns;
}

export function sealedCountFor(totalTurns, eligible, { fraction = 0.15, minSealed = 20 } = {}) {
  const target = Math.max(Math.min(minSealed, Math.floor(0.4 * totalTurns)), Math.round(fraction * totalTurns));
  return Math.min(eligible, target);
}

/**
 * True when a line of this reply shows up in some message's context. That happens when
 * the user's own words are the context of a later message: a self-thread on X, a Slack
 * thread the user started, an email quoting the user's earlier mail. Such a reply cannot
 * be sealed, because the distill pack or another test prompt would show it.
 */
function quotedElsewhere(recs, contexts) {
  for (const r of recs) {
    for (const line of r.text.split('\n')) {
      const t = line.trim();
      if (t.length >= 12 && contexts.includes(t)) return true;
    }
  }
  return false;
}

export function split(records, { seed = 'selfclone', fraction = 0.15, minSealed = 20 } = {}) {
  const turns = groupTurns(records);
  const contexts = records.map((r) => r.context || '').filter(Boolean).join('\n\u0000\n');
  const eligible = [];
  for (const [turn, unsorted] of turns) {
    // Order within a turn by time (stable for ties), so input order does not matter.
    const recs = unsorted.slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const withContext = recs.find((r) => r.context && r.context.trim());
    if (!withContext) continue;
    const reply = recs.map((r) => r.text).join('\n');
    if (tokenCount(reply) < 3) continue;
    if (quotedElsewhere(recs, contexts)) continue;
    eligible.push({ turn, recs, reply, context: withContext.context });
  }
  const n = sealedCountFor(turns.size, eligible.length, { fraction, minSealed });
  eligible.sort((a, b) => hashUnit(`${seed}:${a.turn}`) - hashUnit(`${seed}:${b.turn}`) || a.turn.localeCompare(b.turn));
  const chosen = eligible.slice(0, n);
  const sealedTurns = new Set(chosen.map((c) => c.turn));
  const sealed = chosen.map((c) => ({
    id: `s-${sha1(`${seed}:${c.turn}`).slice(0, 8)}`,
    turn: c.turn,
    source: c.recs[0].source,
    ts: c.recs[0].ts,
    context: c.context,
    reply: c.reply,
    ids: c.recs.map((r) => r.id),
  }));
  const train = records.filter((r) => !sealedTurns.has(r.turn || r.id));
  const sealedText = sealed.map((s) => JSON.stringify(s)).join('\n');
  const meta = {
    seed,
    fraction,
    minSealed,
    records: records.length,
    turns: turns.size,
    eligiblePairs: eligible.length,
    sealedPairs: sealed.length,
    sealedMessages: sealed.reduce((a, s) => a + s.ids.length, 0),
    trainMessages: train.length,
    sealedSha256: sha256(sealedText),
    sealedAt: new Date().toISOString(),
  };
  return { train, sealed, meta };
}

export function sealedDigest(sealed) {
  return sha256(sealed.map((s) => JSON.stringify(s)).join('\n'));
}
