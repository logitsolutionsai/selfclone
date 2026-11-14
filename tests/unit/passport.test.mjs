// Voice Passport: the public projection is coarse and allowlisted, the private one is finer and local,
// both render to one offline HTML file with a hashed CSP, and the same input gives the same bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { projectPassport, assertPublicAllowlist, DISCLAIMER, MAX_PUBLIC_HABITS } from '../../src/passport/project.mjs';
import { passportHtml, passportSvg } from '../../src/passport/render.mjs';
import { buildProfile } from '../../src/profile/build.mjs';
import { validateNamed } from '../../src/schema.mjs';
import { run, records, maintainerWorkspace, ROOT } from './next-helpers.mjs';

const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'example-voice-profile.v1.json'), 'utf8'));

test('public projection: schema-valid, at most 3 habits, no name, no details, no numbers but the schema version', () => {
  const p = projectPassport(example, { audience: 'public' });
  assert.deepEqual(validateNamed(p, 'passport.v1.schema.json'), []);
  assert.equal(p.disclaimer, DISCLAIMER);
  assert.ok(p.habits.length <= MAX_PUBLIC_HABITS);
  assert.equal(p.displayName, undefined);
  assert.equal(p.title, 'My writing style');
  assert.equal(p.details, undefined);
  assert.equal(p.evidenceBand, '500+');
  const numbers = JSON.stringify(p).match(/:\s*-?\d+(?:\.\d+)?\b/g) || [];
  assert.deepEqual(numbers, [':1'], 'no counts or rates in a public card');
  assert.ok(assertPublicAllowlist(p));
});

test('public projection: low-volume channels are left out; the private view keeps them as limited, with exact counts', () => {
  const dev = records(150, { channel: 'dev', threads: 30, text: (i) => `short dev note ${i}` });
  const prof = buildProfile([...dev, ...records(12, { channel: 'pr', threads: 4, text: (i) => `This PR fixes item ${i}.` })]).profile;
  const pub = projectPassport(prof, { audience: 'public' });
  assert.deepEqual(pub.registers.map((r) => r.id), ['dev']);
  const priv = projectPassport(prof, { audience: 'private' });
  assert.deepEqual(priv.registers.map((r) => [r.id, r.coverage]), [['dev', 'supported'], ['pr', 'limited']]);
  assert.equal(priv.details.channels.pr.messageCount, 12);
  assert.deepEqual(validateNamed(priv, 'passport.v1.schema.json'), []);
});

test('fewer than 100 training messages: insufficient_data, no registers, no habits', () => {
  const prof = buildProfile(records(80, { channel: 'dev', threads: 20 })).profile;
  const p = projectPassport(prof, { audience: 'public' });
  assert.equal(p.status, 'insufficient_data');
  assert.deepEqual([p.registers, p.habits], [[], []]);
  assert.equal(p.evidenceBand, '<100');
});

test('the allowlist refuses any string that did not come from the catalog', () => {
  const p = projectPassport(example, { audience: 'public' });
  assert.throws(() => assertPublicAllowlist({ ...p, habits: ['thanks Priya for the patch'] }), (e) => e.code === 'E_PASSPORT_LEAK');
  assert.throws(() => assertPublicAllowlist({ ...p, registers: [{ ...p.registers[0], label: 'https://x.example' }] }), (e) => e.code === 'E_PASSPORT_LEAK');
});

test('display name: only when supplied, and never a link, an email, markup or a secret', () => {
  assert.equal(projectPassport(example, { audience: 'public', displayName: 'Sam R.' }).displayName, 'Sam R.');
  for (const bad of ['sam@example.com', 'https://sam.dev', '<b>Sam</b>', 'a'.repeat(61), 'Sam\u200BR', 'key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV']) {
    assert.throws(() => projectPassport(example, { audience: 'public', displayName: bad }), (e) => e.code === 'E_ARGS', bad);
  }
});

test('HTML: one offline file, a CSP whose script hash matches, Ink palette only, escaped, deterministic', () => {
  const p = projectPassport(example, { audience: 'public' });
  const html = passportHtml(p);
  assert.equal(passportHtml(p), html, 'byte-identical');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-[A-Za-z0-9+/=]+'/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.equal(`sha256-${createHash('sha256').update(scripts[0], 'utf8').digest('base64')}`, csp.match(/script-src '([^']+)'/)[1]);
  assert.ok(!/(?:src|href)=["'](?!data:)/.test(html), 'no external resources');
  assert.ok(!/https?:\/\//.test(html), 'no URLs at all');
  const ink = new Set(['#f7f7f5', '#ffffff', '#f0f0ed', '#e3e3df', '#c9c9c3', '#111110', '#3a3a37', '#6f6f69', '#a3a39c', '#0e0e0d', '#171716', '#1f1f1d', '#2b2b29', '#3d3d3a', '#f4f4f2', '#d6d6d2', '#9a9a94', '#6a6a65', '#0065fd', '#0654c8', '#5b9cff', '#3f86ff']);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  for (const hex of css.match(/#[0-9a-f]{6}\b/gi)) assert.ok(ink.has(hex.toLowerCase()), `${hex} is not an Ink token`);
  assert.ok(html.includes(DISCLAIMER));
  assert.match(html, /data-privacy="public"/);
  const hostile = projectPassport(example, { audience: 'public', displayName: 'Sam & "Co"' });
  assert.ok(passportHtml(hostile).includes('Sam &amp; &quot;Co&quot;'));
  const svg = passportSvg(p);
  assert.ok(!/<script|on\w+=/i.test(svg));
  assert.equal(passportSvg(p), svg);
});

test('CLI stylecard: needs an explicit audience and consent; revoking blocks regeneration; JSON and files', () => {
  const ws = maintainerWorkspace();
  assert.equal(run(['stylecard'], ws).status, 2, 'no audience chosen');
  const r = run(['stylecard', '--audience', 'public', '--json'], ws);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.files, ['passport.json', 'passport.html', 'passport.svg']);
  const out = path.join(ws, 'out', 'passport');
  const first = fs.readFileSync(path.join(out, 'passport.html'), 'utf8');
  run(['stylecard', '--audience', 'public'], ws);
  assert.equal(fs.readFileSync(path.join(out, 'passport.html'), 'utf8'), first, 'byte-identical on a second run');
  const priv = run(['stylecard', '--audience', 'private', '--json'], ws);
  assert.equal(priv.status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ws, 'out', 'private-passport', 'passport.json'), 'utf8')).audience, 'private');
  assert.equal(run(['consent', '--revoke', 'public-stylecard'], ws).status, 0);
  const again = run(['stylecard', '--audience', 'public', '--json'], ws);
  assert.equal(again.status, 2);
  assert.match(JSON.parse(again.stdout).error.remedy, /does not delete files that were already shared/);
});

test('CLI stylecard: too little data writes passport.json with insufficient_data and no card, exit 0', () => {
  const ws = maintainerWorkspace({ profile: false });
  const small = buildProfile(records(60, { channel: 'dev', threads: 20 })).profile;
  fs.writeFileSync(path.join(ws, 'small.json'), JSON.stringify(small));
  const r = run(['stylecard', '--audience', 'public', '--profile', 'small.json', '--out', 'small-card', '--json'], ws);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.status, 'insufficient_data');
  assert.deepEqual(j.files, ['passport.json']);
  assert.ok(!fs.existsSync(path.join(ws, 'small-card', 'passport.html')));
});

test('the committed synthetic example matches what the CLI makes from the example profile', () => {
  const ex = path.join(ROOT, 'examples', 'maintainer-voice');
  assert.equal(fs.readFileSync(path.join(ex, 'voice-profile.v1.json'), 'utf8'), fs.readFileSync(path.join(ROOT, 'templates', 'example-voice-profile.v1.json'), 'utf8'));
  const p = projectPassport(example, { audience: 'public' });
  assert.equal(fs.readFileSync(path.join(ex, 'passport.html'), 'utf8'), passportHtml(p));
  assert.equal(JSON.parse(fs.readFileSync(path.join(ex, 'passport.json'), 'utf8')).projectionDigest, p.projectionDigest);
});

test('PNG without a browser degrades to HTML and SVG, with the reason', async () => {
  const { renderPng } = await import('../../src/passport/cli.mjs');
  const r = await renderPng('<p>x</p>', 'unused.png', { launch: async () => { throw new Error('No Chrome, Edge or Chromium found.'); } });
  assert.deepEqual(r, { ok: false, reason: 'No Chrome, Edge or Chromium found.' });
});
