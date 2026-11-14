// The synthetic Voice CI demo, in five commands: ingest -> profile -> stylecard -> lint a changelog ->
// check the rewrite. It runs in a temporary folder on the invented maintainer's corpus and prints each
// command with its real output. Nothing about a real person is used.
//   node examples/maintainer-voice/demo.mjs            (writes demo-output.txt beside this file with --save)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(ROOT, 'scripts', 'selfclone.mjs');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-demo-'));
fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'synthetic-maintainer', 'export.jsonl'), path.join(cwd, 'export.jsonl'));
for (const f of ['release-note-before.md', 'release-note-after.md', 'voice-policy.json']) fs.copyFileSync(path.join(HERE, f), path.join(cwd, f));

const steps = [
  ['ingest', 'export.jsonl', '--me', 'Sam Rivera'],
  ['consent', '--grant', 'This is my own writing. Sam Rivera', '--scope', 'local-lint,public-stylecard'],
  ['profile', 'build'],
  ['stylecard', '--audience', 'public'],
  ['lint', 'release-note-before.md', '--channel', 'changelog', '--profile', '--policy', 'voice-policy.json'],
  ['delta', 'release-note-before.md', 'release-note-after.md'],
];
const out = [];
for (const args of steps) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  const shown = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  // The temporary folder is shown as . so the saved output holds no local path.
  const text = (r.stdout + r.stderr).split(path.join(cwd, '.selfclone')).join('.selfclone').split(cwd).join('.').trimEnd();
  out.push(`$ selfclone ${shown}`, text, '');
  if (r.status !== 0) {
    out.push(`(exit ${r.status})`);
    break;
  }
}
fs.rmSync(cwd, { recursive: true, force: true });
const text = out.join('\n') + '\n';
if (process.argv.includes('--save')) fs.writeFileSync(path.join(HERE, 'demo-output.txt'), text);
process.stdout.write(text);
