// Voice CI: deterministic, source-located findings for Markdown, MDX and text drafts.
// Two sources of findings:
//   policy  rules from a project's voice-policy.json (the only findings that can fail a run, and only
//           hard rules in enforce mode);
//   style   advice from the user's own opted-in voice profile, compared with explicit quantiles. It never
//           fails a run, is suppressed for short text, and never touches protected technical spans.
import fs from 'node:fs';
import path from 'node:path';
import { segment, maskedText, position } from './segment.mjs';
import { globMatch } from './glob.mjs';
import { severityOf } from './policy.mjs';
import { words, emojis, normalizeQuotes } from '../text.mjs';
import { channelEstimate } from '../profile/build.mjs';
import { CHANNELS } from '../profile/channels.mjs';
import { invalid, ioError } from '../errors.mjs';
import { round } from '../util.mjs';

export const EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt'];
export const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.selfclone', 'dist']);
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export const HARD_MAX_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 10000;
// Style advice needs this many prose words in the file; below it the text is too short to judge.
export const STYLE_MIN_WORDS = 40;

const TARGET_TYPES = { headings: ['heading'], paragraphs: ['paragraph'], 'list-items': ['list-item'] };

function caseFold(s) {
  // Per-character lower case that keeps the string length, so offsets stay valid.
  let o = '';
  for (const c of s) {
    const l = c.toLowerCase();
    o += l.length === c.length ? l : c;
  }
  return o;
}

const isWordChar = (c) => !!c && /[\p{L}\p{N}_]/u.test(c);

function finding(seg, rel, { ruleId, kind, severity, start, end, message, suggestion, confidence, hard = false }) {
  const p = position(seg.lines, start);
  return { ruleId, kind, severity, path: rel, line: p.line, column: p.column, startOffset: start, endOffset: end, message, suggestion: suggestion || null, confidence, ...(hard ? { hard: true } : {}) };
}

/** First and last prose characters of a masked block (skipping spaces, punctuation-only markup and emoji). */
function proseEdges(masked) {
  const first = masked.search(/[\p{L}\p{N}]/u);
  const trimmed = masked.replace(/[\s*_~`]+$/u, '');
  return { first, lastIndex: trimmed.length - 1, last: trimmed[trimmed.length - 1] };
}

function policyFindings(text, seg, rel, channel, policy) {
  const out = [];
  const blocks = seg.blocks;
  let docWords = 0;
  const masks = blocks.map((b) => maskedText(text, b, seg.protected));
  for (let i = 0; i < blocks.length; i++) docWords += words(masks[i]).length;
  for (const rule of policy.rules) {
    if (rule.channels && !rule.channels.includes(channel)) continue;
    const base = { ruleId: rule.id, kind: 'policy', severity: severityOf(rule), confidence: 'high', hard: rule.mode === 'hard', suggestion: rule.suggestion };
    if (rule.type === 'phrase') {
      const needle = rule.caseSensitive ? rule.pattern : caseFold(rule.pattern);
      for (let i = 0; i < blocks.length; i++) {
        const hay = rule.caseSensitive ? masks[i] : caseFold(masks[i]);
        let at = hay.indexOf(needle);
        while (at >= 0) {
          const ok = (rule.match || 'word') === 'substring' || (!isWordChar(hay[at - 1]) && !isWordChar(hay[at + needle.length]));
          if (ok) out.push(finding(seg, rel, { ...base, start: blocks[i].start + at, end: blocks[i].start + at + needle.length, message: rule.message }));
          at = hay.indexOf(needle, at + Math.max(1, needle.length));
        }
      }
    } else if (rule.type === 'heading-length') {
      for (const b of blocks) {
        if (b.type !== 'heading') continue;
        const len = Array.from(text.slice(b.start, b.end).trim()).length;
        if (len > rule.maxChars) out.push(finding(seg, rel, { ...base, start: b.start, end: b.end, message: `${rule.message} (${len} characters, limit ${rule.maxChars})` }));
      }
    } else if (rule.type === 'max-paragraph-words') {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type !== 'paragraph' && b.type !== 'list-item') continue;
        const n = words(masks[i]).length;
        if (n > rule.maxWords) out.push(finding(seg, rel, { ...base, start: b.start, end: b.end, message: `${rule.message} (${n} words, limit ${rule.maxWords})` }));
      }
    } else if (rule.type === 'case-at-start' || rule.type === 'terminal-punctuation') {
      const types = TARGET_TYPES[rule.target || (rule.type === 'case-at-start' ? 'headings' : 'paragraphs')];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!types.includes(b.type)) continue;
        const m = masks[i];
        const e = proseEdges(m);
        if (e.first < 0) continue;
        if (rule.type === 'case-at-start') {
          // A block that starts with a protected token (code, a path, a version) is left alone.
          const lead = m.slice(0, e.first);
          if (lead.trim() === '' && lead.length && text.slice(b.start, b.start + lead.length).trim()) continue;
          const c = m[e.first];
          if (c.toLowerCase() === c.toUpperCase()) continue;
          const isUpper = c !== c.toLowerCase();
          if ((rule.case === 'upper') !== isUpper) out.push(finding(seg, rel, { ...base, start: b.start + e.first, end: b.start + e.first + 1, message: rule.message }));
        } else {
          // A block that ends in a protected token is left alone.
          const tail = text.slice(b.start, b.end).replace(/\s+$/u, '');
          if (tail.length - 1 > e.lastIndex && m.slice(e.lastIndex + 1, tail.length).trim() === '' && tail.slice(e.lastIndex + 1).trim()) continue;
          const ends = /[.!?…:)"'”’]/.test(e.last || '');
          if (ends !== rule.require) {
            const at = b.start + Math.max(0, e.lastIndex);
            out.push(finding(seg, rel, { ...base, start: at, end: at + 1, message: rule.message }));
          }
        }
      }
    } else if (rule.type === 'min-context') {
      if (docWords < rule.minWords) out.push(finding(seg, rel, { ...base, hard: false, start: 0, end: Math.min(text.length, 1), message: `${rule.message} (${docWords} words of prose, at least ${rule.minWords} expected)` }));
    }
  }
  return { out, docWords, masks };
}

const CHANNEL_WORD = { message: 'chat messages', email: 'emails', post: 'posts', dev: 'developer writing', docs: 'documentation', changelog: 'changelogs', pr: 'pull request descriptions' };

function styleFindings(text, seg, rel, channel, profile, masks, docWords, warnings) {
  const out = [];
  if (!profile) return out;
  const est = channelEstimate(profile, channel);
  if (docWords < STYLE_MIN_WORDS) {
    warnings.push({ code: 'W_SHORT_TEXT', path: rel, message: `${rel}: ${docWords} words of prose, fewer than ${STYLE_MIN_WORDS}, so no style advice is given (too short to judge).` });
    return out;
  }
  if (est.fallback) warnings.push({ code: 'W_PROFILE_FALLBACK', path: rel, message: `${rel}: your profile has little ${CHANNEL_WORD[channel] || channel}, so style advice uses ${est.id === 'global' ? 'all your writing' : est.id} (confidence ${est.confidence}).` });
  const f = est.features;
  const confidence = est.confidence === 'high' && docWords >= 80 ? 'high' : est.confidence === 'low' ? 'low' : 'medium';
  const what = CHANNEL_WORD[est.id] || 'writing';
  const enough = est.messageCount >= 30 && !est.fallback;
  for (let i = 0; i < seg.blocks.length; i++) {
    const b = seg.blocks[i];
    if (b.type !== 'paragraph' && b.type !== 'list-item') continue;
    const m = masks[i];
    const unit = b.type === 'list-item' ? 'list item' : 'paragraph';
    const n = words(m).length;
    const limit = Math.max(20, Math.ceil(f.p90Words * 1.5));
    if (enough && n > limit) {
      out.push(finding(seg, rel, { ruleId: 'style/longer-than-usual', kind: 'style', severity: 'note', start: b.start, end: b.end, confidence, message: `This ${unit} has ${n} words; in your ${what}, one rarely runs past ${Math.round(f.p90Words)} (90th percentile).`, suggestion: 'Split it or cut it down. Keep code, links and numbers as they are.' }));
    }
    const once = (re, ruleId, message, suggestion) => {
      re.lastIndex = 0;
      const hit = re.exec(normalizeQuotes(m));
      if (hit) out.push(finding(seg, rel, { ruleId, kind: 'style', severity: 'note', start: b.start + hit.index, end: b.start + hit.index + hit[0].length, confidence, message, suggestion }));
    };
    if (f.exclamationMsgRate < 0.05) once(/!/g, 'style/exclamation', `You rarely use exclamation marks in your ${what} (${Math.round(f.exclamationMsgRate * 100)}% of messages); this ${unit} has one.`, 'Use a full stop unless the emphasis is needed.');
    if (f.semicolonPer1k < 0.3) once(/;/g, 'style/semicolon', `You almost never use semicolons in your ${what}; this ${unit} has one.`, 'Split the sentence, or use a comma.');
    if (f.emojiMsgRate < 0.03 && emojis(m).length) {
      const e = emojis(m)[0];
      const at = m.indexOf(e);
      out.push(finding(seg, rel, { ruleId: 'style/emoji', kind: 'style', severity: 'note', start: b.start + at, end: b.start + at + e.length, confidence, message: `You rarely use emoji in your ${what} (${Math.round(f.emojiMsgRate * 100)}% of messages); this ${unit} has one.`, suggestion: 'Leave it out unless it carries meaning.' }));
    }
    if (f.dashPer1k < 0.5) once(/—|–|\s-\s|--/g, 'style/dash', `You rarely use dashes in your ${what}; this ${unit} has one.`, 'Use a comma or a full stop.');
    if (f.lowercaseStartRate <= 0.1) {
      const e = proseEdges(m);
      const c = e.first >= 0 ? m[e.first] : '';
      const lead = m.slice(0, Math.max(0, e.first));
      const protectedLead = lead.length && text.slice(b.start, b.start + lead.length).trim() !== '';
      if (c && !protectedLead && c !== c.toUpperCase() && c.toLowerCase() !== c.toUpperCase()) {
        out.push(finding(seg, rel, { ruleId: 'style/lowercase-start', kind: 'style', severity: 'note', start: b.start + e.first, end: b.start + e.first + 1, confidence, message: `You start ${Math.round((1 - f.lowercaseStartRate) * 100)}% of your ${what} with a capital; this ${unit} starts lowercase.`, suggestion: 'Capitalise the first word.' }));
      }
    }
  }
  return out;
}

/** Lint one text. `rel` is the POSIX path shown in findings. */
export function lintText(raw, { rel = 'draft.md', channel = 'docs', policy = null, profile = null } = {}) {
  const text = String(raw).replace(/^\uFEFF/, '');
  const ext = path.extname(rel).toLowerCase();
  const seg = segment(text, { mdx: ext === '.mdx', plain: ext === '.txt' });
  const warnings = seg.warnings.map((w) => ({ ...w, path: rel, message: `${rel}: ${w.message}` }));
  const pol = policy ? policyFindings(text, seg, rel, channel, policy) : null;
  const masks = pol ? pol.masks : seg.blocks.map((b) => maskedText(text, b, seg.protected));
  const docWords = pol ? pol.docWords : masks.reduce((a, m) => a + words(m).length, 0);
  const style = styleFindings(text, seg, rel, channel, profile, masks, docWords, warnings);
  return { findings: sortFindings([...(pol ? pol.out : []), ...style]), warnings, words: docWords, segments: seg };
}

export const sortFindings = (fs_) =>
  fs_.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.startOffset - b.startOffset || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) || a.endOffset - b.endOffset);

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Collect lintable files under the inputs. Never follows symlinks; skips excluded and ignored folders. */
export function collectFiles(inputs, { root, ignore = [], warnings }) {
  const files = [];
  const seen = new Set();
  const relOf = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const ignored = (rel) => ignore.some((g) => globMatch(g, rel) || globMatch(g.replace(/\/\*\*$/, ''), rel));
  const visit = (abs, explicit) => {
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch (e) {
      throw ioError('E_IO', `Cannot read ${abs} (${e.code || 'error'}).`, 'Check the path.');
    }
    const rel = relOf(abs) || path.basename(abs);
    if (st.isSymbolicLink()) {
      warnings.push({ code: 'W_SYMLINK', path: rel, message: `${rel}: a symbolic link, skipped (links are never followed).` });
      return;
    }
    if (st.isDirectory()) {
      if (!explicit && (EXCLUDED_DIRS.has(path.basename(abs)) || ignored(rel))) return;
      for (const name of fs.readdirSync(abs).sort()) {
        if (EXCLUDED_DIRS.has(name)) continue;
        visit(path.join(abs, name), false);
        if (files.length > MAX_FILES) throw invalid('E_TOO_MANY_FILES', `More than ${MAX_FILES} files to lint.`, 'Lint a smaller folder, or add ignore globs to the policy.');
      }
      return;
    }
    if (!st.isFile()) return;
    const ext = path.extname(abs).toLowerCase();
    if (!EXTENSIONS.includes(ext)) {
      if (explicit) throw invalid('E_ARGS', `${rel} is not a .md, .mdx, .markdown or .txt file.`, 'Lint Markdown, MDX or plain text files only.');
      return;
    }
    if (!explicit && ignored(rel)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    files.push({ abs, rel, size: st.size, explicit });
  };
  for (const inp of inputs) visit(path.resolve(inp), true);
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/**
 * Lint files or folders.
 * @returns the lint report (schemas/lint-report.v1.schema.json)
 */
export function lintPaths(inputs, { root = process.cwd(), policy = null, profile = null, channel = null, enforce = false, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (channel && !CHANNELS.includes(channel)) throw invalid('E_ARGS', `--channel must be one of ${CHANNELS.join(', ')}, not "${channel}".`, 'Pick the kind of writing the file is.');
  const warnings = [];
  const files = collectFiles(inputs, { root, ignore: policy?.ignore || [], warnings });
  const findings = [];
  let scanned = 0;
  let skipped = 0;
  for (const f of files) {
    if (f.size > maxBytes) {
      if (f.explicit) throw invalid('E_TOO_LARGE', `${f.rel} is ${round(f.size / 1048576, 1)} MiB, over the ${round(maxBytes / 1048576, 1)} MiB limit.`, `Pass --max-bytes (at most ${HARD_MAX_BYTES} bytes) to raise the limit.`);
      warnings.push({ code: 'W_TOO_LARGE', path: f.rel, message: `${f.rel}: over the size limit, skipped.` });
      skipped++;
      continue;
    }
    let buf;
    try {
      buf = fs.readFileSync(f.abs);
    } catch (e) {
      throw ioError('E_IO', `Cannot read ${f.rel} (${e.code || 'error'}).`, 'Check the file permissions.');
    }
    if (isBinary(buf)) {
      warnings.push({ code: 'W_BINARY', path: f.rel, message: `${f.rel}: looks binary, skipped.` });
      skipped++;
      continue;
    }
    const scope = (policy?.scopes || []).find((s) => globMatch(s.glob, f.rel));
    const ch = channel || scope?.channel || (/changelog/i.test(path.basename(f.rel)) ? 'changelog' : 'docs');
    const r = lintText(buf.toString('utf8'), { rel: f.rel, channel: ch, policy, profile });
    findings.push(...r.findings);
    warnings.push(...r.warnings);
    scanned++;
  }
  sortFindings(findings);
  const mode = enforce ? 'enforce' : 'advisory';
  const hard = findings.filter((x) => x.hard).length;
  const exitCode = enforce && hard ? 1 : 0;
  return {
    schemaVersion: 1,
    status: exitCode ? 'failed' : findings.length ? 'advisory' : 'clean',
    mode,
    filesScanned: scanned,
    filesSkipped: skipped,
    profileId: profile ? profile.profileId : null,
    policy: policy ? policy.name : null,
    findings: findings.map(({ hard: h, ...rest }) => ({ ...rest, hard: !!h })),
    warnings: warnings.map((w) => w.message),
    exitCode,
  };
}

const SEV_WORD = { error: 'error', warning: 'warning', note: 'note' };

export function lintTextReport(report) {
  const L = [];
  for (const f of report.findings) {
    L.push(`${f.path}:${f.line}:${f.column}  ${SEV_WORD[f.severity]}${f.hard ? ' (hard)' : ''}  ${f.message}  [${f.ruleId}]`);
    if (f.suggestion) L.push(`    Suggestion: ${f.suggestion}`);
  }
  if (report.findings.length) L.push('');
  for (const w of report.warnings) L.push(`warning: ${w}`);
  const hard = report.findings.filter((f) => f.hard).length;
  L.push(`${report.filesScanned} file${report.filesScanned === 1 ? '' : 's'} scanned, ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'} (${hard} from hard rules). Mode: ${report.mode}. Exit ${report.exitCode}.`);
  if (report.profileId) L.push('Style advice comes from your own voice profile; it never fails a run. Surface style only.');
  return L.join('\n');
}
