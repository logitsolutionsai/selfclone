// Privacy and security: planted secrets and hostile strings in the corpus (an API key, a token, an
// address, a password, an OAuth URL, a third party's name, hidden HTML, a Markdown image beacon,
// zero-width characters, a prompt injection) never reach the profile, lint reports, SARIF, the public
// passport, the kit or the README. Ingest runs with --no-scrub here, so the output allowlist alone has
// to hold; the scrubber is defence in depth, not the guarantee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run, maintainerWorkspace, ROOT, FIXTURE } from './next-helpers.mjs';
import { SECURITY_STRINGS } from '../fixtures/synthetic-maintainer/make-corpus.mjs';
import { readJsonl } from '../../src/util.mjs';

const ws = maintainerWorkspace({ scrub: false });
const train = readJsonl(path.join(ws, '.selfclone', 'train.jsonl'));

const noneOf = (text, where) => {
  for (const s of SECURITY_STRINGS) assert.ok(!text.includes(s), `${where} contains "${s}"`);
  assert.ok(!/[\u200B-\u200D\u2060\uFEFF]/.test(text), `${where} contains a zero-width character`);
};

test('the unscrubbed training split really does hold planted strings (so the checks below mean something)', () => {
  const all = train.map((r) => r.text).join('\n');
  assert.ok(SECURITY_STRINGS.filter((s) => all.includes(s)).length >= 5);
});

test('profile: no planted string, even from an unscrubbed corpus', () => {
  noneOf(fs.readFileSync(path.join(ws, '.selfclone', 'voice-profile.v1.json'), 'utf8'), 'voice-profile.v1.json');
});

test('lint JSON and SARIF never echo source text, even when the draft holds every planted string', () => {
  const draft = `# Notes\n\n${SECURITY_STRINGS.join(' and ')} are in this draft, which is guaranteed to be long enough to get style advice from the profile and policy findings from the rules.\n\n![x](https://tracker.example.net/pixel.gif?u=sam)\n`;
  fs.writeFileSync(path.join(ws, 'draft.md'), draft);
  const policy = path.join(FIXTURE, 'voice-policy.json');
  const j = run(['lint', 'draft.md', '--profile', '--policy', policy, '--json'], ws);
  assert.equal(j.status, 0, j.stderr);
  assert.ok(JSON.parse(j.stdout).findings.length > 0);
  noneOf(j.stdout, 'lint JSON');
  const s = run(['lint', 'draft.md', '--profile', '--policy', policy, '--format', 'sarif'], ws);
  noneOf(s.stdout, 'SARIF');
  const t = run(['lint', 'draft.md', '--profile', '--policy', policy], ws);
  noneOf(t.stdout, 'lint text output');
});

test('new commands make no network calls: fetch, http and net are stubbed to throw', () => {
  const guard = path.join(ws, 'no-network.mjs');
  fs.writeFileSync(guard, `import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
const boom = () => { throw new Error('NETWORK USED'); };
globalThis.fetch = boom; http.request = boom; http.get = boom; https.request = boom; https.get = boom; net.connect = boom; net.createConnection = boom;
`);
  const opts = { env: { ...process.env, NODE_OPTIONS: `--import=${new URL(`file:///${guard.replace(/\\/g, '/')}`).href}` } };
  for (const args of [['profile', 'build'], ['lint', 'draft.md', '--profile', '--json']]) {
    const r = run(args, ws, opts);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.ok(!/NETWORK USED/.test(r.stdout + r.stderr));
  }
});

test('README demo and docs: no planted string', () => {
  for (const f of ['README.md', 'docs/VOICE-CI.md', 'docs/PASSPORT-PRIVACY.md', 'SKILL.md']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) noneOf(fs.readFileSync(p, 'utf8'), f);
  }
});

test('public and private passports: no planted string, from an unscrubbed corpus', () => {
  for (const audience of ['public', 'private']) {
    const r = run(['stylecard', '--audience', audience, '--out', `card-${audience}`], ws);
    assert.equal(r.status, 0, r.stderr);
    for (const f of ['passport.json', 'passport.html', 'passport.svg']) noneOf(fs.readFileSync(path.join(ws, `card-${audience}`, f), 'utf8'), `${audience} ${f}`);
    noneOf(r.stdout, `stylecard ${audience} output`);
  }
  // The public card holds only catalog strings: no word from the corpus that is not in the catalog.
  const pub = JSON.parse(fs.readFileSync(path.join(ws, 'card-public', 'passport.json'), 'utf8'));
  for (const w of ['Sam', 'Rivera', 'Jordan', 'Alex', 'kiln', 'npm', 'Windows']) assert.ok(!JSON.stringify(pub).includes(w), w);
});

test('committed synthetic outputs: no planted string', () => {
  const ex = path.join(ROOT, 'examples', 'maintainer-voice');
  for (const f of fs.readdirSync(ex)) {
    if (f.endsWith('.png')) continue;
    const text = fs.readFileSync(path.join(ex, f), 'utf8');
    noneOf(text, `examples/maintainer-voice/${f}`);
    assert.ok(!/[A-Za-z]:[\\/]Users|\/Users\/|\/home\/|AppData|\bTemp\b/.test(text), `examples/maintainer-voice/${f}: a local path`);
  }
});

test('kit made with a profile from an unscrubbed corpus: no planted string, and kit check passes against the workspace', () => {
  const r = run(['kit', 'init', '--target', '.', '--profile'], ws);
  assert.equal(r.status, 0, r.stderr);
  const kit = path.join(ws, '.selfclone-kit');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(kit)) noneOf(fs.readFileSync(f, 'utf8'), path.relative(ws, f));
  const c = run(['kit', 'check', '--target', '.', '--json'], ws);
  assert.equal(c.status, 0, c.stdout);
});
