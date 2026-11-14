#!/usr/bin/env node
// selfclone command line. Run `selfclone help` for usage.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, workDir, readJsonl, writeJsonl, readJson, writeJson, writeText, VERSION, sealedDigestCheck } from '../src/cli-helpers.mjs';
import { ingest, FORMATS } from '../src/ingest/index.mjs';
import { split } from '../src/split.mjs';
import { scrub } from '../src/scrub.mjs';
import { fingerprint, fingerprintMarkdown } from '../src/fingerprint.mjs';
import { buildPack } from '../src/pack.mjs';
import { score, reportMarkdown, parseReplies } from '../src/score.mjs';
import { buildRounds, gameHtml } from '../src/game.mjs';
import { voicecheck, voicecheckText, KINDS } from '../src/voicecheck.mjs';

// Paths are stored relative to the working folder, so workspace files never record a user's home or drive path.
const relPath = (x) => path.relative(process.cwd(), path.resolve(x)).split(path.sep).join('/') || '.';

const HELP = () => `selfclone ${VERSION}: clone your writing style, give it a face, and measure how close it gets.

Usage:
  selfclone ingest <paths...> --me "<name or handle>"   Parse exports into .selfclone/ and seal a test set
      [--format ${FORMATS.join('|')}]
      [--no-scrub] [--seed s] [--name "Display Name"]
  selfclone scrub <file> [--out file]                  Print a file with secrets replaced by placeholders
  selfclone fingerprint                                Measure style on the training split (style.json, style.md)
  selfclone pack [--max-chars 60000]                   Write distill-pack.md for Claude to read
  selfclone test prompts                               Write test-prompts.json (sealed contexts, no answers)
  selfclone test score --clone <file> --bare <file>    Score replies against the sealed real replies
  selfclone game [--clone file] [--rounds 10]          Write can-you-tell.html
  selfclone voicecheck <file|-> [--as message|post|email] [--json] [--min 80]
                                                       Does this draft sound like me? Score any text against your
                                                       style (a replies JSON file is checked as a set)
  selfclone export [--to all|system-prompt|chatgpt|claude-project|agents-md|persona] [--clone out/<slug>-clone]
                                                       Ready-to-paste files for other tools, in <clone>/export/
  selfclone face [--port 7319] [--no-open]             Enrol your face with the webcam (local page)
  selfclone bake --photo <img> --consent "<statement>" Bake avatar.html from a still photo (headless Chrome)
  selfclone bake --video <clip> --consent "<statement>" Better: bake from a ~10 s clip of you reading the enrol phrase
      [--name "Full Name"] [--glasses auto|yes|no] [--out file]
  selfclone serve [--port 7320] [--no-open]            Serve the avatar so other commands can make it speak
  selfclone say "text" | selfclone say --audio <file>  Make the open avatar speak
  selfclone video --audio voice.wav [-o out.webm|out.mp4] [--avatar .selfclone/avatar.html]
      [--size 480] [--shape circle|square] [--background transparent|#hex] [--max-minutes 10]
                                                       A face on camera without the camera: the avatar
                                                       lip-synced to your own recorded voice, labelled
                                                       AI CLONE on every frame, for screen recordings
  selfclone status                                     Show what is in .selfclone/

Options for every command: --dir <folder> (default .selfclone, or SELFCLONE_DIR)
Docs: https://github.com/logitsolutionsai/selfclone`;

function out(...a) {
  process.stdout.write(a.join(' ') + '\n');
}

// A numeric option, checked: "--max-chars abc" is an error, not NaN.
function num(args, key, fallback, min, max) {
  if (args[key] == null || args[key] === true) return fallback;
  const v = Number(args[key]);
  const flag = '--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${flag} must be a number from ${min} to ${max}, not "${args[key]}".`);
  return v;
}

function need(file, hint) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${path.basename(file)}. ${hint}`);
  }
}

async function main(argv) {
  const [cmd, ...rest0] = argv;
  // -o is the usual short form of --out (selfclone video -o talk.webm).
  const rest = rest0.map((a) => (a === '-o' ? '--out' : a));
  const args = parseArgs(rest, { multi: ['me'], booleans: ['no-scrub', 'no-open', 'strict', 'json', 'all'] });
  const dir = workDir(args);
  const p = (f) => path.join(dir, f);

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      out(HELP());
      return;
    case '--version':
    case 'version':
      out(VERSION);
      return;

    case 'ingest': {
      const paths = args._;
      if (!paths.length) throw new Error('Give at least one export file or folder: selfclone ingest <paths...> --me "Your Name"');
      const me = args.me || [];
      const scrubText = args.scrub !== false && !args.noScrub;
      const { records, stats, scrubCounts, authors } = ingest(paths, { me, format: args.format, scrubText });
      if (!records.length) {
        const top = authors.slice(0, 12).map(([a, n]) => `  ${a} (${n})`).join('\n');
        throw new Error(`No messages matched --me ${JSON.stringify(me.join(', ') || '(none)')}.` + (top ? `\nAuthors found:\n${top}\nPass one of these with --me (comma-separate several names).` : ''));
      }
      // Stable sort by time keeps the export order of messages sent in the same minute.
      records.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
      const seed = String(args.seed || 'selfclone');
      const { train, sealed, meta } = split(records, { seed, fraction: num(args, 'fraction', 0.15, 0, 0.9), minSealed: num(args, 'minSealed', 20, 0, 1e6) });
      fs.mkdirSync(dir, { recursive: true });
      writeJsonl(p('corpus.jsonl'), records);
      writeJsonl(p('train.jsonl'), train);
      writeJsonl(p('sealed.jsonl'), sealed);
      const name = args.name || (me[0] ? String(me[0]).split(',')[0] : 'me');
      writeJson(p('split.json'), meta);
      writeJson(p('ingest.json'), { version: VERSION, name, me, inputs: paths.map((x) => relPath(x)), scrubbed: scrubText, stats, scrubCounts, createdAt: new Date().toISOString() });
      out(`Ingested ${records.length} of your messages into ${dir}`);
      for (const [fmt, s] of Object.entries(stats)) out(`  ${fmt}: ${s.mine} yours, ${s.others} from others, ${s.withContext} with context`);
      out(scrubText ? `  scrubbed: ${Object.entries(scrubCounts).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing found'}` : '  scrubbing OFF (--no-scrub)');
      out(`Sealed ${meta.sealedPairs} context-reply pairs (${meta.sealedMessages} messages) out of ${meta.eligiblePairs} eligible; ${meta.trainMessages} messages left for training.`);
      if (meta.sealedPairs < 20) out(`  Note: fewer than 20 sealed pairs, so the fidelity score will be noisy. Add more chat exports with replies.`);
      out(`Next: selfclone fingerprint`);
      return;
    }

    case 'scrub': {
      const file = args._[0];
      if (!file) throw new Error('Usage: selfclone scrub <file> [--out file]');
      const r = scrub(fs.readFileSync(file, 'utf8'));
      if (args.out) {
        writeText(args.out, r.text);
        out(`Wrote ${args.out}`);
      } else process.stdout.write(r.text);
      process.stderr.write(`\nscrubbed: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing found'}\n`);
      return;
    }

    case 'fingerprint': {
      need(p('train.jsonl'), 'Run selfclone ingest first.');
      const train = readJsonl(p('train.jsonl'));
      const info = fs.existsSync(p('ingest.json')) ? readJson(p('ingest.json')) : { name: 'me' };
      const fp = fingerprint(train);
      writeJson(p('style.json'), fp);
      writeText(p('style.md'), fingerprintMarkdown(fp, { name: info.name }));
      out(`Fingerprint of ${fp.messages} training messages written to ${p('style.json')} and style.md`);
      out(`  median ${fp.lengthWords.median} words per message, ${Math.round(fp.features.lowercaseStartRate * 100)}% start lowercase, ${Math.round(fp.features.emojiMsgRate * 100)}% use emoji, ${fp.signaturePhrases.length} signature phrases`);
      out('Next: selfclone pack');
      return;
    }

    case 'pack': {
      need(p('train.jsonl'), 'Run selfclone ingest first.');
      const train = readJsonl(p('train.jsonl'));
      const sealed = readJsonl(p('sealed.jsonl'));
      const info = fs.existsSync(p('ingest.json')) ? readJson(p('ingest.json')) : { name: 'me' };
      const fp = fs.existsSync(p('style.json')) ? readJson(p('style.json')) : fingerprint(train);
      const maxChars = num(args, 'maxChars', 60000, 1000, 1e7);
      const { markdown, sample } = buildPack({ train, sealed, fp, name: info.name, maxChars, seed: String(args.seed || 'selfclone') });
      writeText(p('distill-pack.md'), markdown);
      out(`Wrote ${p('distill-pack.md')}: ${sample.length} sample messages, ${markdown.length} characters (limit ${maxChars}). No sealed messages included.`);
      if (markdown.length > maxChars) out(`  Note: the pack is over the limit because the fingerprint summary and at least a few sample turns always go in.`);
      return;
    }

    case 'test': {
      const sub = args._[0];
      need(p('sealed.jsonl'), 'Run selfclone ingest first.');
      const sealed = readJsonl(p('sealed.jsonl'));
      sealedDigestCheck(dir, sealed);
      if (sub === 'prompts') {
        if (!sealed.length) {
          throw new Error('There is no sealed test set, so there is nothing to test. The test needs replies you sent to someone else (three words or more), which notes and X posts do not have. Add a chat export (WhatsApp, Telegram, Slack or email) and run selfclone ingest again.');
        }
        const prompts = sealed.map((s) => ({ id: s.id, source: s.source, context: s.context }));
        writeJson(p('test-prompts.json'), {
          instructions: 'For each prompt, write the reply this person would send in this chat. Return JSON: [{"id": "...", "reply": "..."}]. Do not read sealed.jsonl, train.jsonl or corpus.jsonl.',
          count: prompts.length,
          prompts,
        });
        out(`Wrote ${prompts.length} prompts to ${p('test-prompts.json')} (contexts only, no answers).`);
        return;
      }
      if (sub === 'score') {
        if (!args.clone && !args.bare) throw new Error('Usage: selfclone test score --clone <file> --bare <file>');
        const train = readJsonl(p('train.jsonl'));
        const clone = args.clone ? parseReplies(fs.readFileSync(args.clone, 'utf8')) : new Map();
        const bare = args.bare ? parseReplies(fs.readFileSync(args.bare, 'utf8')) : new Map();
        const info = fs.existsSync(p('ingest.json')) ? readJson(p('ingest.json')) : { name: 'you' };
        const report = score({ train, sealed, clone, bare, seed: String(args.seed || 'selfclone') });
        report.inputs = { clone: args.clone ? relPath(args.clone) : null, bare: args.bare ? relPath(args.bare) : null };
        writeJson(p('report.json'), report);
        writeText(p('report.md'), reportMarkdown(report, { name: info.name }));
        const c = report.sets.clone;
        const b = report.sets.bare;
        out(`${c ? `Style match ${Math.round(c.styleMatch)}%` : 'No clone replies'}${b ? ` (bare model ${Math.round(b.styleMatch)}%)` : ''}; your real held-out replies: ${Math.round(report.sets.real.styleMatch)}%`);
        for (const w of report.warnings) out(`  warning: ${w}`);
        out(`Report: ${p('report.md')}`);
        return;
      }
      throw new Error('Usage: selfclone test prompts | selfclone test score --clone <file> --bare <file>');
    }

    case 'game': {
      need(p('sealed.jsonl'), 'Run selfclone ingest first.');
      // Default: the clone replies the last `test score` used, else .selfclone/clone-replies.json.
      const scored = fs.existsSync(p('report.json')) ? readJson(p('report.json')).inputs?.clone : null;
      const scoredPath = scored ? path.resolve(scored) : null;
      const cloneFile = args.clone || (fs.existsSync(p('clone-replies.json')) ? p('clone-replies.json') : scoredPath || p('clone-replies.json'));
      need(cloneFile, 'Pass --clone <file> with the clone replies to the test prompts.');
      const sealed = readJsonl(p('sealed.jsonl'));
      const clone = parseReplies(fs.readFileSync(cloneFile, 'utf8'));
      const info = fs.existsSync(p('ingest.json')) ? readJson(p('ingest.json')) : { name: 'this person' };
      const rounds = buildRounds({ sealed, clone, rounds: num(args, 'rounds', 10, 1, 1000), seed: String(args.seed || 'selfclone') });
      const file = args.out || p('can-you-tell.html');
      writeText(file, gameHtml({ rounds, name: info.name }));
      out(`Wrote ${file} with ${rounds.length} rounds. It contains real messages; share it only with people who could already read them.`);
      return;
    }

    case 'voicecheck': {
      const file = args._[0];
      if (!file) throw new Error('Usage: selfclone voicecheck <file|-> [--as message|post|email] [--json]. Pass - to read the draft from standard input.');
      need(p('train.jsonl'), 'Run selfclone ingest first.');
      if (args.as != null && !KINDS.includes(args.as)) throw new Error(`--as must be one of ${KINDS.join(', ')}, not "${args.as}".`);
      const raw = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
      // A replies file ([{"id": "...", "reply": "..."}]) is checked as a set of drafts.
      let draft = raw;
      if (/^\s*[[{]/.test(raw)) {
        try {
          const set = parseReplies(raw);
          if (set.size) draft = [...set.values()];
        } catch {
          // not JSON: check it as text
        }
      }
      const train = readJsonl(p('train.jsonl'));
      const info = fs.existsSync(p('ingest.json')) ? readJson(p('ingest.json')) : { name: null };
      const r = voicecheck({ train, draft, kind: args.as, top: num(args, 'top', 6, 1, 26), seed: String(args.seed || 'selfclone') });
      if (args.json) out(JSON.stringify(r, null, 2));
      else out(voicecheckText(r, { name: info.name }));
      if (args.min != null && r.voiceMatch < num(args, 'min', 0, 0, 100)) process.exitCode = 2;
      return;
    }

    case 'export': {
      const { writeExports, TARGET_NAMES } = await import('../src/export.mjs');
      let cloneDir = args.clone;
      if (!cloneDir) {
        const outDir = path.resolve('out');
        const found = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((d) => /-clone$/.test(d) && fs.existsSync(path.join(outDir, d, 'SKILL.md'))) : [];
        if (found.length !== 1) throw new Error(found.length ? `Several clones in out/ (${found.join(', ')}). Pick one with --clone out/<slug>-clone.` : 'No clone found in out/. Distill one first, or pass --clone <folder>.');
        cloneDir = path.join(outDir, found[0]);
      }
      const to = args.to && args.to !== true ? String(args.to) : 'all';
      const fp = fs.existsSync(p('style.json')) ? readJson(p('style.json')) : null;
      const report = fs.existsSync(p('report.json')) ? readJson(p('report.json')) : null;
      const { written } = writeExports(cloneDir, { to, fp, report, maxChars: args.maxChars != null ? num(args, 'maxChars', 12000, 1000, 1e6) : null });
      out(`Exported ${written.length} file${written.length === 1 ? '' : 's'} to ${relPath(path.join(cloneDir, 'export'))}/ (targets: ${TARGET_NAMES.join(', ')})`);
      for (const w of written) out(`  ${path.basename(w.file)}: ${w.info}`);
      if (!fp) out('  Note: no style.json in the workspace, so the voice rules were not ranked by the fingerprint. Run selfclone fingerprint (or pass --dir) for better exports.');
      out('Every export starts with the AI clone disclosure. Keep it when you paste.');
      return;
    }

    case 'face': {
      const { startEnrolServer } = await import('../src/face/server.mjs');
      await startEnrolServer({ dir, port: num(args, 'port', 7319, 0, 65535), open: args.open !== false && !args.noOpen });
      return;
    }

    case 'bake': {
      if (!args.photo && !args.video) throw new Error('Usage: selfclone bake --photo <img> --consent "<statement>"  or  selfclone bake --video <clip> --consent "<statement>"');
      if (args.photo && args.video) throw new Error('Pass either --photo or --video, not both.');
      if (!args.consent || typeof args.consent !== 'string' || args.consent.trim().length < 8) {
        throw new Error('Refusing to bake without consent. Pass --consent "This is my own face, <Full Name>" (or the written consent of the person shown).');
      }
      const { bakeFromPhoto } = await import('../src/face/bake.mjs');
      const outFile = args.out || p('avatar.html');
      const res = await bakeFromPhoto({
        photo: args.photo,
        video: args.video,
        consent: args.consent,
        name: args.name,
        glasses: args.glasses || 'auto',
        out: outFile,
        strict: !!args.strict,
      });
      out(`Baked ${outFile} (${Math.round(res.bytes / 1024)} KB, ${res.landmarks} landmarks, ${res.triangles} triangles, renderer chosen at load time).`);
      if (res.clip) {
        out(`  clip: ${res.clip.frames} frames read in memory; mouth patches for ${res.clip.shapes.length ? res.clip.shapes.join(', ') : 'no shape'}${res.clip.blink ? ', closed-eye patches' : ', no blink frame found'} (${Math.round(res.clip.bytes / 1024)} KB). The video itself was not copied.`);
      }
      for (const w of res.warnings) out(`  warning: ${w}`);
      return;
    }

    case 'serve': {
      const { startAvatarServer } = await import('../src/face/server.mjs');
      await startAvatarServer({ dir, port: num(args, 'port', 7320, 0, 65535), open: args.open !== false && !args.noOpen, avatar: args.avatar });
      return;
    }

    case 'say': {
      const { sayText, sayAudio } = await import('../src/face/server.mjs');
      const r = args.audio ? await sayAudio({ dir, file: args.audio }) : await sayText({ dir, text: args._.join(' ') });
      out(r.clients ? `Sent to ${r.clients} open avatar${r.clients === 1 ? '' : 's'}.` : 'Sent, but no avatar page is connected. Open the URL printed by selfclone serve.');
      return;
    }

    case 'video': {
      const { checkVideoArgs, exportVideo } = await import('../src/face/video.mjs');
      const o = checkVideoArgs(args, { dir });
      out(`Rendering ${relPath(o.out)} (${o.size} px, ${o.shape}, ${o.transparent ? 'transparent' : o.background}) from ${relPath(o.audio)}...`);
      const r = await exportVideo(o, { log: (m) => out(m) });
      out(`Wrote ${relPath(r.file)} (${Math.round(r.bytes / 1024)} KB, ${r.seconds.toFixed(1)} s, ${r.frames} frames) and ${path.basename(r.sidecar)}.`);
      out('Every frame carries the AI CLONE label and the file is tagged as an AI clone. Use only your own voice, or a voice clone of yourself.');
      return;
    }

    case 'status': {
      const files = ['corpus.jsonl', 'train.jsonl', 'sealed.jsonl', 'split.json', 'style.json', 'distill-pack.md', 'test-prompts.json', 'report.md', 'can-you-tell.html', 'avatar.html'];
      out(`selfclone workspace: ${dir}`);
      for (const f of files) {
        const fp = p(f);
        out(`  ${fs.existsSync(fp) ? 'yes' : ' - '}  ${f}${fs.existsSync(fp) ? ` (${Math.round(fs.statSync(fp).size / 1024)} KB)` : ''}`);
      }
      return;
    }

    default:
      throw new Error(`Unknown command "${cmd}". Run selfclone help.`);
  }
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`selfclone: ${err.message}\n`);
  process.exit(1);
});
