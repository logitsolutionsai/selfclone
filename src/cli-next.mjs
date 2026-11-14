// The Voice CI and Voice Passport commands: consent, profile, lint, stylecard, kit, delta, drift.
// Each has --help and --json, structured errors, and the exit codes in src/errors.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { readJsonl, writeText } from './util.mjs';
import { CliError, invalid, ioError, wrapIo, EXIT } from './errors.mjs';
import { stableStringify, safeJsonParse } from './schema.mjs';
import * as consent from './consent.mjs';
import { CHANNELS } from './profile/channels.mjs';

export const NEXT_COMMANDS = ['consent', 'profile', 'lint', 'stylecard', 'kit', 'delta', 'drift'];

export const HELP_NEXT = {
  consent: `selfclone consent [--grant "<statement>" --scope <scopes>] [--revoke <scope>] [--json]

Record, list or revoke consent for the writing features. Scopes: ${consent.SCOPES.join(', ')}.
  --grant "This is my own writing. <Full Name>"   add a consent record (idempotent)
  --scope local-lint,public-stylecard             scopes the record covers (default local-lint)
  --revoke public-stylecard                       block future runs that need this scope
Revoking blocks regeneration; it cannot delete files that were already shared.
Exit codes: 0 done, 2 invalid arguments.`,
  profile: `selfclone profile build [--dir .selfclone] [--out .selfclone/voice-profile.v1.json] [--consent "<statement>"] [--json]

Build the private, versioned voice profile from the training split only (train.jsonl; sealed.jsonl is
never opened). It holds numbers per channel (${CHANNELS.join(', ')}), never message text, sender ids,
URLs or file paths. Needs consent with the local-lint scope: pass --consent once, or run selfclone consent.
Exit codes: 0 built, 2 missing consent, missing training data or schema error, 3 IO error.`,
  lint: `selfclone lint <files or folders...> [--channel docs] [--profile .selfclone/voice-profile.v1.json]
    [--policy .selfclone-kit/voice-policy.json] [--enforce] [--json | --format text|json|sarif]
    [--out file] [--max-bytes 10485760] [--root .]

Check Markdown (.md, .mdx, .markdown) and text (.txt) drafts. Policy findings come from the project's
policy file; style advice comes from your own voice profile and never fails a run. Code, links, paths,
versions, issue references and other technical tokens are protected and never flagged by style rules.
Folders skip node_modules, .git, .selfclone, dist, binary files, symbolic links and the policy's ignore globs.
Modes: advisory (default) always exits 0; --enforce (or "defaultMode": "enforce" in the policy) exits 1
when a hard policy rule is broken. Files over 10 MiB are rejected (--max-bytes, at most 50 MiB).
Exit codes: 0 clean or advisory, 1 hard rule broken in enforce mode, 2 invalid arguments or policy, 3 IO error.`,
  stylecard: `selfclone stylecard --audience public|private [--out out/passport] [--profile <file>]
    [--display-name "<name>"] [--png] [--json]

Write a Voice Passport: passport.html (one offline file), passport.json and passport.svg, plus
passport.png with --png when Chrome, Edge or Chromium is installed. The public card is a coarse,
bucketed projection of your profile with no message text, names, links, samples or exact counts;
it needs consent with the public-stylecard scope. Nothing is uploaded.
Exit codes: 0 written (or not enough data, reported), 2 missing consent or profile, 3 IO error.`,
  kit: `selfclone kit init --target <repo> [--profile .selfclone/voice-profile.v1.json] [--json]
selfclone kit check --target <repo> [--json]

init writes .selfclone-kit/ into the repository without overwriting anything: voice-policy.json, the
policy schema, an AGENTS.md snippet (to append by hand), a portable agent skill, safe example drafts and
a disabled GitHub Actions sample. It never edits AGENTS.md or any other existing file.
check validates the kit: the policy schema, no private data, hard rules, portability and the workflow.
Exit codes: 0 done or all checks pass, 1 a check failed, 2 invalid arguments, 3 IO error.`,
  delta: `selfclone delta <before> <after> [--json]

Voice delta for a proposed rewrite: the edited lines only, and a byte-for-byte check that every protected
technical span (code, links, paths, versions, issue references, numbers in tokens) is unchanged. If any
differ, it reports E_FACT_PRESERVATION and does not recommend applying the rewrite. It protects tokens,
not every claim: read the edited lines too.
Exit codes: 0 tokens preserved, 1 E_FACT_PRESERVATION, 2 invalid arguments, 3 IO error.`,
  drift: `selfclone drift --before <from>..<to> --after <from>..<to> [--channel dev] [--seed s] [--json] [--out file]

Compare two non-overlapping date windows of your own training split: surface features only, with
bootstrap confidence intervals over whole conversations (1,000 resamples, fixed seed). Each window needs
100 messages in 20 conversations spanning 4 weeks; otherwise the result is insufficient_data (a success,
with no numbers). Exploratory: many features are tested at once, so treat flagged changes as hints.
Exit codes: 0 reported (including insufficient_data), 2 invalid or overlapping windows, 3 IO error.`,
};

const outLine = (s) => process.stdout.write(s + '\n');

function readTrain(dir) {
  const f = path.join(dir, 'train.jsonl');
  if (!fs.existsSync(f)) throw invalid('E_NO_TRAINING', `No training split in ${dir}.`, 'Run selfclone ingest <exports> --me "<your name>" first, or pass --dir.');
  try {
    return readJsonl(f);
  } catch (e) {
    throw ioError('E_IO', `Cannot read ${f}: ${e.message}`, 'Re-run selfclone ingest.');
  }
}

export function loadProfile(file) {
  if (!fs.existsSync(file)) throw invalid('E_NO_PROFILE', `No voice profile at ${file}.`, 'Run selfclone profile build first, or pass --profile <file>.');
  let p;
  try {
    p = safeJsonParse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw invalid('E_PROFILE_SCHEMA', `${file} is not valid JSON: ${e.message}.`, 'Rebuild it with selfclone profile build.');
  }
  return p;
}

function writeOut(file, text) {
  try {
    writeText(file, text);
  } catch (e) {
    throw wrapIo(e, file);
  }
}

const relShown = (f) => path.relative(process.cwd(), path.resolve(f)).split(path.sep).join('/') || '.';

function numArg(args, key, fallback, min, max) {
  if (args[key] == null || args[key] === true) return fallback;
  const v = Number(args[key]);
  if (!Number.isFinite(v) || v < min || v > max) throw invalid('E_ARGS', `--${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} must be a number from ${min} to ${max}, not "${args[key]}".`, 'Fix the option value.');
  return v;
}

async function cmdConsent(args, dir) {
  if (args.grant && args.revoke) throw invalid('E_ARGS', 'Pass --grant or --revoke, not both.', 'Run them one at a time.');
  if (args.grant) {
    const rec = consent.grant(dir, typeof args.grant === 'string' ? args.grant : '', consent.parseScopes(args.scope));
    if (args.json) return outLine(JSON.stringify({ schemaVersion: 1, granted: { id: rec.id, scopes: rec.scopes } }, null, 2));
    return outLine(`Recorded consent ${rec.id} for ${rec.scopes.join(', ')} in ${relShown(path.join(dir, 'consent.json'))}.`);
  }
  if (args.revoke) {
    const scope = consent.parseScopes(args.revoke)[0];
    const n = consent.revoke(dir, scope);
    if (args.json) return outLine(JSON.stringify({ schemaVersion: 1, revoked: scope, records: n }, null, 2));
    return outLine(`Revoked "${scope}" on ${n} record${n === 1 ? '' : 's'}. Future runs that need it will stop. Files already shared are not deleted by this.`);
  }
  const l = consent.readLedger(dir);
  const rows = l.records.map((r) => ({ id: r.id, scopes: r.scopes, revoked: Object.keys(r.revoked).sort(), grantedAt: r.grantedAt }));
  if (args.json) return outLine(JSON.stringify({ schemaVersion: 1, records: rows }, null, 2));
  if (!rows.length) return outLine('No consent recorded. Grant it with selfclone consent --grant "This is my own writing. <Full Name>" --scope local-lint');
  for (const r of rows) outLine(`${r.id}  ${r.scopes.join(', ')}${r.revoked.length ? `  (revoked: ${r.revoked.join(', ')})` : ''}  granted ${r.grantedAt.slice(0, 10)}`);
}

async function cmdProfile(args, dir) {
  const sub = args._[0];
  if (sub !== 'build') throw invalid('E_ARGS', 'Usage: selfclone profile build [--out file] [--consent "<statement>"]', 'Run selfclone profile --help.');
  const { buildProfile } = await import('./profile/build.mjs');
  if (args.consent) consent.grant(dir, typeof args.consent === 'string' ? args.consent : '', ['local-lint']);
  const rec = consent.requireConsent(dir, 'local-lint');
  const train = readTrain(dir);
  const { profile, warnings } = buildProfile(train, { consentRecordId: rec.id });
  const file = args.out || path.join(dir, 'voice-profile.v1.json');
  writeOut(file, stableStringify(profile));
  if (args.json) return outLine(JSON.stringify({ schemaVersion: 1, profile: relShown(file), profileId: profile.profileId, trainMessages: profile.source.trainMessages, channels: Object.fromEntries(Object.entries(profile.channels).map(([k, v]) => [k, { messageCount: v.messageCount, threadCount: v.threadCount, confidence: v.confidence, fallback: v.fallback }])), warnings }, null, 2));
  outLine(`Built voice profile ${profile.profileId} from ${profile.source.trainMessages} training messages (sealed set not read): ${relShown(file)}`);
  for (const [k, v] of Object.entries(profile.channels)) outLine(`  ${k.padEnd(9)} ${String(v.messageCount).padStart(5)} messages, ${String(v.threadCount).padStart(4)} conversations, confidence ${v.confidence}${v.fallback ? `, blended with ${v.fallback}` : ''}`);
  for (const w of warnings) outLine(`  note: ${w}`);
  outLine('Private: keep it in .selfclone/. Next: selfclone lint <file> --profile ' + relShown(file));
}

async function cmdLint(args, dir) {
  const { lintPaths, lintTextReport, DEFAULT_MAX_BYTES, HARD_MAX_BYTES } = await import('./lint/lint.mjs');
  const { loadPolicy } = await import('./lint/policy.mjs');
  const { assertProfile } = await import('./profile/build.mjs');
  if (!args._.length) throw invalid('E_ARGS', 'Give at least one file or folder: selfclone lint docs/README.md', 'Run selfclone lint --help.');
  const format = args.format && args.format !== true ? String(args.format) : args.json ? 'json' : 'text';
  if (!['text', 'json', 'sarif'].includes(format)) throw invalid('E_ARGS', `--format must be text, json or sarif, not "${args.format}".`, 'Pick one of the three.');
  const policy = args.policy ? loadPolicy(String(args.policy)) : null;
  let profile = null;
  if (args.profile) {
    const file = args.profile === true ? path.join(dir, 'voice-profile.v1.json') : String(args.profile);
    profile = assertProfile(loadProfile(file));
  }
  const enforce = !!args.enforce || (policy?.defaultMode === 'enforce' && args.enforce !== false);
  const maxBytes = numArg(args, 'maxBytes', DEFAULT_MAX_BYTES, 1, HARD_MAX_BYTES);
  const report = lintPaths(args._, { root: path.resolve(args.root && args.root !== true ? String(args.root) : '.'), policy, profile, channel: args.channel && args.channel !== true ? String(args.channel) : null, enforce, maxBytes });
  let text;
  if (format === 'json') text = JSON.stringify(report, null, 2);
  else if (format === 'sarif') {
    const { toSarif } = await import('./lint/sarif.mjs');
    text = JSON.stringify(toSarif(report, { policy }), null, 2);
  } else text = lintTextReport(report);
  if (args.out) {
    writeOut(String(args.out), text + '\n');
    if (format !== 'text') process.stderr.write(`Wrote ${relShown(String(args.out))}: ${report.findings.length} findings, exit ${report.exitCode}\n`);
    else outLine(text);
  } else outLine(text);
  process.exitCode = report.exitCode;
}

export async function runNext(cmd, args, dir) {
  if (args.help) {
    outLine(HELP_NEXT[cmd]);
    return;
  }
  switch (cmd) {
    case 'consent':
      return cmdConsent(args, dir);
    case 'profile':
      return cmdProfile(args, dir);
    case 'lint':
      return cmdLint(args, dir);
    case 'stylecard': {
      const { cmdStylecard } = await import('./passport/cli.mjs');
      return cmdStylecard(args, dir, { loadProfile, writeOut, outLine, relShown });
    }
    case 'kit': {
      const { cmdKit } = await import('./kit/cli.mjs');
      return cmdKit(args, dir, { loadProfile, writeOut, outLine, relShown });
    }
    case 'delta': {
      const { cmdDelta } = await import('./kit/delta.mjs');
      return cmdDelta(args, { outLine });
    }
    case 'drift': {
      const { cmdDrift } = await import('./drift/drift.mjs');
      return cmdDrift(args, dir, { readTrain, writeOut, outLine, relShown });
    }
    default:
      throw new CliError('E_ARGS', `Unknown command "${cmd}".`, { exitCode: EXIT.INVALID });
  }
}
