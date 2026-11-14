// voice-profile.v1.json: built from the training split only, schema-validated, deterministic, numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildProfile, PROFILE_FEATURES, featureVector, channelEstimate } from '../../src/profile/build.mjs';
import { channelOf } from '../../src/profile/channels.mjs';
import { validateNamed, stableStringify, canonicalJson } from '../../src/schema.mjs';
import { readJsonl } from '../../src/util.mjs';
import { score, parseReplies } from '../../src/score.mjs';
import { run, records, maintainerWorkspace, ROOT } from './next-helpers.mjs';

const ws = maintainerWorkspace();
const profFile = path.join(ws, '.selfclone', 'voice-profile.v1.json');

test('profile build: writes a schema-valid profile from the training split, with every channel', () => {
  const p = JSON.parse(fs.readFileSync(profFile, 'utf8'));
  assert.deepEqual(validateNamed(p, 'voice-profile.v1.schema.json'), []);
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.source.sealedMessagesRead, false);
  assert.match(p.source.trainingDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(p.source.consentRecordId, /^consent-[0-9a-f]{12}$/);
  const train = readJsonl(path.join(ws, '.selfclone', 'train.jsonl'));
  assert.equal(p.source.trainMessages, train.length);
  assert.deepEqual(Object.keys(p.channels).sort(), ['changelog', 'dev', 'docs', 'email', 'message', 'post', 'pr']);
  assert.equal(Object.values(p.channels).reduce((a, c) => a + c.messageCount, 0), train.length);
  assert.deepEqual(Object.keys(p.global.features).sort(), PROFILE_FEATURES.slice().sort());
});

test('profile build: no message text, ids, URLs, thread names or authors in the profile', () => {
  const text = fs.readFileSync(profFile, 'utf8');
  const train = readJsonl(path.join(ws, '.selfclone', 'train.jsonl'));
  for (const r of train) {
    assert.ok(!text.includes(r.id), `record id ${r.id} leaked`);
    for (const piece of r.text.split(/[\n.,;!?]/).map((s) => s.trim()).filter((s) => s.length >= 16)) assert.ok(!text.includes(piece), `text leaked: ${piece}`);
  }
  for (const s of ['http', '@', 'jsonl:', 'Sam Rivera', 'Jordan', 'export.jsonl', '"thread"', 'dev-0']) assert.ok(!text.includes(s), `${s} in profile`);
});

test('profile build: byte-identical on a second run, and independent of record order', () => {
  const before = fs.readFileSync(profFile, 'utf8');
  const r = run(['profile', 'build', '--out', 'again.json'], ws);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(ws, 'again.json'), 'utf8'), before);
  const train = readJsonl(path.join(ws, '.selfclone', 'train.jsonl'));
  const a = buildProfile(train, { consentRecordId: null }).profile;
  const b = buildProfile(train.slice().reverse(), { consentRecordId: null }).profile;
  assert.equal(a.source.trainingDigest, b.source.trainingDigest);
  assert.equal(stableStringify(a.global), stableStringify(b.global));
});

test('profile build: never opens sealed.jsonl (a sealed.jsonl that cannot be read does not matter)', () => {
  const cwd = maintainerWorkspace({ profile: false });
  const sealed = path.join(cwd, '.selfclone', 'sealed.jsonl');
  const ids = readJsonl(sealed).flatMap((s) => s.ids);
  fs.rmSync(sealed);
  fs.mkdirSync(sealed); // reading it now throws EISDIR
  const r = run(['profile', 'build', '--json'], cwd);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = fs.readFileSync(path.join(cwd, '.selfclone', 'voice-profile.v1.json'), 'utf8');
  for (const id of ids) assert.ok(!text.includes(id));
});

test('profile build: refuses without consent, and after consent is revoked (exit 2, with a fix)', () => {
  const cwd = maintainerWorkspace({ consent: null, profile: false });
  const r = run(['profile', 'build'], cwd);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No consent recorded/);
  assert.match(r.stderr, /Fix: .*selfclone consent --grant/);
  const j = run(['profile', 'build', '--json'], cwd);
  assert.equal(j.status, 2);
  assert.equal(JSON.parse(j.stdout).error.code, 'E_CONSENT');
  assert.equal(run(['profile', 'build', '--consent', 'This is my own writing. Sam Rivera'], cwd).status, 0);
  assert.equal(run(['consent', '--revoke', 'local-lint'], cwd).status, 0);
  const again = run(['profile', 'build', '--json'], cwd);
  assert.equal(again.status, 2);
  assert.match(JSON.parse(again.stdout).error.message, /revoked/);
});

test('profile build: missing training split is exit 2 with a fix', () => {
  const r = run(['profile', 'build', '--dir', 'nowhere', '--consent', 'This is my own writing. Test'], ws);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Run selfclone ingest/);
});

test('channel fallback at 0, 29, 30, 99 and 100 messages', () => {
  const dev = records(200, { channel: 'dev', threads: 40, text: (i) => `quick dev note ${i} about the build` });
  const mk = (n) => buildProfile([...dev, ...records(n, { channel: 'docs', threads: 12, text: (i) => `The documentation explains step ${i} clearly and completely.` })]).profile;
  assert.equal(mk(0).channels.docs, undefined);
  const p29 = mk(29).channels.docs;
  assert.equal(p29.confidence, 'low');
  assert.equal(p29.fallback, 'dev');
  assert.equal(p29.shrinkWeight, Math.round((29 / 79) * 1e4) / 1e4);
  // Shrinkage: the estimate lies between the channel's own value and its parent's.
  const own = featureVector(records(29, { channel: 'docs', threads: 12, text: (i) => `The documentation explains step ${i} clearly and completely.` }));
  const parent = mk(29).channels.dev.features;
  assert.ok(p29.features.medianWords > Math.min(own.medianWords, parent.medianWords) && p29.features.medianWords < Math.max(own.medianWords, parent.medianWords));
  const p30 = mk(30).channels.docs;
  assert.deepEqual([p30.confidence, p30.fallback, p30.shrinkWeight], ['medium', null, null]);
  assert.equal(mk(99).channels.docs.confidence, 'medium');
  assert.equal(mk(100).channels.docs.confidence, 'high');
  // Too few conversations backs off too, even with many messages.
  const few = buildProfile([...dev, ...records(120, { channel: 'docs', threads: 5 })]).profile.channels.docs;
  assert.equal(few.fallback, 'dev');
  // Without a dev channel, docs backs off to all writing.
  const alone = buildProfile(records(20, { channel: 'docs', threads: 4 })).profile.channels.docs;
  assert.equal(alone.fallback, 'global');
  assert.equal(channelEstimate(buildProfile(dev).profile, 'pr').id, 'dev');
});

test('channelOf: explicit register, file names for notes, source kinds otherwise', () => {
  assert.equal(channelOf({ source: 'jsonl', register: 'pr' }), 'pr');
  assert.equal(channelOf({ source: 'jsonl', register: 'nonsense' }), 'message');
  assert.equal(channelOf({ source: 'text', thread: 'text:CHANGELOG.md' }), 'changelog');
  assert.equal(channelOf({ source: 'text', thread: 'text:README.md' }), 'docs');
  assert.equal(channelOf({ source: 'text', thread: 'text:notes.md' }), 'post');
  assert.equal(channelOf({ source: 'mbox' }), 'email');
  assert.equal(channelOf({ source: 'whatsapp' }), 'message');
});

test('schema: rejects a profile with a text sample, an unknown channel or sealedMessagesRead true', () => {
  const p = JSON.parse(fs.readFileSync(profFile, 'utf8'));
  const bad1 = { ...p, samples: ['hello'] };
  const bad2 = { ...p, channels: { ...p.channels, sms: p.channels.dev } };
  const bad3 = { ...p, source: { ...p.source, sealedMessagesRead: true } };
  const bad4 = { ...p, global: { ...p.global, features: { ...p.global.features, example: 'text' } } };
  for (const b of [bad1, bad2, bad3, bad4]) assert.ok(validateNamed(b, 'voice-profile.v1.schema.json').length > 0);
});

test('canonical JSON sorts keys and normalises Unicode', () => {
  assert.equal(canonicalJson({ b: 1, a: 'é' }), canonicalJson({ a: 'é', b: 1 }));
});

test('Maya golden: the baseline score is unchanged (89% clone, 41% bare, 99% own replies)', () => {
  const W = path.join(ROOT, 'examples', 'maya', 'workspace');
  const train = readJsonl(path.join(W, 'train.jsonl'));
  const sealed = readJsonl(path.join(W, 'sealed.jsonl'));
  const clone = parseReplies(fs.readFileSync(path.join(W, 'clone-replies.json'), 'utf8'));
  const bare = parseReplies(fs.readFileSync(path.join(W, 'bare-replies.json'), 'utf8'));
  const r = score({ train, sealed, clone, bare, seed: 'selfclone' });
  assert.deepEqual([Math.round(r.sets.clone.styleMatch), Math.round(r.sets.bare.styleMatch), Math.round(r.sets.real.styleMatch)], [89, 41, 99]);
});
