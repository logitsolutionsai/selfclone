import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { voicecheck, voicecheckText, draftUnits, kindOf, LOW_WORDS, MIN_KIND_UNITS } from '../../src/voicecheck.mjs';
import { synthRecords, synthTexts } from './synth.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'selfclone.mjs');
const train = synthRecords('casual', 400, 'vc-train').map((r) => ({ ...r, source: 'whatsapp' }));

test('voicecheck: same-author held-out text scores high, a different author scores low', () => {
  for (const k of [5, 10, 20]) {
    const same = voicecheck({ train, draft: synthTexts('casual', k, `vc-same-${k}`), kind: 'message' });
    const other = voicecheck({ train, draft: synthTexts('formal', k, `vc-other-${k}`), kind: 'message' });
    assert.ok(same.voiceMatch >= 80, `k=${k}: same author ${same.voiceMatch}`);
    assert.ok(other.voiceMatch <= 30, `k=${k}: other author ${other.voiceMatch}`);
    assert.equal(same.reference.kind, 'message');
  }
  // One longer formal paragraph, as one draft.
  const para = 'Thank you for the update. I have reviewed the document carefully; however, the budget section requires a more careful analysis before we commit. I would recommend that we schedule a meeting with the whole team on Thursday afternoon. Please note that the figures in the second table do not match the summary.';
  const r = voicecheck({ train, draft: para, kind: 'message' });
  assert.ok(r.voiceMatch <= 30, `formal paragraph ${r.voiceMatch}`);
  assert.notEqual(r.confidence, 'low');
});

test('voicecheck: planted deviations come back as concrete instructions', () => {
  const base = synthTexts('casual', 6, 'vc-plant');
  // Capitals, semicolons and final full stops planted on a casual author's own text.
  const planted = base.map((t, i) => `${t[0].toUpperCase()}${t.slice(1)}; ${i % 2 ? 'indeed' : 'however'} it is fine.`);
  const r = voicecheck({ train, draft: planted.join('\n'), kind: 'message' });
  const all = r.advice.map((a) => a.instruction).join('\n');
  assert.match(all, /You use no semicolons; this has 6\. Take them out\./);
  assert.match(all, /lowercase; this draft starts 6 of 6 lines with a capital/);
  assert.match(all, /end in punctuation; this draft ends 6 of 6 lines with one/);
  assert.ok(r.drifts.every((d) => d.z === null || Math.abs(d.z) >= 2), 'only real drifts are listed');
  assert.ok(r.drifts.length <= 26);

  // A much longer reply than usual.
  const long = synthTexts('casual', 12, 'vc-long').join(' and ');
  const rl = voicecheck({ train, draft: long, kind: 'message' });
  assert.ok(rl.advice.some((a) => /Your typical reply is \d+ words .*this draft is \d+\. Cut it down\./.test(a.instruction)), rl.advice.map((a) => a.instruction).join('\n'));

  // Apostrophes kept by someone who drops them.
  const apos = voicecheck({ train, draft: "I'm not sure that's right, I don't think it's what we said and I can't make it today, I'm sorry", kind: 'message' });
  assert.ok(apos.advice.some((a) => /without the apostrophe .*\(i'm, that's, don't, it's\)/.test(a.instruction)), apos.advice.map((a) => a.instruction).join('\n'));
});

test('voicecheck: signature habits are suggested gently and never forced; a crammed draft is called out', () => {
  const plain = voicecheck({ train, draft: 'i went to the shop and got some bread and then i went home to sleep', kind: 'message' });
  const ph = plain.advice.find((a) => a.feature === 'phrases');
  assert.ok(ph, 'the missing habits are mentioned');
  assert.match(ph.instruction, /You often write "[^"]+"/);
  assert.match(ph.instruction, /Do not force them in\./);
  const crammed = voicecheck({ train, draft: 'lol omg tbh im down fr lol idk haha', kind: 'message' });
  assert.ok(!crammed.advice.some((a) => a.feature === 'phrases'));
  // Shorthand the user never writes is flagged.
  const foreign = voicecheck({ train, draft: 'lmao that is so true smh, ngl i would go', kind: 'message' });
  assert.ok(foreign.advice.some((a) => a.feature === 'foreign-shorthand' && /never use "lmao"/.test(a.instruction)));
});

test('voicecheck: short text is marked low confidence', () => {
  const r = voicecheck({ train, draft: 'see u there', kind: 'message' });
  assert.equal(r.confidence, 'low');
  assert.match(r.confidenceNote, /^Low confidence: 3 words\. A text this short cannot be scored reliably/);
  assert.equal(r.verdict, 'Too short to judge reliably.');
  const text = voicecheckText(r);
  assert.match(text, /Low confidence/);
  const longer = voicecheck({ train, draft: synthTexts('casual', 12, 'vc-conf'), kind: 'message' });
  assert.ok(longer.draft.words >= LOW_WORDS);
  assert.notEqual(longer.confidence, 'low');
  assert.throws(() => voicecheck({ train, draft: '   ', kind: 'message' }), /empty/);
  assert.throws(() => voicecheck({ train, draft: 'x', kind: 'tweet' }), /--as must be one of/);
});

test('voicecheck: compares against the fingerprint of the matching kind of writing, else the whole corpus', () => {
  const chat = synthRecords('casual', 200, 'vc-chat').map((r) => ({ ...r, source: 'slack' }));
  const mail = synthRecords('formal', 60, 'vc-mail').map((r) => ({ ...r, source: 'mbox', id: `em-${r.id}`, turn: `t-em-${r.id}` }));
  const both = [...chat, ...mail];
  const email = synthTexts('formal', 1, 'vc-email-draft')[0] + ' ' + synthTexts('formal', 1, 'vc-email-draft2')[0];
  const asEmail = voicecheck({ train: both, draft: email, kind: 'email' });
  const asMessage = voicecheck({ train: both, draft: email, kind: 'message' });
  assert.equal(asEmail.reference.kind, 'email');
  assert.equal(asEmail.reference.messages, 60);
  assert.equal(asMessage.reference.kind, 'message');
  assert.ok(asEmail.voiceMatch >= 80, `formal draft against formal email ${asEmail.voiceMatch}`);
  assert.ok(asMessage.voiceMatch <= 30, `formal draft against casual chat ${asMessage.voiceMatch}`);
  assert.ok(asEmail.voiceMatch > asMessage.voiceMatch + 50);

  // Too few emails: fall back to everything, and say so.
  const few = [...chat, ...mail.slice(0, MIN_KIND_UNITS - 10)];
  const fb = voicecheck({ train: few, draft: email, kind: 'email' });
  assert.equal(fb.reference.kind, 'all');
  assert.match(fb.reference.fallback, /fewer than 30.*compared against all your writing instead/);

  // No --as: the kind with the most writing.
  assert.equal(voicecheck({ train: both, draft: 'ok see u there lol' }).kind, 'message');
  assert.equal(kindOf('mbox'), 'email');
  assert.equal(kindOf('x'), 'post');
  assert.equal(kindOf('discord'), 'message');
  assert.equal(kindOf('something-new'), 'message');
});

test('voicecheck: posts are compared paragraph by paragraph; --- separates several drafts', () => {
  assert.deepEqual(draftUnits('one\n\ntwo\nmore\n\n\nthree', 'post'), ['one', 'two\nmore', 'three']);
  assert.deepEqual(draftUnits('a\nb\n---\nc', 'message'), ['a\nb', 'c']);
  assert.deepEqual(draftUnits('a\n\nb', 'email'), ['a\n\nb']);
  assert.deepEqual(draftUnits(['x', ' ', 'y'], 'message'), ['x', 'y']);
});

test('CLI: voicecheck reads a file or stdin, prints JSON, and --min sets the exit code', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-vc-'));
  const ws = path.join(cwd, '.selfclone');
  fs.mkdirSync(ws);
  fs.writeFileSync(path.join(ws, 'train.jsonl'), train.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(ws, 'ingest.json'), JSON.stringify({ name: 'Casey Test' }));
  const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', input });
  const formal = synthTexts('formal', 4, 'vc-cli').join(' ');
  const r = run(['voicecheck', '-', '--json'], formal);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.voiceMatch <= 30);
  assert.ok(Array.isArray(j.advice) && j.advice.length);
  assert.ok(['low', 'medium', 'high'].includes(j.confidence));
  const low = run(['voicecheck', '-', '--min', '80'], formal);
  assert.equal(low.status, 2);
  assert.match(low.stdout, /^Voice match \d+% against Casey Test/);
  assert.match(low.stdout, /To sound more like you:/);
  fs.writeFileSync(path.join(cwd, 'replies.json'), JSON.stringify(synthTexts('casual', 10, 'vc-cli-set').map((reply, i) => ({ id: `p${i}`, reply }))));
  const set = run(['voicecheck', 'replies.json', '--json']);
  assert.equal(set.status, 0, set.stderr);
  assert.equal(JSON.parse(set.stdout).draft.units, 10);
  assert.ok(JSON.parse(set.stdout).voiceMatch >= 80);
  assert.equal(run(['voicecheck', '-', '--as', 'tweet'], 'x').status, 1);
  assert.equal(run(['voicecheck']).status, 1);
});

test('fingerprint: habits per kind of writing only when two kinds have enough messages', async () => {
  const { fingerprint, fingerprintMarkdown } = await import('../../src/fingerprint.mjs');
  const chat = synthRecords('casual', 80, 'fp-chat').map((r) => ({ ...r, source: 'whatsapp' }));
  const mail = synthRecords('formal', 20, 'fp-mail').map((r) => ({ ...r, source: 'mbox' }));
  const fp = fingerprint([...chat, ...mail]);
  assert.deepEqual(Object.keys(fp.byKind), ['message', 'email']);
  assert.equal(fp.byKind.email.messages, 20);
  assert.ok(fp.byKind.message.lowercaseStartRate > 0.9 && fp.byKind.email.lowercaseStartRate < 0.1);
  assert.ok(fp.byKind.email.lengthWords.median > fp.byKind.message.lengthWords.median);
  assert.match(fingerprintMarkdown(fp, { name: 'T' }), /## By Kind Of Writing[\s\S]*\| Email \(mbox 20\) \| 20 \|/);
  const one = fingerprint(chat);
  assert.equal(one.byKind, undefined);
  assert.doesNotMatch(fingerprintMarkdown(one), /By Kind Of Writing/);
  assert.equal(fingerprint([...chat, ...mail.slice(0, 5)]).byKind, undefined, 'five emails are too few');
});
