// End to end on the synthetic maintainer corpus (700 messages, seven channels, timestamps and thread ids):
// ingest, fingerprint, pack, profile build, stylecard, lint in every format, drift, kit init and check.
// Then the golden baseline on Maya: the game page, voicecheck and export are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run, tmp, FIXTURE, ROOT } from './next-helpers.mjs';
import { buildRounds, gameHtml } from '../../src/game.mjs';
import { readJsonl } from '../../src/util.mjs';
import { parseReplies } from '../../src/score.mjs';
import { validateNamed } from '../../src/schema.mjs';

test('integration: every new command end to end on the synthetic corpus, beside the original pipeline', () => {
  const cwd = tmp('integ');
  const ok = (args) => {
    const r = run(args, cwd);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}${r.stdout}`);
    return r.stdout;
  };
  assert.match(ok(['ingest', path.join(FIXTURE, 'export.jsonl'), '--me', 'Sam Rivera']), /Ingested 700 of your messages/);
  ok(['fingerprint']);
  ok(['pack']);
  assert.ok(!fs.readFileSync(path.join(cwd, '.selfclone', 'distill-pack.md'), 'utf8').includes('sealed'), 'the pack still says nothing about sealed content');
  ok(['consent', '--grant', 'This is my own writing. Sam Rivera', '--scope', 'local-lint,public-stylecard']);
  const prof = JSON.parse(ok(['profile', 'build', '--json']));
  assert.equal(prof.trainMessages, readJsonl(path.join(cwd, '.selfclone', 'train.jsonl')).length);
  assert.equal(Object.keys(prof.channels).length, 7);
  const card = JSON.parse(ok(['stylecard', '--audience', 'public', '--json']));
  assert.equal(card.status, 'ok');
  assert.deepEqual(validateNamed(JSON.parse(fs.readFileSync(path.join(cwd, 'out', 'passport', 'passport.json'), 'utf8')), 'passport.v1.schema.json'), []);
  fs.mkdirSync(path.join(cwd, 'repo'));
  fs.cpSync(path.join(FIXTURE, 'repo'), path.join(cwd, 'repo'), { recursive: true });
  ok(['kit', 'init', '--target', 'repo', '--profile']);
  const policy = 'repo/.selfclone-kit/voice-policy.json';
  const text = ok(['lint', 'repo', '--root', 'repo', '--policy', policy, '--profile']);
  assert.match(text, /files? scanned/);
  const json = JSON.parse(ok(['lint', 'repo', '--root', 'repo', '--policy', policy, '--profile', '--json']));
  assert.deepEqual(validateNamed(json, 'lint-report.v1.schema.json'), []);
  assert.ok(json.findings.some((f) => f.kind === 'policy') && json.findings.some((f) => f.kind === 'style'));
  const sarif = JSON.parse(ok(['lint', 'repo', '--root', 'repo', '--policy', policy, '--format', 'sarif']));
  assert.equal(sarif.runs[0].results.length, json.findings.filter((f) => f.kind === 'policy').length);
  const d = JSON.parse(ok(['drift', '--before', '2026-01-01..2026-04-30', '--after', '2026-05-01..2026-08-31', '--channel', 'dev', '--json']));
  assert.equal(d.status, 'ok');
  assert.ok(d.windows.before.messages >= 100 && d.windows.after.messages >= 100);
  const check = JSON.parse(ok(['kit', 'check', '--target', 'repo', '--json']));
  assert.equal(check.status, 'ok');
  assert.match(ok(['status']), /train\.jsonl/);
});

test('golden: the Maya game page, voicecheck and export are unchanged', () => {
  const W = path.join(ROOT, 'examples', 'maya', 'workspace');
  const rounds = buildRounds({ sealed: readJsonl(path.join(W, 'sealed.jsonl')), clone: parseReplies(fs.readFileSync(path.join(W, 'clone-replies.json'), 'utf8')), rounds: 10, seed: 'selfclone' });
  assert.equal(gameHtml({ rounds, name: 'Maya Okafor' }), fs.readFileSync(path.join(W, 'can-you-tell.html'), 'utf8'));
  const cwd = tmp('golden');
  fs.cpSync(W, path.join(cwd, '.selfclone'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'draft.txt'), 'Thank you for your message. I will review the document and respond by Friday.');
  const v = run(['voicecheck', 'draft.txt', '--as', 'message', '--json'], cwd);
  assert.equal(v.status, 0, v.stderr);
  const r = JSON.parse(v.stdout);
  assert.equal(r.confidence, 'low');
  // Golden values from the unchanged scorer (src/voicecheck.mjs is not modified by this release).
  assert.equal(r.voiceMatch, 50);
  assert.equal(r.verdict, 'Too short to judge reliably.');
  fs.cpSync(path.join(ROOT, 'examples', 'maya', 'out'), path.join(cwd, 'out'), { recursive: true });
  const e = run(['export', '--to', 'chatgpt'], cwd);
  assert.equal(e.status, 0, e.stderr);
  const exp = fs.readFileSync(path.join(cwd, 'out', 'maya-okafor-clone', 'export', 'chatgpt-instructions.md'), 'utf8');
  assert.equal(exp, fs.readFileSync(path.join(ROOT, 'examples', 'maya', 'out', 'maya-okafor-clone', 'export', 'chatgpt-instructions.md'), 'utf8'));
});
