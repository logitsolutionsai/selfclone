// Maintainer Voice Kit (kit init, kit check) and the voice delta (E_FACT_PRESERVATION).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitInit, kitCheck, KIT_FILES } from '../../src/kit/cli.mjs';
import { voiceDelta, lineDiff } from '../../src/kit/delta.mjs';
import { run, tmp, ROOT, maintainerWorkspace } from './next-helpers.mjs';
import { readJsonl } from '../../src/util.mjs';

const EX = path.join(ROOT, 'examples', 'maintainer-voice');
const kitFile = (repo, rel) => path.join(repo, '.selfclone-kit', ...rel.split('/'));
const failing = (r) => r.checks.filter((c) => c.status === 'fail').map((c) => c.id);

test('kit init: creates every file, never overwrites, never touches AGENTS.md', () => {
  const repo = tmp('kit');
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Our rules\n');
  fs.mkdirSync(path.join(repo, '.selfclone-kit'));
  fs.writeFileSync(kitFile(repo, 'voice-policy.json'), '{"mine": true}\n');
  const r = kitInit(repo);
  assert.deepEqual(r.skipped, ['.selfclone-kit/voice-policy.json']);
  assert.equal(r.created.length, KIT_FILES.length - 1);
  assert.equal(fs.readFileSync(kitFile(repo, 'voice-policy.json'), 'utf8'), '{"mine": true}\n', 'an existing file is kept');
  assert.equal(fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf8'), '# Our rules\n');
  const again = kitInit(repo);
  assert.deepEqual(again.created, []);
  assert.equal(again.skipped.length, KIT_FILES.length);
});

test('kit check: a fresh kit passes every check; the CLI prints JSON and exits 0', () => {
  const repo = tmp('kitok');
  const init = run(['kit', 'init', '--target', '.', '--json'], repo);
  assert.equal(init.status, 0, init.stderr);
  const r = run(['kit', 'check', '--target', '.', '--json'], repo);
  assert.equal(r.status, 0, r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.status, 'ok');
  assert.deepEqual(j.checks.map((c) => c.id), ['kit-present', 'policy-schema', 'hard-rules', 'no-private-data', 'portability', 'workflow']);
  assert.equal(run(['kit', 'check', '--target', tmp('empty'), '--json'], repo).status, 1);
});

test('kit init --profile: the only profile-derived value is a rounded paragraph limit; no profile data in the kit', () => {
  const repo = tmp('kitprof');
  const r = run(['kit', 'init', '--target', '.', '--profile', path.join(EX, 'voice-profile.v1.json')], repo);
  assert.equal(r.status, 0, r.stderr);
  const policy = JSON.parse(fs.readFileSync(kitFile(repo, 'voice-policy.json'), 'utf8'));
  assert.equal(policy.rules.find((x) => x.id === 'short-paragraphs').maxWords % 25, 0);
  const all = KIT_FILES.map((f) => fs.readFileSync(kitFile(repo, f), 'utf8')).join('\n');
  const prof = JSON.parse(fs.readFileSync(path.join(EX, 'voice-profile.v1.json'), 'utf8'));
  assert.ok(!all.includes(prof.profileId));
  assert.ok(!all.includes(prof.source.trainingDigest));
  assert.ok(!/consent-[0-9a-f]{12}/.test(all));
});

test('kit check catches leaks, unsafe workflows, bad skills and an invalid policy', () => {
  const cases = [
    ['README.md', (t) => t + '\nContact sam@example.com\n', 'no-private-data'],
    ['README.md', (t) => t + '\nprofileId "0123456789abcdef0123" "profileId"\n', 'no-private-data'],
    ['README.md', (t) => t + '\nsha256:' + 'a'.repeat(64) + '\n', 'no-private-data'],
    ['README.md', (t) => t + '\nSee C:\\Users\\sam\\notes.md\n', 'no-private-data'],
    ['README.md', (t) => t + '\n![x](https://tracker.example.net/p.gif)\n', 'no-private-data'],
    ['README.md', (t) => t + '\nkey sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX\n', 'no-private-data'],
    ['voice-lint.workflow.yml.sample', (t) => t.replace('  pull_request:', '  pull_request_target:'), 'workflow'],
    ['voice-lint.workflow.yml.sample', (t) => t.replace(/^  contents: read$/m, '  contents: write'), 'workflow'],
    ['voice-lint.workflow.yml.sample', (t) => t + '      - run: echo ${{ secrets.TOKEN }}\n', 'workflow'],
    ['voice-lint.workflow.yml.sample', (t) => t + '      - run: cd pr && npm ci\n', 'workflow'],
    ['skills/maintainer-voice/SKILL.md', (t) => t.replace('name: maintainer-voice', 'name: Maintainer_Voice'), 'portability'],
    ['voice-policy.json', () => '{"schemaVersion":1,"name":"x","rules":[],"__proto__":{}}', 'policy-schema'],
    ['schemas/voice-policy.v1.schema.json', (t) => t.replace('"schemaVersion"', '"schemaversion"'), 'no-private-data'],
  ];
  for (const [rel, edit, check] of cases) {
    const repo = tmp('kitbad');
    kitInit(repo);
    const f = kitFile(repo, rel);
    fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(failing(kitCheck(repo)), [check], `${rel}: ${check}`);
  }
  // A workflow that is not disabled.
  const repo = tmp('kitwf');
  kitInit(repo);
  fs.renameSync(kitFile(repo, 'voice-lint.workflow.yml.sample'), kitFile(repo, 'voice-lint.yml'));
  assert.deepEqual(failing(kitCheck(repo)), ['workflow']);
});

test('kit check with a workspace: a line copied from the training split is a leak', () => {
  const ws = maintainerWorkspace({ profile: false });
  run(['kit', 'init', '--target', '.'], ws);
  const line = readJsonl(path.join(ws, '.selfclone', 'train.jsonl')).map((r) => r.text).find((t) => t.length >= 30);
  fs.appendFileSync(kitFile(ws, 'examples/review-reply.md'), `\n${line}\n`);
  const r = JSON.parse(run(['kit', 'check', '--target', '.', '--json'], ws).stdout);
  assert.deepEqual(r.checks.filter((c) => c.status === 'fail').map((c) => c.id), ['no-private-data']);
  assert.match(r.checks.find((c) => c.id === 'no-private-data').detail, /a line from the training split/);
});

test('voice delta: unchanged tokens pass; a changed, dropped or added token is E_FACT_PRESERVATION', () => {
  const before = fs.readFileSync(path.join(EX, 'release-note-before.md'), 'utf8');
  const ok = voiceDelta(before, fs.readFileSync(path.join(EX, 'release-note-after.md'), 'utf8'));
  assert.equal(ok.code, 'OK');
  assert.equal(ok.recommendApply, true);
  assert.ok(ok.changes.every((c) => ['+', '-'].includes(c.op)));
  const changed = voiceDelta(before, before.replace('#412', '#421'));
  assert.equal(changed.code, 'E_FACT_PRESERVATION');
  assert.deepEqual([changed.protected.missing, changed.protected.added], [['#412'], ['#421']]);
  assert.equal(voiceDelta(before, before.replace('`--dir`', 'the dir flag')).code, 'E_FACT_PRESERVATION');
  assert.equal(voiceDelta(before, before + '\nAlso see v9.9.9.\n').code, 'E_FACT_PRESERVATION');
  const fence = 'Text.\n\n```js\nrun(1)\n```\n';
  assert.equal(voiceDelta(fence, fence.replace('run(1)', 'run(2)')).code, 'E_FACT_PRESERVATION');
  assert.equal(voiceDelta(fence, fence.replace('Text.', 'Some text.')).code, 'OK');
  assert.deepEqual(lineDiff(['a', 'b'], ['a', 'c']), [{ op: '-', line: 2, text: 'b' }, { op: '+', line: 2, text: 'c' }]);
});

test('CLI delta: exit 1 and JSON on E_FACT_PRESERVATION, exit 0 when tokens are kept, exit 2 without files', () => {
  const dir = tmp('delta');
  fs.writeFileSync(path.join(dir, 'a.md'), 'Run `npm test` on v1.2.3.\n');
  fs.writeFileSync(path.join(dir, 'b.md'), 'Please run `npm test` on v1.2.3.\n');
  fs.writeFileSync(path.join(dir, 'c.md'), 'Please run `npm t` on v1.2.4.\n');
  assert.equal(run(['delta', 'a.md', 'b.md'], dir).status, 0);
  const bad = run(['delta', 'a.md', 'c.md', '--json'], dir);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).code, 'E_FACT_PRESERVATION');
  assert.equal(run(['delta', 'a.md'], dir).status, 2);
  assert.equal(run(['delta', 'a.md', 'missing.md', '--json'], dir).status, 3);
});
