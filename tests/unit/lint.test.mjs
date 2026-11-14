// Voice CI lint: the Markdown segmenter, the policy file, advisory and enforce modes, and the three outputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { segment, protectedTexts, position, lineTable } from '../../src/lint/segment.mjs';
import { lintText, lintPaths } from '../../src/lint/lint.mjs';
import { parsePolicy } from '../../src/lint/policy.mjs';
import { globMatch, checkGlob } from '../../src/lint/glob.mjs';
import { toSarif } from '../../src/lint/sarif.mjs';
import { validateNamed, validate } from '../../src/schema.mjs';
import { run, tmp, FIXTURE, maintainerWorkspace } from './next-helpers.mjs';

const POLICY_FILE = path.join(FIXTURE, 'voice-policy.json');
const REPO = path.join(FIXTURE, 'repo');
const policy = parsePolicy(fs.readFileSync(POLICY_FILE, 'utf8'));
const phraseOnly = (extra = {}) => parsePolicy(JSON.stringify({ schemaVersion: 1, name: 't', rules: [{ id: 'p', type: 'phrase', pattern: 'guaranteed', mode: 'hard', message: 'no', ...extra }] }));
const ids = (r) => r.findings.map((f) => f.ruleId);

test('segment: fences, inline code, comments, link targets, images and technical tokens are protected', () => {
  const md = 'Intro `guaranteed` text.\n\n```js\nguaranteed()\n```\n\n<!-- guaranteed -->\n\nSee [docs](https://x.org/guaranteed) and ![a](https://t.example.net/p.gif) and #12, v1.2.3, src/a.mjs, `a1b2c3d`, foo.bar() and --flag.\n';
  const kinds = protectedTexts(md).map((p) => p.kind);
  for (const k of ['code', 'fence', 'comment', 'url', 'image', 'issue', 'version', 'path', 'identifier', 'flag']) assert.ok(kinds.includes(k), `${k} protected`);
  const r = lintText(md, { rel: 'a.md', policy: phraseOnly() });
  assert.deepEqual(ids(r), [], 'guaranteed only appears in protected spans');
});

test('phrase rule: whole word by default, case-insensitive, substring on request, case-sensitive on request', () => {
  const md = 'It is Guaranteed. Not unguaranteed. guaranteedly fine.\n';
  assert.equal(lintText(md, { policy: phraseOnly() }).findings.length, 1);
  assert.equal(lintText(md, { policy: phraseOnly({ match: 'substring' }) }).findings.length, 3);
  assert.equal(lintText(md, { policy: phraseOnly({ caseSensitive: true }) }).findings.length, 0);
});

test('positions: CRLF line endings, UTF-16 columns after an emoji, and offsets that point at the match', () => {
  const md = '# Title\r\n\r\n😀 is guaranteed here.\r\n';
  const f = lintText(md, { policy: phraseOnly() }).findings[0];
  assert.equal(f.line, 3);
  assert.equal(f.column, 7, 'the emoji is two UTF-16 code units');
  assert.equal(md.slice(f.startOffset, f.endOffset), 'guaranteed');
  assert.deepEqual(position(lineTable('a\rb\nc'), 4), { line: 3, column: 1 });
});

test('MDX: imports, JSX tags and attributes and {expressions} are protected; an unbalanced brace is a warning', () => {
  const mdx = "import X from './x'\n\n<X guaranteed=\"1\" />\n\nUse {guaranteed} here.\n";
  assert.deepEqual(ids(lintText(mdx, { rel: 'a.mdx', policy: phraseOnly() })), []);
  const bad = lintText('Text { guaranteed\n', { rel: 'b.mdx', policy: phraseOnly() });
  assert.ok(bad.warnings.some((w) => w.code === 'W_MDX_UNSUPPORTED'));
  assert.deepEqual(ids(bad), [], 'nothing is suggested inside an unsupported construct');
});

test('unclosed fence protects the rest of the file and warns', () => {
  const r = lintText('Text.\n\n```\nguaranteed\n', { policy: phraseOnly() });
  assert.deepEqual(ids(r), []);
  assert.ok(r.warnings.some((w) => w.code === 'W_UNCLOSED_FENCE'));
});

test('heading-length counts characters (code points), ATX and setext headings', () => {
  const p = parsePolicy(JSON.stringify({ schemaVersion: 1, name: 't', rules: [{ id: 'h', type: 'heading-length', maxChars: 5, mode: 'hard', message: 'long' }] }));
  assert.equal(lintText('# 😀😀😀😀😀\n', { policy: p }).findings.length, 0);
  assert.equal(lintText('# Longer\n\nSetext Title\n===\n', { policy: p }).findings.length, 2);
});

test('case-at-start and terminal-punctuation skip blocks that start or end with a protected token', () => {
  const p = parsePolicy(JSON.stringify({ schemaVersion: 1, name: 't', rules: [
    { id: 'cap', type: 'case-at-start', case: 'upper', target: 'paragraphs', mode: 'advisory', message: 'cap' },
    { id: 'stop', type: 'terminal-punctuation', require: true, target: 'paragraphs', mode: 'advisory', message: 'stop' },
  ] }));
  const r = lintText('`npm test` runs it\n\nSee v1.2.3\n\nplain start and end\n', { policy: p });
  // First paragraph: starts with code (skipped), ends with a word (flagged). Second: ends with a version (skipped).
  assert.deepEqual(r.findings.map((f) => `${f.ruleId}@${f.line}`), ['stop@1', 'cap@5', 'stop@5']);
});

test('advisory never fails; enforce fails only on hard rules; min-context cannot be hard', () => {
  const adv = lintPaths([REPO], { root: REPO, policy });
  assert.equal(adv.exitCode, 0);
  assert.equal(adv.status, 'advisory');
  const enf = lintPaths([REPO], { root: REPO, policy, enforce: true });
  assert.equal(enf.exitCode, 1);
  assert.equal(enf.status, 'failed');
  assert.deepEqual(enf.findings.filter((f) => f.hard).map((f) => f.ruleId), ['max-heading-length']);
  const soft = parsePolicy(JSON.stringify({ ...JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')), rules: policy.rules.filter((r) => r.mode !== 'hard') }));
  assert.equal(lintPaths([REPO], { root: REPO, policy: soft, enforce: true }).exitCode, 0);
  assert.throws(() => parsePolicy(JSON.stringify({ schemaVersion: 1, name: 't', rules: [{ id: 'm', type: 'min-context', minWords: 5, mode: 'hard', message: 'x' }] })), /E_POLICY_SCHEMA|does not match/);
});

test('policy: rejects prototype keys, path traversal, absolute globs, regex fields, unknown types and duplicates', () => {
  const base = { schemaVersion: 1, name: 't', rules: [] };
  const bad = [
    '{"schemaVersion":1,"name":"t","rules":[],"__proto__":{"x":1}}',
    JSON.stringify({ ...base, prototype: {} }),
    JSON.stringify({ ...base, ignore: ['../secrets/**'] }),
    JSON.stringify({ ...base, ignore: ['/etc/**'] }),
    JSON.stringify({ ...base, scopes: [{ glob: 'C:/x/*.md', channel: 'docs' }] }),
    JSON.stringify({ ...base, rules: [{ id: 'r', type: 'phrase', pattern: 'x', regex: '(a+)+$', mode: 'advisory', message: 'm' }] }),
    JSON.stringify({ ...base, rules: [{ id: 'r', type: 'regex', pattern: '(a+)+$', mode: 'advisory', message: 'm' }] }),
    JSON.stringify({ ...base, rules: [{ id: 'r', type: 'phrase', pattern: 'a', mode: 'advisory', message: 'm' }, { id: 'r', type: 'phrase', pattern: 'b', mode: 'advisory', message: 'm' }] }),
    JSON.stringify({ ...base, remote: 'https://example.com/policy.json' }),
    JSON.stringify({ ...base, ignore: ['docs/{a,b}/**'] }),
  ];
  for (const b of bad) assert.throws(() => parsePolicy(b), (e) => e.code === 'E_POLICY_SCHEMA' && e.exitCode === 2, b);
});

test('glob matcher: ** segments, * and ?, and bounded time on a pathological pattern', () => {
  assert.ok(globMatch('docs/**/*.md', 'docs/a.md'));
  assert.ok(globMatch('docs/**/*.md', 'docs/x/y/a.md'));
  assert.ok(!globMatch('docs/**/*.md', 'docsa.md'));
  assert.ok(!globMatch('docs/*.md', 'docs/x/a.md'));
  assert.ok(globMatch('CHANGELOG.md', 'CHANGELOG.md'));
  assert.ok(globMatch('a?c.md', 'abc.md'));
  const t0 = Date.now();
  assert.ok(!globMatch('**/*a*a*a*a*a*a*a*a*b', `${'x/'.repeat(30)}${'a'.repeat(150)}`));
  assert.ok(Date.now() - t0 < 1000);
  assert.throws(() => checkGlob('a/../b'));
});

test('folders: ignore globs, excluded folders, binary files, size limits and symlinks', (t) => {
  const dir = tmp('lintdir');
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'a.md'), 'guaranteed\n');
  fs.mkdirSync(path.join(dir, 'dist'));
  fs.writeFileSync(path.join(dir, 'dist', 'a.md'), 'guaranteed\n');
  fs.writeFileSync(path.join(dir, 'bin.md'), Buffer.from([0x67, 0, 0x61]));
  fs.writeFileSync(path.join(dir, 'big.md'), 'guaranteed '.repeat(40));
  fs.writeFileSync(path.join(dir, 'ok.md'), 'It is guaranteed.\n');
  fs.writeFileSync(path.join(dir, 'image.png'), 'not text');
  let linked = false;
  try {
    fs.symlinkSync(path.join(dir, 'ok.md'), path.join(dir, 'link.md'));
    linked = true;
  } catch {
    t.diagnostic('symlink creation not permitted here; the symlink case is skipped');
  }
  const r = lintPaths([dir], { root: dir, policy: phraseOnly(), maxBytes: 200 });
  assert.deepEqual(r.findings.map((f) => f.path), ['ok.md']);
  assert.equal(r.filesScanned, 1);
  assert.ok(r.warnings.some((w) => /bin\.md: looks binary/.test(w)));
  assert.ok(r.warnings.some((w) => /big\.md: over the size limit/.test(w)));
  if (linked) assert.ok(r.warnings.some((w) => /link\.md: a symbolic link/.test(w)));
  // A file named on the command line over the limit is an error (exit 2).
  const c = run(['lint', 'big.md', '--max-bytes', '200', '--json'], dir);
  assert.equal(c.status, 2);
  assert.equal(JSON.parse(c.stdout).error.code, 'E_TOO_LARGE');
  assert.equal(run(['lint', 'ok.md', '--max-bytes', String(51 * 1024 * 1024)], dir).status, 2, 'hard ceiling is 50 MiB');
});

test('report: schema-valid, sorted by path, offset and rule id, and byte-identical across runs', () => {
  const a = lintPaths([REPO], { root: REPO, policy });
  assert.deepEqual(validateNamed(a, 'lint-report.v1.schema.json'), []);
  const keys = a.findings.map((f) => [f.path, f.startOffset, f.ruleId]);
  const sorted = keys.slice().sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || (x[2] < y[2] ? -1 : 1)));
  assert.deepEqual(keys, sorted);
  assert.equal(JSON.stringify(lintPaths([REPO], { root: REPO, policy })), JSON.stringify(a));
  assert.ok(!a.findings.some((f) => f.path.startsWith('vendor/')), 'ignored folder');
  assert.ok(!a.findings.some((f) => f.path.includes('\\')), 'POSIX paths');
});

// A small fixture parser for the SARIF 2.1.0 fields code scanning reads.
const SARIF_SUBSET = {
  type: 'object', required: ['version', 'runs', '$schema'],
  properties: {
    version: { const: '2.1.0' },
    runs: { type: 'array', minItems: 1, items: { type: 'object', required: ['tool', 'results'], properties: {
      tool: { type: 'object', required: ['driver'], properties: { driver: { type: 'object', required: ['name', 'rules'], properties: { name: { type: 'string' }, rules: { type: 'array', items: { type: 'object', required: ['id', 'shortDescription', 'defaultConfiguration'], properties: { id: { type: 'string' } } } } } } } },
      results: { type: 'array', items: { type: 'object', required: ['ruleId', 'ruleIndex', 'level', 'message', 'locations'], properties: {
        level: { enum: ['error', 'warning', 'note'] },
        message: { type: 'object', required: ['text'] },
        locations: { type: 'array', minItems: 1, items: { type: 'object', required: ['physicalLocation'], properties: { physicalLocation: { type: 'object', required: ['artifactLocation', 'region'], properties: { region: { type: 'object', required: ['startLine', 'startColumn'], properties: { startLine: { type: 'integer', minimum: 1 }, startColumn: { type: 'integer', minimum: 1 } } } } } } } },
      } } },
    } } },
  },
};

test('SARIF 2.1.0: required fields, rule ids consistent with results, regions match the JSON report', () => {
  const report = lintPaths([REPO], { root: REPO, policy });
  const s = toSarif(report, { policy });
  assert.deepEqual(validate(s, SARIF_SUBSET), []);
  const rules = s.runs[0].tool.driver.rules;
  for (const r of s.runs[0].results) assert.equal(rules[r.ruleIndex].id, r.ruleId);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  s.runs[0].results.forEach((r, i) => {
    assert.equal(r.locations[0].physicalLocation.region.startLine, report.findings[i].line);
    assert.equal(r.locations[0].physicalLocation.artifactLocation.uri, report.findings[i].path);
  });
});

test('CLI lint: text, --json and --format sarif; enforce exit code; bad policy is exit 2 with JSON error', () => {
  const t = run(['lint', '.', '--policy', POLICY_FILE], REPO);
  assert.equal(t.status, 0);
  assert.match(t.stdout, /docs\/README\.md:10:4 {2}error \(hard\) {2}Heading is too long/);
  const j = run(['lint', '.', '--policy', POLICY_FILE, '--json', '--enforce'], REPO);
  assert.equal(j.status, 1);
  assert.equal(JSON.parse(j.stdout).exitCode, 1);
  const s = run(['lint', 'docs', '--policy', POLICY_FILE, '--format', 'sarif'], REPO);
  assert.equal(JSON.parse(s.stdout).version, '2.1.0');
  const dir = tmp('badpolicy');
  fs.writeFileSync(path.join(dir, 'p.json'), '{"schemaVersion":1,"name":"x","rules":[{"id":"r","type":"shell","mode":"hard","message":"m"}]}');
  fs.writeFileSync(path.join(dir, 'a.md'), 'Hello.\n');
  const b = run(['lint', 'a.md', '--policy', 'p.json', '--json'], dir);
  assert.equal(b.status, 2);
  assert.equal(JSON.parse(b.stdout).error.code, 'E_POLICY_SCHEMA');
  assert.equal(run(['lint', '--help'], dir).status, 0);
  assert.equal(run(['lint', 'a.md', '--format', 'xml'], dir).status, 2);
});

test('style advice: from the profile, never on protected tokens, never failing, silent on short text', () => {
  const ws = maintainerWorkspace();
  const long = `${'The setup takes one step and the docs explain every option in plain words for new users. '.repeat(3)}Great news! It works; really.\n\nUse \`a;b!\` and https://x.org/a;b! freely in code and links.\n`;
  fs.writeFileSync(path.join(ws, 'doc.md'), long);
  const r = JSON.parse(run(['lint', 'doc.md', '--profile', '--json', '--enforce'], ws).stdout);
  assert.equal(r.exitCode, 0, 'style advice never fails, even in enforce mode');
  const style = r.findings.filter((f) => f.kind === 'style');
  assert.ok(style.some((f) => f.ruleId === 'style/exclamation' && f.line === 1));
  assert.ok(style.some((f) => f.ruleId === 'style/semicolon' && f.line === 1));
  assert.ok(!style.some((f) => f.line === 3), 'nothing flagged in code or links');
  assert.match(r.profileId, /^[0-9a-f]{20}$/);
  fs.writeFileSync(path.join(ws, 'short.md'), 'Great news! It works; really.\n');
  const s = JSON.parse(run(['lint', 'short.md', '--profile', '--json'], ws).stdout);
  assert.deepEqual(s.findings, []);
  assert.ok(s.warnings.some((w) => /too short to judge/.test(w)));
});
