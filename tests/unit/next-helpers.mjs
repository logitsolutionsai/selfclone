// Shared helpers for the Voice CI and Voice Passport tests: run the real CLI, and build a workspace from
// the synthetic maintainer corpus (tests/fixtures/synthetic-maintainer/export.jsonl, invented people).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLI = path.join(ROOT, 'scripts', 'selfclone.mjs');
export const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'synthetic-maintainer');

export const run = (args, cwd, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', ...opts });

export const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `selfclone-${name}-`));

/** A temp folder with .selfclone/ ingested from the synthetic corpus, consent granted and a profile built. */
export function maintainerWorkspace({ scrub = true, profile = true, consent = 'This is my own writing. Sam Rivera (synthetic)' } = {}) {
  const cwd = tmp('maint');
  const args = ['ingest', path.join(FIXTURE, 'export.jsonl'), '--me', 'Sam Rivera'];
  if (!scrub) args.push('--no-scrub');
  const r = run(args, cwd);
  if (r.status !== 0) throw new Error(r.stderr);
  if (consent) run(['consent', '--grant', consent, '--scope', 'local-lint,public-stylecard'], cwd);
  if (profile) {
    const p = run(['profile', 'build'], cwd);
    if (p.status !== 0) throw new Error(p.stderr + p.stdout);
  }
  return cwd;
}

/** Records shaped like train.jsonl, for unit tests that do not need ingest. */
export function records(n, { channel = 'docs', threads = 12, start = Date.UTC(2026, 0, 5), text = (i) => `Message number ${i} is a plain sentence.` } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i % threads;
    out.push({ id: `r-${channel}-${i}`, ts: new Date(start + t * 86400e3 + i * 60e3).toISOString(), source: 'jsonl', author: 'me', text: text(i), context: null, turn: `t-${channel}-${i}`, thread: `jsonl:x:${channel}-${t}`, register: channel });
  }
  return out;
}
