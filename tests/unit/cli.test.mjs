// Runs the real CLI end to end on a synthetic WhatsApp export in a temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { synthTexts } from './synth.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'selfclone.mjs');
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

function whatsapp(n) {
  const mine = synthTexts('casual', n, 'cli-mine');
  const theirs = synthTexts('formal', n, 'cli-theirs');
  const lines = ['1/1/26, 9:00 AM - Messages and calls are end-to-end encrypted.'];
  let t = Date.UTC(2026, 0, 1, 9, 0);
  const stamp = (ms) => {
    const d = new Date(ms);
    let h = d.getUTCHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}, ${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ap}`;
  };
  for (let i = 0; i < n; i++) {
    t += 3 * 3600e3;
    lines.push(`${stamp(t)} - Sam Other: ${theirs[i]}`);
    lines.push(`${stamp(t + 120e3)} - Alex Test: ${mine[i]}`);
  }
  lines.push(`${stamp(t + 3600e3)} - Alex Test: my key is sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV`);
  return lines.join('\n');
}

test('CLI: ingest -> fingerprint -> pack -> test prompts -> score -> game', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-cli-'));
  fs.writeFileSync(path.join(cwd, 'chat.txt'), whatsapp(160));

  const none = run(['ingest', 'chat.txt', '--me', 'Nobody'], cwd);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /Authors found:[\s\S]*Alex Test/);

  const ing = run(['ingest', 'chat.txt', '--me', 'Alex Test', '--name', 'Alex'], cwd);
  assert.equal(ing.status, 0, ing.stderr);
  assert.match(ing.stdout, /Ingested 161 of your messages/);
  assert.match(ing.stdout, /API_KEY 1/);
  assert.match(ing.stdout, /Sealed 24 context-reply pairs/);
  const corpus = fs.readFileSync(path.join(cwd, '.selfclone', 'corpus.jsonl'), 'utf8');
  assert.ok(!corpus.includes('sk-ant-'), 'secret scrubbed from corpus');

  assert.equal(run(['fingerprint'], cwd).status, 0);
  assert.ok(fs.existsSync(path.join(cwd, '.selfclone', 'style.md')));
  const pack = run(['pack', '--max-chars', '8000'], cwd);
  assert.equal(pack.status, 0, pack.stderr);
  assert.ok(fs.statSync(path.join(cwd, '.selfclone', 'distill-pack.md')).size <= 8500);

  assert.equal(run(['test', 'prompts'], cwd).status, 0);
  const prompts = JSON.parse(fs.readFileSync(path.join(cwd, '.selfclone', 'test-prompts.json'), 'utf8')).prompts;
  assert.equal(prompts.length, 24);
  assert.ok(prompts.every((p) => p.id && p.context && !('reply' in p)), 'prompts carry no answers');

  const cloneTexts = synthTexts('casual', 24, 'cli-clone');
  const bareTexts = synthTexts('formal', 24, 'cli-bare');
  fs.writeFileSync(path.join(cwd, 'clone.json'), JSON.stringify(prompts.map((p, i) => ({ id: p.id, reply: cloneTexts[i] }))));
  fs.writeFileSync(path.join(cwd, 'bare.json'), JSON.stringify(prompts.map((p, i) => ({ id: p.id, reply: bareTexts[i] }))));
  const sc = run(['test', 'score', '--clone', 'clone.json', '--bare', 'bare.json'], cwd);
  assert.equal(sc.status, 0, sc.stderr);
  const m = sc.stdout.match(/Style match (\d+)% \(bare model (\d+)%\)/);
  assert.ok(m, sc.stdout);
  assert.ok(Number(m[1]) > Number(m[2]) + 30, sc.stdout);
  assert.ok(fs.existsSync(path.join(cwd, '.selfclone', 'report.md')));

  const game = run(['game', '--clone', 'clone.json', '--rounds', '8'], cwd);
  assert.equal(game.status, 0, game.stderr);
  assert.match(fs.readFileSync(path.join(cwd, '.selfclone', 'can-you-tell.html'), 'utf8'), /"replies"/);

  // Tampering with the sealed set is detected.
  const sealedFile = path.join(cwd, '.selfclone', 'sealed.jsonl');
  fs.appendFileSync(sealedFile, '');
  fs.writeFileSync(sealedFile, fs.readFileSync(sealedFile, 'utf8').replace(/"reply":"/, '"reply":"x'));
  const tampered = run(['test', 'score', '--clone', 'clone.json'], cwd);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /changed after it was sealed/);
});

test('CLI: scrub, help and unknown command', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-cli-'));
  fs.writeFileSync(path.join(cwd, 'x.txt'), 'mail me at a@b.co or call +1 415 555 0100');
  const r = run(['scrub', 'x.txt'], cwd);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'mail me at [EMAIL] or call [PHONE]');
  assert.match(run(['help'], cwd).stdout, /selfclone ingest/);
  assert.equal(run(['bogus'], cwd).status, 1);
});

test('CLI: game uses the clone replies the last score used, wherever they were saved', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-cli-'));
  fs.writeFileSync(path.join(cwd, 'chat.txt'), whatsapp(120));
  assert.equal(run(['ingest', 'chat.txt', '--me', 'Alex Test'], cwd).status, 0);
  assert.equal(run(['test', 'prompts'], cwd).status, 0);
  const prompts = JSON.parse(fs.readFileSync(path.join(cwd, '.selfclone', 'test-prompts.json'), 'utf8')).prompts;
  const texts = synthTexts('casual', prompts.length, 'cli-game');
  // Saved in the current folder, as the README Quick Start used to show.
  fs.writeFileSync(path.join(cwd, 'clone-replies.json'), JSON.stringify(prompts.map((p, i) => ({ id: p.id, reply: texts[i] }))));
  assert.equal(run(['test', 'score', '--clone', 'clone-replies.json'], cwd).status, 0);
  const game = run(['game'], cwd);
  assert.equal(game.status, 0, game.stderr);
  assert.ok(fs.existsSync(path.join(cwd, '.selfclone', 'can-you-tell.html')));
});

test('CLI: test prompts explains an empty test set; say explains a server that was closed', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-cli-'));
  fs.writeFileSync(path.join(cwd, 'notes.md'), '# Notes\n\nI like long walks by the river in the morning.\n\nSecond thought about boats and wood.');
  assert.equal(run(['ingest', 'notes.md', '--me', 'Me'], cwd).status, 0);
  const pr = run(['test', 'prompts'], cwd);
  assert.equal(pr.status, 1);
  assert.match(pr.stderr, /no sealed test set/);
  // A serve.json left behind by a server that was killed.
  fs.writeFileSync(path.join(cwd, '.selfclone', 'serve.json'), JSON.stringify({ url: 'http://127.0.0.1:9', port: 9, token: 'x', pid: 1 }));
  const say = run(['say', 'hello'], cwd);
  assert.equal(say.status, 1);
  assert.match(say.stderr, /not running .*selfclone serve/);
});

test('CLI: numeric options are checked instead of turning into NaN', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-cli-'));
  fs.writeFileSync(path.join(cwd, 'chat.txt'), whatsapp(40));
  assert.equal(run(['ingest', 'chat.txt', '--me', 'Alex Test'], cwd).status, 0);
  const bad = run(['pack', '--max-chars', 'abc'], cwd);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--max-chars must be a number/);
  assert.ok(!fs.existsSync(path.join(cwd, '.selfclone', 'distill-pack.md')));
  assert.match(run(['ingest', 'chat.txt', '--me', 'Alex Test', '--fraction', 'lots'], cwd).stderr, /--fraction must be a number/);
});
