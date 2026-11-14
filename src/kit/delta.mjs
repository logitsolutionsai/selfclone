// Voice delta: for a proposed rewrite, show only the edited lines and check, byte for byte, that every
// protected technical span (code, links, paths, versions, issue references, identifiers, flags, test
// results, citations) is unchanged. A missing or added span is E_FACT_PRESERVATION: the rewrite is not
// recommended. This protects tokens, not every semantic claim.
import fs from 'node:fs';
import path from 'node:path';
import { protectedTexts, lineTable } from '../lint/segment.mjs';
import { invalid, ioError } from '../errors.mjs';

export const MAX_LINES = 2000;
const MAX_BYTES = 10 * 1024 * 1024;

const optsFor = (file) => {
  const ext = path.extname(file).toLowerCase();
  return { mdx: ext === '.mdx', plain: ext === '.txt' };
};

function lines(text) {
  return lineTable(text).map((l) => text.slice(l.start, l.end));
}

/** Changed lines between a and b (longest common subsequence), as { op, line, text }. */
export function lineDiff(a, b) {
  if (a.length > MAX_LINES || b.length > MAX_LINES) throw invalid('E_TOO_LARGE', `The voice delta handles up to ${MAX_LINES} lines per file.`, 'Check a smaller section.');
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const L = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < n && (j >= m || L[(i + 1) * W + j] >= L[i * W + j + 1])) out.push({ op: '-', line: ++i, text: a[i - 1] });
    else out.push({ op: '+', line: ++j, text: b[j - 1] });
  }
  return out;
}

function multisetDiff(a, b) {
  const count = new Map();
  for (const x of a) count.set(x, (count.get(x) || 0) + 1);
  const added = [];
  for (const x of b) {
    if (count.get(x)) count.set(x, count.get(x) - 1);
    else added.push(x);
  }
  const missing = [];
  for (const [x, c] of count) for (let k = 0; k < c; k++) missing.push(x);
  return { missing, added };
}

export function voiceDelta(before, after, { beforeName = 'before.md', afterName = 'after.md' } = {}) {
  const pb = protectedTexts(before, optsFor(beforeName)).filter((p) => p.text.trim());
  const pa = protectedTexts(after, optsFor(afterName)).filter((p) => p.text.trim());
  const { missing, added } = multisetDiff(pb.map((p) => p.text), pa.map((p) => p.text));
  const ok = !missing.length && !added.length;
  return {
    schemaVersion: 1,
    code: ok ? 'OK' : 'E_FACT_PRESERVATION',
    recommendApply: ok,
    files: { before: beforeName, after: afterName },
    protected: { before: pb.length, after: pa.length, missing, added },
    changes: lineDiff(lines(before), lines(after)),
    note: 'Checks technical tokens byte for byte, not every claim. Read the edited lines too. Nothing was applied.',
    exitCode: ok ? 0 : 1,
  };
}

function read(file) {
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_BYTES) throw invalid('E_TOO_LARGE', `${file} is over 10 MiB.`, 'Check a smaller file.');
    const text = fs.readFileSync(file, 'utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch (e) {
    if (e.code && e.exitCode) throw e;
    throw ioError('E_IO', `Cannot read ${file} (${e.code || 'error'}).`, 'Check the path.');
  }
}

export async function cmdDelta(args, { outLine }) {
  const [a, b] = args._;
  if (!a || !b) throw invalid('E_ARGS', 'Usage: selfclone delta <before> <after>', 'Pass the original draft and the proposed rewrite.');
  const r = voiceDelta(read(a), read(b), { beforeName: a.split(path.sep).join('/'), afterName: b.split(path.sep).join('/') });
  if (args.json) outLine(JSON.stringify(r, null, 2));
  else {
    outLine(`Voice delta: ${r.files.before} -> ${r.files.after}`);
    for (const c of r.changes) outLine(`${c.op} ${String(c.line).padStart(4)}: ${c.text}`);
    if (!r.changes.length) outLine('  (no edited lines)');
    outLine(`Protected tokens: ${r.protected.before} before, ${r.protected.after} after.`);
    if (r.code === 'OK') outLine('OK: every protected token is unchanged. ' + r.note);
    else {
      outLine('E_FACT_PRESERVATION: protected tokens differ, so this rewrite is not recommended.');
      for (const m of r.protected.missing) outLine(`  missing: ${m}`);
      for (const x of r.protected.added) outLine(`  added:   ${x}`);
    }
  }
  process.exitCode = r.exitCode;
}
