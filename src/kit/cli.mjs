// Maintainer Voice Kit: `kit init` scaffolds .selfclone-kit/ without overwriting anything, and
// `kit check` validates it: the policy schema, no private data, hard rules, portability and the
// sample workflow. The kit never contains the private profile or any of its numbers beyond one
// coarse, rounded paragraph limit.
import fs from 'node:fs';
import path from 'node:path';
import { parsePolicy } from '../lint/policy.mjs';
import { assertProfile, channelEstimate } from '../profile/build.mjs';
import { invalid, ioError } from '../errors.mjs';
import { scrub } from '../scrub.mjs';
import { readJsonl } from '../util.mjs';

const TEMPLATE = new URL('../../templates/maintainer-kit/', import.meta.url);
const SCHEMA = new URL('../../schemas/voice-policy.v1.schema.json', import.meta.url);
export const KIT_DIR = '.selfclone-kit';

export const KIT_FILES = [
  'README.md',
  'voice-policy.json',
  'schemas/voice-policy.v1.schema.json',
  'AGENTS.snippet.md',
  'skills/maintainer-voice/SKILL.md',
  'examples/release-note.md',
  'examples/review-reply.md',
  'voice-lint.workflow.yml.sample',
];

function templateText(rel) {
  if (rel === 'schemas/voice-policy.v1.schema.json') return fs.readFileSync(SCHEMA, 'utf8');
  return fs.readFileSync(new URL(rel, TEMPLATE), 'utf8');
}

/** The starter policy, with the paragraph limit taken from the profile when one is given (rounded up to 25 words). */
export function starterPolicy(profile) {
  const policy = JSON.parse(templateText('voice-policy.json'));
  if (profile) {
    const est = channelEstimate(profile, 'docs');
    const limit = Math.min(200, Math.max(50, Math.ceil((est.features.p90Words * 3) / 25) * 25));
    const rule = policy.rules.find((r) => r.id === 'short-paragraphs');
    rule.maxWords = limit;
    policy.description += ' The paragraph limit was suggested from a private voice profile, rounded up to a multiple of 25 words.';
  }
  return JSON.stringify(policy, null, 2) + '\n';
}

export function kitInit(target, { profile = null } = {}) {
  const root = path.resolve(target);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw invalid('E_ARGS', `--target ${target} is not a folder.`, 'Pass the repository folder, for example --target .');
  const agentsBefore = fs.existsSync(path.join(root, 'AGENTS.md')) ? fs.readFileSync(path.join(root, 'AGENTS.md')) : null;
  const created = [];
  const skipped = [];
  for (const rel of KIT_FILES) {
    const file = path.join(root, KIT_DIR, ...rel.split('/'));
    const shown = `${KIT_DIR}/${rel}`;
    if (fs.existsSync(file)) {
      skipped.push(shown);
      continue;
    }
    const text = rel === 'voice-policy.json' ? starterPolicy(profile) : templateText(rel);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text, { flag: 'wx' }); // never overwrite, even in a race
    } catch (e) {
      if (e.code === 'EEXIST') {
        skipped.push(shown);
        continue;
      }
      throw ioError('E_IO', `Cannot write ${shown} (${e.code || 'error'}).`, 'Check the folder permissions.');
    }
    created.push(shown);
  }
  const agentsAfter = fs.existsSync(path.join(root, 'AGENTS.md')) ? fs.readFileSync(path.join(root, 'AGENTS.md')) : null;
  if (String(agentsBefore) !== String(agentsAfter)) throw new Error('AGENTS.md changed during kit init; this must never happen.');
  return { schemaVersion: 1, target: '.', kit: KIT_DIR, created, skipped, agentsMd: agentsBefore ? 'left unchanged; append AGENTS.snippet.md by hand if you want it' : 'not present; AGENTS.snippet.md is there if you want one' };
}

const URL_ALLOW = [/^https:\/\/github\.com\/logitsolutionsai\/selfclone\b/, /^https:\/\/agentskills\.io\b/, /^https:\/\/json-schema\.org\//, /^https:\/\/docs\.github\.com\//];

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), link: true });
    else if (st.isDirectory()) walk(abs, base, out);
    else if (st.isFile()) out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs, size: st.size });
  }
  return out;
}

function frontmatter(text) {
  const m = String(text).replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** Validate a kit. Returns a report with one entry per check. */
export function kitCheck(target, { workspace = null } = {}) {
  const root = path.resolve(target);
  const kit = path.join(root, KIT_DIR);
  const checks = [];
  const add = (id, ok, detail, level = ok ? 'pass' : 'fail') => checks.push({ id, status: level, detail });
  if (!fs.existsSync(kit)) {
    add('kit-present', false, `No ${KIT_DIR}/ in the target. Run selfclone kit init --target ${target}.`);
    return finish(checks);
  }
  add('kit-present', true, `${KIT_DIR}/ found.`);
  const files = walk(kit);
  const texts = files.filter((f) => !f.link && f.size <= 1024 * 1024).map((f) => ({ ...f, text: fs.readFileSync(f.abs, 'utf8') }));

  // 1. Policy schema.
  let policy = null;
  try {
    policy = parsePolicy(fs.readFileSync(path.join(kit, 'voice-policy.json'), 'utf8'), `${KIT_DIR}/voice-policy.json`);
    add('policy-schema', true, `${policy.rules.length} rules, valid against voice-policy.v1.`);
  } catch (e) {
    add('policy-schema', false, e.message);
  }
  // 2. Hard rules: deterministic types only, each with a message; advisory-only types never hard.
  if (policy) {
    const hard = policy.rules.filter((r) => r.mode === 'hard');
    add('hard-rules', hard.every((r) => r.type !== 'min-context' && r.message), hard.length ? `Hard rules (fail only with --enforce): ${hard.map((r) => r.id).join(', ')}.` : 'No hard rules: the kit can never fail a run.');
  }
  // 3. No private data.
  const leaks = [];
  const trainLines = [];
  if (workspace && fs.existsSync(path.join(workspace, 'train.jsonl'))) {
    for (const r of readJsonl(path.join(workspace, 'train.jsonl'))) for (const l of String(r.text).split('\n')) if (l.trim().length >= 24) trainLines.push(l.trim());
  }
  for (const f of files.filter((x) => x.link)) leaks.push(`${f.rel}: a symbolic link`);
  const shippedSchema = fs.readFileSync(SCHEMA, 'utf8');
  for (const f of texts) {
    const t = f.text;
    // The schema copy is checked for integrity instead: it must be the one selfclone ships.
    if (f.rel === 'schemas/voice-policy.v1.schema.json') {
      const lf = (s) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
      if (lf(t) !== lf(shippedSchema)) leaks.push(`${f.rel}: differs from the schema selfclone ships`);
      continue;
    }
    if (/"(?:trainingDigest|profileId|consentRecordId|sealedMessagesRead)"/.test(t) || /\bconsent-[0-9a-f]{12}\b/.test(t)) leaks.push(`${f.rel}: voice profile or consent data`);
    if (/sha256:[0-9a-f]{64}/.test(t)) leaks.push(`${f.rel}: a digest from a profile or a card`);
    if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t.replace(/actions\/[\w-]+@v\d+|codeql-action\/[\w-]+@v\d+/g, ''))) leaks.push(`${f.rel}: an email address`);
    if (/(?:^|[\s"'(])(?:[A-Za-z]:\\|\/Users\/|\/home\/)/m.test(t)) leaks.push(`${f.rel}: an absolute local path`);
    for (const u of t.match(/https?:\/\/[^\s)"'<>`]+/g) || []) if (!URL_ALLOW.some((re) => re.test(u))) leaks.push(`${f.rel}: a link outside the allowlist (${u.slice(0, 60)})`);
    const counts = scrub(t).counts;
    const hits = Object.keys(counts).filter((k) => k !== 'URL');
    if (hits.length) leaks.push(`${f.rel}: text the scrubber treats as a secret (${hits.join(', ')})`);
    for (const l of trainLines) if (t.includes(l)) {
      leaks.push(`${f.rel}: a line from the training split`);
      break;
    }
  }
  add('no-private-data', !leaks.length, leaks.length ? leaks.join('; ') : `${texts.length} files scanned: no profile data, digests, emails, local paths, unknown links or secrets${trainLines.length ? ', and no line from the training split' : ''}.`);
  // 4. Portability: the agent skill's frontmatter follows the Agent Skills format.
  const skillDirs = fs.existsSync(path.join(kit, 'skills')) ? fs.readdirSync(path.join(kit, 'skills')) : [];
  const problems = [];
  for (const d of skillDirs) {
    const f = path.join(kit, 'skills', d, 'SKILL.md');
    if (!fs.existsSync(f)) {
      problems.push(`skills/${d}: no SKILL.md`);
      continue;
    }
    const fm = frontmatter(fs.readFileSync(f, 'utf8'));
    if (!fm) problems.push(`skills/${d}/SKILL.md: no frontmatter`);
    else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.name || '') || fm.name.length > 64) problems.push(`skills/${d}: name must be lowercase letters, digits and single hyphens, at most 64 characters`);
      if (fm.name !== d) problems.push(`skills/${d}: name "${fm.name}" does not match its folder`);
      if (!fm.description || fm.description.length > 1024) problems.push(`skills/${d}: description must have 1 to 1024 characters`);
    }
  }
  if (!fs.existsSync(path.join(kit, 'AGENTS.snippet.md'))) problems.push('no AGENTS.snippet.md');
  add('portability', !problems.length, problems.length ? problems.join('; ') : `${skillDirs.length} agent skill${skillDirs.length === 1 ? '' : 's'} with valid frontmatter; AGENTS.snippet.md present; plain Markdown and JSON only.`);
  // 5. The workflow sample: disabled, pull_request only, read-only, no secrets.
  const wf = texts.filter((f) => /\.ya?ml(\.sample)?$/.test(f.rel));
  const wfProblems = [];
  for (const f of wf) {
    const code = f.text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    if (!f.rel.endsWith('.sample')) wfProblems.push(`${f.rel}: workflow files in the kit must stay disabled (.sample)`);
    if (/pull_request_target/.test(code)) wfProblems.push(`${f.rel}: uses pull_request_target`);
    if (!/^\s*pull_request:/m.test(code)) wfProblems.push(`${f.rel}: not triggered by pull_request`);
    if (!/permissions:\s*\n\s*contents:\s*read\s*$/m.test(code) || /:\s*write\b/.test(code)) wfProblems.push(`${f.rel}: permissions must be contents: read only`);
    if (/\$\{\{\s*secrets\./.test(code)) wfProblems.push(`${f.rel}: uses secrets`);
    if (/run:.*\bpr\/(?!\.selfclone-kit\/voice-policy\.json)\S*\.(?:sh|js|mjs|cjs|py)\b|npm (?:ci|install|run)/.test(code)) wfProblems.push(`${f.rel}: runs code from the pull request`);
  }
  add('workflow', !wfProblems.length, wfProblems.length ? wfProblems.join('; ') : wf.length ? `${wf.length} disabled sample, pull_request only, contents: read, no secrets, runs no code from the pull request.` : 'No workflow sample.');
  return finish(checks);
}

function finish(checks) {
  const failed = checks.filter((c) => c.status === 'fail').length;
  return { schemaVersion: 1, status: failed ? 'problems' : 'ok', checks, exitCode: failed ? 1 : 0 };
}

export async function cmdKit(args, dir, { loadProfile, outLine }) {
  const sub = args._[0];
  const target = args.target && args.target !== true ? String(args.target) : '.';
  if (sub === 'init') {
    const profile = args.profile ? assertProfile(loadProfile(args.profile === true ? path.join(dir, 'voice-profile.v1.json') : String(args.profile))) : null;
    const r = kitInit(target, { profile });
    if (args.json) return outLine(JSON.stringify(r, null, 2));
    outLine(`Maintainer Voice Kit in ${path.join(target, KIT_DIR)}: ${r.created.length} created, ${r.skipped.length} left as they were.`);
    for (const f of r.created) outLine(`  + ${f}`);
    for (const f of r.skipped) outLine(`  = ${f} (exists, not overwritten)`);
    outLine(`  AGENTS.md: ${r.agentsMd}.`);
    outLine(`Next: selfclone kit check --target ${target}`);
    return;
  }
  if (sub === 'check') {
    const r = kitCheck(target, { workspace: fs.existsSync(path.join(dir, 'train.jsonl')) ? dir : null });
    if (args.json) outLine(JSON.stringify(r, null, 2));
    else {
      for (const c of r.checks) outLine(`${c.status === 'pass' ? 'pass' : 'FAIL'}  ${c.id}: ${c.detail}`);
      outLine(r.status === 'ok' ? 'Kit OK.' : 'Kit has problems (exit 1).');
    }
    process.exitCode = r.exitCode;
    return;
  }
  throw invalid('E_ARGS', 'Usage: selfclone kit init --target <repo> | selfclone kit check --target <repo>', 'Run selfclone kit --help.');
}
