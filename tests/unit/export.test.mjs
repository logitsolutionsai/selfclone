import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readClone, buildExports, writeExports, fingerprintRules, fit, disclosure, TARGETS } from '../../src/export.mjs';
import { fingerprint } from '../../src/fingerprint.mjs';
import { synthRecords } from './synth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(ROOT, 'scripts', 'selfclone.mjs');
const MAYA = path.join(ROOT, 'examples', 'maya');
const mayaFp = JSON.parse(fs.readFileSync(path.join(MAYA, 'workspace', 'style.json'), 'utf8'));
const mayaReport = JSON.parse(fs.readFileSync(path.join(MAYA, 'workspace', 'report.json'), 'utf8'));
const DISCLOSE = /You are an AI clone of [^.]+\. You are not [^.]+\. If anyone asks whether they are talking to \w+, a bot or an AI, say plainly that you are an AI clone of \w+\./;

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    if (d.name === 'export') continue;
    const a = path.join(from, d.name);
    const b = path.join(to, d.name);
    if (d.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

// A clone with far more rules than any target holds, so every export has to be cut.
function bigClone(dir) {
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: casey-test-clone\ndescription: test\n---\n\n# Casey Test (AI Clone)\n\nYou write the way Casey Test writes.\n\n## Consent\n\nSynthetic test persona.\n\n## Fidelity\n\nNot scored yet.\n');
  const bullets = Array.from({ length: 400 }, (_, i) => `- **Rule ${i}.** Write the way Casey writes in situation ${i}, with a long explanation that takes up space so the limit is reached quickly (evidence: [wa-${String(i).padStart(10, '0')}]).`).join('\n');
  fs.writeFileSync(path.join(dir, 'references', 'voice.md'), `# Voice: Casey Test\n\n## Rules\n\n${bullets}\n`);
  fs.writeFileSync(path.join(dir, 'references', 'mind.md'), `# Mind: Casey Test\n\n## Opinions\n\n${bullets.replace(/Write the way/g, 'Thinks the way')}\n\n## Unknown\n\nPolitics.\n`);
  fs.writeFileSync(path.join(dir, 'references', 'never.md'), '# Never\n\n## Hard Limits (Keep These)\n\n- Never claim to be the real Casey Test.\n');
  fs.writeFileSync(path.join(dir, 'references', 'examples.md'), '# Examples\n\n## One\n\n> them: hi?\n\n```\nhey\n```\n\nSource: [wa-1]\n');
}

test('export: every target fits its size limit and starts with the AI clone disclosure (Maya)', () => {
  const c = readClone(path.join(MAYA, 'out', 'maya-okafor-clone'));
  assert.equal(c.name, 'Maya Okafor');
  assert.equal(c.firstName, 'Maya');
  const ex = buildExports(c, { fp: mayaFp, report: mayaReport });
  for (const t of ['system-prompt', 'claude-project']) {
    assert.ok(ex[t].text.length <= TARGETS[t].max, `${t} ${ex[t].text.length}`);
    assert.match(ex[t].text.split('\n').slice(0, 4).join('\n'), DISCLOSE, `${t} opens with the disclosure`);
  }
  assert.ok(ex.chatgpt.short.text.trim().length <= 1500, `chatgpt short ${ex.chatgpt.short.text.length}`);
  assert.ok(ex.chatgpt.long.text.trim().length <= 5000);
  assert.ok(ex.chatgpt.long.text.length > ex.chatgpt.short.text.length);
  assert.match(ex.chatgpt.short.text, DISCLOSE);
  assert.ok(Buffer.byteLength(ex['agents-md'].text, 'utf8') <= 6000);
  assert.match(ex['agents-md'].text, /drafted by an AI agent, not by Maya Okafor\. If anyone asks whether Maya wrote it, say it was drafted by an AI/);
  assert.doesNotMatch(ex['agents-md'].text, /Shorthand Maya uses|Send a reply as a burst/, 'no chat habits in developer writing');
  assert.equal(ex.persona.aiClone, true);
  assert.match(ex.persona.disclosure, DISCLOSE);
  // Exports without message ids carry no citations.
  assert.doesNotMatch(ex.chatgpt.long.text, /\[(?:wa|sl)-[0-9a-f]{6,}/);
  assert.doesNotMatch(ex['agents-md'].text, /\[(?:wa|sl)-[0-9a-f]{6,}|Evidence:/);
});

test('export: the rules with the most voice signal come first', () => {
  const rules = fingerprintRules(mayaFp, { first: 'Maya', report: mayaReport });
  for (let i = 1; i < rules.length; i++) assert.ok(rules[i - 1].signal >= rules[i].signal);
  const top3 = rules.slice(0, 3).map((r) => r.feature);
  for (const f of ['apostropheDropRate', 'endPunctRate', 'lowercaseStartRate']) assert.ok(top3.includes(f), `${f} in ${top3}`);
  const ex = buildExports(readClone(path.join(MAYA, 'out', 'maya-okafor-clone')), { fp: mayaFp, report: mayaReport });
  // The 1,500-character ChatGPT block keeps the top rules.
  for (const r of rules.slice(0, 3)) assert.ok(ex.chatgpt.short.text.includes(r.text), r.text);
  // A formal writer gets the opposite rules.
  const formal = fingerprint(synthRecords('formal', 200, 'ex-formal'));
  const fr = fingerprintRules(formal, { first: 'Casey' }).map((r) => r.text).join('\n');
  assert.match(fr, /Start sentences with a capital letter/);
  assert.doesNotMatch(fr, /lowercase|without the apostrophe/);
});

test('export: the disclosure survives truncation; a limit too small for it is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-export-'));
  bigClone(dir);
  const c = readClone(dir);
  const ex = buildExports(c, { fp: fingerprint(synthRecords('casual', 100, 'ex-big')) });
  for (const t of ['system-prompt', 'claude-project']) {
    assert.ok(ex[t].truncated, `${t} is cut`);
    assert.ok(ex[t].text.length <= TARGETS[t].max);
    assert.match(ex[t].text, DISCLOSE);
    assert.match(ex[t].text, /Shortened to fit/);
  }
  assert.ok(ex.chatgpt.short.truncated && ex.chatgpt.long.truncated);
  assert.ok(ex.chatgpt.short.text.length <= 1500 && ex.chatgpt.long.text.length <= 5000);
  assert.match(ex.chatgpt.short.text, DISCLOSE);
  assert.ok(Buffer.byteLength(ex['agents-md'].text) <= 6000);
  assert.match(ex['agents-md'].text, /drafted by an AI agent/);
  // Very small limits still keep the disclosure, or refuse.
  for (const max of [600, 1000, 2000]) {
    const small = buildExports(c, { maxChars: max })['system-prompt'];
    assert.ok(small.text.length <= max);
    assert.match(small.text, DISCLOSE);
  }
  assert.throws(() => fit([{ title: '', items: [disclosure(c)], required: true, bulleted: false }], { max: 200 }), /too small for the AI clone disclosure/);
});

test('CLI: export writes the files into <clone>/export/, one target or all', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-export-cli-'));
  const clone = path.join(cwd, 'out', 'maya-okafor-clone');
  copyDir(path.join(MAYA, 'out', 'maya-okafor-clone'), clone);
  fs.mkdirSync(path.join(cwd, '.selfclone'));
  fs.copyFileSync(path.join(MAYA, 'workspace', 'style.json'), path.join(cwd, '.selfclone', 'style.json'));
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  const one = run(['export', '--to', 'chatgpt']);
  assert.equal(one.status, 0, one.stderr);
  assert.deepEqual(fs.readdirSync(path.join(clone, 'export')), ['chatgpt-instructions.md']);
  const md = fs.readFileSync(path.join(clone, 'export', 'chatgpt-instructions.md'), 'utf8');
  const blocks = [...md.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].length <= 1500 && blocks[1].length <= 5000, `${blocks[0].length} ${blocks[1].length}`);
  assert.match(md, /1,500 characters on the Free and Go plans and 5,000 on Plus/);
  const all = run(['export']);
  assert.equal(all.status, 0, all.stderr);
  assert.deepEqual(fs.readdirSync(path.join(clone, 'export')).sort(), ['agents-md.md', 'chatgpt-instructions.md', 'claude-project.md', 'persona.json', 'system-prompt.md']);
  const persona = JSON.parse(fs.readFileSync(path.join(clone, 'export', 'persona.json'), 'utf8'));
  assert.equal(persona.aiClone, true);
  assert.ok(persona.rules.length >= 5);
  assert.match(all.stdout, /Every export starts with the AI clone disclosure/);
  assert.equal(run(['export', '--to', 'myspace']).status, 1);
  assert.equal(run(['export', '--clone', path.join(cwd, 'nothing-here')]).status, 1);
});
