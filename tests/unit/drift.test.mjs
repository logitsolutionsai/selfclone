// Voice Drift: non-overlapping windows of the training split, conversation-level bootstrap with a fixed
// seed, practical thresholds, and insufficient_data as a successful result with no numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drift, parseWindow, ROUNDS } from '../../src/drift/drift.mjs';
import { run, records, maintainerWorkspace } from './next-helpers.mjs';
import { quantile } from '../../src/util.mjs';
import { readJsonl } from '../../src/util.mjs';
import path from 'node:path';

const ws = maintainerWorkspace({ profile: false });
const train = readJsonl(path.join(ws, '.selfclone', 'train.jsonl'));
const B = parseWindow('2026-01-01..2026-04-30', '--before');
const A = parseWindow('2026-05-01..2026-08-31', '--after');

test('drift on the synthetic corpus finds the planted change in developer writing, with intervals', () => {
  const r = drift(train, { before: B, after: A, channel: 'dev' });
  assert.equal(r.status, 'ok');
  assert.equal(r.rounds, ROUNDS);
  const f = Object.fromEntries(r.features.map((x) => [x.feature, x]));
  assert.equal(f.medianWords.flagged, true);
  assert.equal(f.medianWords.direction, 'up');
  assert.equal(f.lowercaseStartRate.direction, 'up');
  for (const x of r.features) {
    assert.ok(x.ci95[0] <= x.ci95[1]);
    if (x.flagged) assert.ok(Math.abs(x.change) >= x.threshold && (x.ci95[0] > 0 || x.ci95[1] < 0));
  }
  assert.equal(r.features.length, 12, 'every tested feature is reported');
  assert.match(r.note, /Exploratory/);
  assert.match(r.note, /no change is statistically certain/);
});

test('drift is deterministic for a fixed seed; point estimates do not depend on the seed', () => {
  const a = drift(train, { before: B, after: A, channel: 'dev' });
  const b = drift(train, { before: B, after: A, channel: 'dev' });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = drift(train, { before: B, after: A, channel: 'dev', seed: 'other' });
  assert.deepEqual(c.features.map((x) => x.change), a.features.map((x) => x.change));
});

test('the bootstrap median from histograms equals util.quantile on the messages', () => {
  // With one conversation per message the bootstrap is the plain point estimate: compare the point estimate.
  const recs = [...records(120, { channel: 'dev', threads: 30, start: Date.UTC(2026, 0, 2), text: (i) => 'word '.repeat(1 + (i % 7)).trim() }), ...records(120, { channel: 'dev', threads: 30, start: Date.UTC(2026, 5, 2), text: (i) => 'word '.repeat(2 + (i % 9)).trim() })];
  const r = drift(recs, { before: parseWindow('2026-01-01..2026-03-31', 'b'), after: parseWindow('2026-06-01..2026-08-31', 'a'), channel: 'dev', rounds: 50 });
  assert.equal(r.status, 'ok', JSON.stringify(r.warnings));
  const med = (from, to) => quantile(recs.filter((x) => x.ts >= from && x.ts <= to).map((x) => x.text.split(' ').length), 0.5);
  const f = r.features.find((x) => x.feature === 'medianWords');
  assert.equal(f.before, med('2026-01-01', '2026-04-01'));
  assert.equal(f.after, med('2026-06-01', '2026-09-01'));
});

test('insufficient data is a successful result with a warning and no numbers', () => {
  const r = drift(train, { before: parseWindow('2026-01-01..2026-01-31', 'b'), after: A, channel: 'pr' });
  assert.equal(r.status, 'insufficient_data');
  assert.deepEqual(r.features, []);
  assert.match(r.warnings[0], /needs 100/);
  const cli = run(['drift', '--before', '2026-01-01..2026-01-31', '--after', '2026-05-01..2026-08-31', '--channel', 'pr', '--json'], ws);
  assert.equal(cli.status, 0);
  assert.equal(JSON.parse(cli.stdout).status, 'insufficient_data');
});

test('overlapping, malformed or reversed windows are rejected with exit 2', () => {
  assert.throws(() => drift(train, { before: parseWindow('2026-01-01..2026-05-01', 'b'), after: A }), (e) => e.code === 'E_DRIFT_OVERLAP');
  const j = run(['drift', '--before', '2026-01-01..2026-05-01', '--after', '2026-05-01..2026-08-31', '--json'], ws);
  assert.equal(j.status, 2);
  assert.equal(JSON.parse(j.stdout).error.code, 'E_DRIFT_OVERLAP');
  assert.equal(run(['drift', '--before', '2026-01-01', '--after', '2026-05-01..2026-08-31'], ws).status, 2);
  assert.equal(run(['drift', '--before', '2026-04-30..2026-01-01', '--after', '2026-05-01..2026-08-31'], ws).status, 2);
  assert.equal(run(['drift', '--before', '2026-01-01..2026-04-30', '--after', '2026-05-01..2026-08-31', '--channel', 'sms'], ws).status, 2);
});

test('drift needs consent and reads only the training split', () => {
  const noConsent = maintainerWorkspace({ consent: null, profile: false });
  const r = run(['drift', '--before', '2026-01-01..2026-04-30', '--after', '2026-05-01..2026-08-31', '--json'], noConsent);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'E_CONSENT');
  const sealedIds = new Set(readJsonl(path.join(ws, '.selfclone', 'sealed.jsonl')).flatMap((s) => s.ids));
  assert.ok(!train.some((t) => sealedIds.has(t.id)), 'the training split holds no sealed message');
  const md = run(['drift', '--before', '2026-01-01..2026-04-30', '--after', '2026-05-01..2026-08-31', '--channel', 'dev'], ws);
  assert.equal(md.status, 0);
  assert.match(md.stdout, /\| Median words per message \| 9 \| 22 \|/);
});
