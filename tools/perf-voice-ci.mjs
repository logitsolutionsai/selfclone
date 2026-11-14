// Performance check for Voice CI: 10,000 synthetic training messages and 100 Markdown files (under 5 MiB
// in total). Measures profile build plus lint of every file, and drift with 1,000 bootstrap rounds.
//   node tools/perf-voice-ci.mjs [--json]
// The brief's budgets: profile + lint within 15 s, drift within 30 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { buildProfile } from '../src/profile/build.mjs';
import { lintPaths } from '../src/lint/lint.mjs';
import { parsePolicy } from '../src/lint/policy.mjs';
import { drift, parseWindow } from '../src/drift/drift.mjs';
import { rng } from '../src/util.mjs';

const CHANNELS = ['message', 'dev', 'docs', 'changelog', 'pr', 'email', 'post'];
const WORDS = 'the build fails on windows when the path has spaces so we pinned the version and added a test for it today'.split(' ');

export function perfCorpus(n = 10000) {
  const r = rng('perf');
  const out = [];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i++) {
    const len = 3 + Math.floor(r() * 30);
    const ws = Array.from({ length: len }, () => WORDS[Math.floor(r() * WORDS.length)]);
    if (r() < 0.5) ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1);
    const text = ws.join(' ') + (r() < 0.4 ? '.' : '') + (r() < 0.05 ? ' 🙂' : '');
    const day = Math.floor((i / n) * 240);
    const ch = CHANNELS[i % CHANNELS.length];
    out.push({ id: `p-${i}`, ts: new Date(start + day * 86400e3 + (i % 50) * 60e3).toISOString(), source: 'jsonl', author: 'me', text, context: null, turn: `t-${i}`, thread: `jsonl:perf:${ch}-${i % 400}`, register: ch });
  }
  return out;
}

export function perfDocs(dir, files = 100) {
  const para = 'Run `npm test` before you open a pull request; see #412 and v2.3.1 for details. The guide explains every flag, such as --dir, in plain words!\n\n';
  for (let i = 0; i < files; i++) {
    const body = `# Guide ${i}\n\n${para.repeat(300)}\`\`\`bash\nnpm install\n\`\`\`\n`;
    fs.writeFileSync(path.join(dir, `doc-${String(i).padStart(3, '0')}.md`), body);
  }
  return fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
}

export function runPerf() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-perf-'));
  const bytes = perfDocs(dir);
  const train = perfCorpus();
  const policy = parsePolicy(fs.readFileSync(new URL('../templates/maintainer-kit/voice-policy.json', import.meta.url), 'utf8'));
  const t0 = performance.now();
  const { profile } = buildProfile(train);
  const t1 = performance.now();
  const report = lintPaths([dir], { root: dir, policy, profile });
  const t2 = performance.now();
  const d = drift(train, { before: parseWindow('2026-01-01..2026-04-30', 'b'), after: parseWindow('2026-05-01..2026-08-31', 'a') });
  const t3 = performance.now();
  fs.rmSync(dir, { recursive: true, force: true });
  return {
    messages: train.length,
    markdownFiles: report.filesScanned,
    markdownBytes: bytes,
    findings: report.findings.length,
    profileMs: Math.round(t1 - t0),
    lintMs: Math.round(t2 - t1),
    profilePlusLintMs: Math.round(t2 - t0),
    driftMs: Math.round(t3 - t2),
    driftStatus: d.status,
    driftRounds: d.rounds,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = runPerf();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  else process.stdout.write(`${r.messages} messages, ${r.markdownFiles} Markdown files (${(r.markdownBytes / 1048576).toFixed(2)} MiB): profile ${r.profileMs} ms + lint ${r.lintMs} ms = ${r.profilePlusLintMs} ms (budget 15000); drift ${r.driftRounds} rounds ${r.driftMs} ms (budget 30000), ${r.findings} findings.\n`);
}
