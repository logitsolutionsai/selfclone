// Export a distilled clone (out/<slug>-clone/) as ready-to-paste files for other tools:
// a generic system prompt, ChatGPT custom instructions, Claude Project instructions, an
// AGENTS.md / Cursor rules section for developer writing, and the structured persona.
//
// Every export starts with the AI clone disclosure, and is filled in priority order
// (disclosure, the voice rules that carry the most signal, then the rest), so cutting
// it to a size limit always drops the least important text first and never the disclosure.
import fs from 'node:fs';
import path from 'node:path';
import { KINDS } from './kinds.mjs';
import { round } from './util.mjs';

// Size limits, checked 2026-11-14. Characters unless the target counts bytes.
export const TARGETS = {
  'system-prompt': {
    file: 'system-prompt.md',
    max: 12000,
    note: 'A generic system prompt. 12,000 characters (about 3,000 tokens) is a selfclone default, not a platform limit; change it with --max-chars.',
  },
  chatgpt: {
    file: 'chatgpt-instructions.md',
    max: 1500,
    maxPaid: 5000,
    note: 'ChatGPT, Settings, Personalization, Custom instructions: up to 1,500 characters on the Free and Go plans and 5,000 on Plus, Pro, Business, Enterprise and Education (OpenAI help article "ChatGPT Custom Instructions", checked 2026-11-14).',
  },
  'claude-project': {
    file: 'claude-project.md',
    max: 16000,
    note: 'Claude Project instructions: up to 16,000 characters for Projects in Claude Code (code.claude.com, "Let Claude coordinate ongoing work with Projects", checked 2026-11-14). claude.ai chat Projects publish no limit; the same text fits.',
  },
  'agents-md': {
    file: 'agents-md.md',
    max: 6000,
    bytes: true,
    note: 'A section for AGENTS.md (Codex, and other agents that read it) or a Cursor rule. Codex reads at most project_doc_max_bytes of AGENTS.md text, 32 KiB by default, shared with the rest of the file, so this section stays under 6,000 bytes.',
  },
  persona: { file: 'persona.json', max: Infinity, note: 'The structured data behind the other exports.' },
};

export const TARGET_NAMES = Object.keys(TARGETS);

const size = (s, bytes) => (bytes ? Buffer.byteLength(s, 'utf8') : s.length);

// --- Reading the clone ----------------------------------------------------

function sections(md) {
  // "## Heading" sections, each with its bullets (continuation lines folded in) and its other text.
  const out = [];
  let cur = { title: '', lines: [] };
  for (const line of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      out.push(cur);
      cur = { title: h[1].trim(), lines: [] };
    } else cur.lines.push(line);
  }
  out.push(cur);
  for (const s of out) {
    s.bullets = [];
    s.text = [];
    let inFence = false;
    for (const l of s.lines) {
      if (/^```/.test(l)) inFence = !inFence;
      if (inFence || /^```/.test(l)) continue;
      if (/^\s*-\s+/.test(l)) s.bullets.push(l.replace(/^\s*-\s+/, '').trim());
      else if (/^\s{2,}\S/.test(l) && s.bullets.length) s.bullets[s.bullets.length - 1] += ' ' + l.trim();
      else if (l.trim() && !/^#\s/.test(l)) s.text.push(l.trim());
    }
  }
  return out.filter((s) => s.title || s.bullets.length || s.text.length);
}

function parseExamples(md) {
  const out = [];
  const parts = String(md).replace(/\r\n?/g, '\n').split(/^##\s+/m).slice(1);
  for (const p of parts) {
    const title = p.split('\n')[0].trim();
    const ctx = (p.match(/^>\s*them:\s*(.+)$/m) || [])[1] || null;
    const reply = (p.match(/```[a-z]*\n([\s\S]*?)\n```/) || [])[1] || null;
    if (reply) out.push({ title, context: ctx ? ctx.trim() : null, reply: reply.trim() });
  }
  return out;
}

export function readClone(cloneDir) {
  const skillFile = path.join(cloneDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) throw new Error(`No SKILL.md in ${cloneDir}. Distill the clone first (SKILL.md step 4).`);
  const skill = fs.readFileSync(skillFile, 'utf8');
  const ref = (f) => {
    const p = path.join(cloneDir, 'references', f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };
  const name = ((skill.match(/^#\s+(.+?)\s*\(AI Clone\)\s*$/m) || [])[1] || (skill.match(/^name:\s*(.+)$/m) || [])[1] || 'this person').trim();
  const slug = ((skill.match(/^name:\s*(.+)$/m) || [])[1] || path.basename(cloneDir)).trim();
  const skillSecs = sections(skill);
  const sec = (t) => skillSecs.find((s) => s.title.toLowerCase() === t.toLowerCase());
  const intro = skill.split(/^##\s/m)[0].replace(/^---[\s\S]*?---/, '').replace(/^#.*$/m, '').trim();
  return {
    name,
    firstName: name.split(/\s+/)[0],
    slug,
    intro,
    consent: sec('Consent') ? sec('Consent').text.join(' ') : '',
    fidelity: sec('Fidelity') ? sec('Fidelity').text.join(' ') : '',
    voice: sections(ref('voice.md')),
    mind: sections(ref('mind.md')),
    never: sections(ref('never.md')),
    examples: parseExamples(ref('examples.md')),
  };
}

// --- Rules from the fingerprint, ranked by how much voice they carry -------

const pct = (x) => `${round(x * 100, 1)}%`;

/**
 * Concrete rules from style.json. Each has a signal from 0 to 1: how far this person's habit sits from
 * what a model writes by default (capital starts, full stops, apostrophes, no laughter, long replies).
 * When report.json is there, the bare model's measured drift on that feature is used instead.
 */
export function fingerprintRules(fp, { first = 'They', report = null } = {}) {
  if (!fp || !fp.features) return [];
  const f = fp.features;
  const bareZ = {};
  if (report && Array.isArray(report.features)) for (const row of report.features) if (row.bareZ != null) bareZ[row.feature] = Math.min(5, Math.abs(row.bareZ)) / 5;
  const sig = (feature, heuristic) => round(Math.max(0, Math.min(1, feature in bareZ ? Math.max(bareZ[feature], heuristic * 0.5) : heuristic)), 3);
  const rules = [];
  const add = (feature, heuristic, text) => rules.push({ feature, signal: sig(feature, heuristic), text });

  if (f.lowercaseStartRate >= 0.6) add('lowercaseStartRate', f.lowercaseStartRate - 0.02, `Start messages in lowercase, "i" included (${pct(f.lowercaseStartRate)} of ${first}'s messages do). Capitals only for one shouted word.`);
  else if (f.lowercaseStartRate <= 0.2) add('lowercaseStartRate', 0.1, `Start sentences with a capital letter (${pct(1 - f.lowercaseStartRate)} of messages do).`);
  if (f.endPunctRate <= 0.4) add('endPunctRate', 0.95 - f.endPunctRate, `Leave the final full stop off: only ${pct(f.endPunctRate)} of messages end in punctuation.`);
  else if (f.endPunctRate >= 0.8) add('endPunctRate', 0.1, `End sentences with punctuation (${pct(f.endPunctRate)} of messages do).`);
  if (f.contractionRate >= 0.005 && f.apostropheDropRate >= 0.6) add('apostropheDropRate', f.apostropheDropRate, `Write contractions without the apostrophe: dont, im, thats, ill (${pct(f.apostropheDropRate)} of ${first}'s contractions).`);
  if (fp.lengthWords) {
    const m = fp.lengthWords.median;
    const s = Math.min(1, Math.abs(Math.log((m || 1) / 35)) / 2);
    const tail = m < 25 ? ' Never write a paragraph in chat.' : '';
    add('msgWords', s, `${m < 25 ? 'Keep messages short' : 'Message length'}: median ${m} words, 9 in 10 at ${fp.lengthWords.p90} words or fewer.${tail}`);
  }
  if (fp.bursts && fp.bursts.one <= 0.6) add('multiLineRate', 1 - fp.bursts.one, `Send a reply as a burst of short messages, one per line: ${pct(1 - fp.bursts.one)} of replies have two or more (mean ${fp.bursts.mean}).`);
  if (f.laughMsgRate >= 0.06) {
    const laughs = (fp.shorthand || []).map((w) => w.word).filter((w) => /^(?:lol|lmao|haha+|hehe|ahah)/.test(w)).slice(0, 2);
    add('laughMsgRate', Math.min(1, f.laughMsgRate * 3), `Laugh (${laughs.map((w) => `"${w}"`).join(', ') || '"lol"'}) in about ${pct(f.laughMsgRate)} of messages, not more.`);
  }
  if (f.emojiMsgRate >= 0.08) add('emojiMsgRate', Math.min(1, f.emojiMsgRate * 2), `Use an emoji in about ${pct(f.emojiMsgRate)} of messages, at most one per message${fp.topEmoji?.length ? ` (most used: ${fp.topEmoji.slice(0, 4).map((e) => e.emoji).join(' ')})` : ''}.`);
  else if (f.emojiMsgRate <= 0.01) add('emojiMsgRate', 0.2, 'Do not use emoji.');
  if (f.dashPer1k < 0.05) add('dashPer1k', 0.45, 'Never use dashes between clauses (no " - ", no "—").');
  if (f.semicolonPer1k < 0.05) add('semicolonPer1k', 0.35, 'Never use semicolons.');
  if (f.exclamationMsgRate <= 0.03) add('exclamationMsgRate', 0.25, 'Do not use exclamation marks.');
  if (fp.shorthand && fp.shorthand.length) {
    const share = fp.shorthand.slice(0, 3).reduce((a, w) => a + w.messages, 0) / Math.max(1, fp.messages);
    add('shorthand', Math.min(1, share * 2), `Shorthand ${first} uses, most common first: ${fp.shorthand.slice(0, 6).map((w) => w.word).join(', ')}. Use it where it fits; never force it in.`);
  }
  if (f.sentenceWords) add('sentenceWords', Math.min(1, Math.abs(Math.log(f.sentenceWords / 16)) / 1.5), `Sentences average ${round(f.sentenceWords, 0)} words.`);
  if (fp.openers && fp.openers.length && fp.openers[0].share >= 0.04) add('openers', 0.15, `Common first words: ${fp.openers.slice(0, 5).map((o) => `"${o.token}"`).join(', ')}.`);
  if (fp.byKind) {
    const names = { message: 'chat', post: 'posts', email: 'email' };
    const parts = KINDS.filter((k) => fp.byKind[k]).map((k) => {
      const v = fp.byKind[k];
      return `in ${names[k]}, median ${v.lengthWords.median} words, ${pct(v.lowercaseStartRate)} start lowercase, ${pct(v.endPunctRate)} end in punctuation`;
    });
    add('byKind', 0.5, `Match the channel: ${parts.join('; ')}.`);
  }
  return rules.sort((a, b) => b.signal - a.signal || a.feature.localeCompare(b.feature));
}

// --- Building and fitting -------------------------------------------------

const stripIds = (s) =>
  String(s)
    .replace(/\s*\((?:evidence|style\.md)[^)]*\)/gi, '')
    .replace(/\s*Evidence:[^.]*(?:\.|$)/gi, '')
    .replace(/\s*\[(?:[a-z]{1,4}-[0-9a-f]{6,}(?:,\s*)?)+\]/gi, '')
    .replace(/\(\s*[;,\s]*\)/g, '')
    .replace(/[;,]\s*\)/g, ')')
    .replace(/(?:\s*,)+\s*(?=[.;)]|$)/g, '')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/```/g, "'''");

export function disclosure(c, { dev = false } = {}) {
  if (dev) {
    return `Text you write in ${c.firstName}'s voice is drafted by an AI agent, not by ${c.name}. If anyone asks whether ${c.firstName} wrote it, say it was drafted by an AI in their voice. Never sign as ${c.firstName} in a way that hides that, and never invent facts about ${c.firstName}'s life, work or opinions.`;
  }
  return `You are an AI clone of ${c.name}, made with selfclone from their own messages. You are not ${c.name}. If anyone asks whether they are talking to ${c.firstName}, a bot or an AI, say plainly that you are an AI clone of ${c.firstName}. Never claim to be the real person, never impersonate them to someone who does not know, and never invent facts about their life, people, places or plans.`;
}

/**
 * Fill blocks in order into `max` characters (or bytes). A block is {title, items[], intro?, required?}.
 * Items are added one by one; the first item that does not fit ends the export, so the order is the priority.
 */
export function fit(blocks, { max, bytes = false, header = '', footer = (n) => `\n(Shortened to fit ${n}. The full clone has more rules and examples.)\n` }) {
  let out = header;
  let truncated = false;
  const limitLabel = `${max.toLocaleString('en-US')} ${bytes ? 'bytes' : 'characters'}`;
  const reserve = size(footer(limitLabel), bytes);
  for (const b of blocks) {
    const head = (b.title ? `\n## ${b.title}\n\n` : '\n') + (b.intro ? `${b.intro}\n\n` : '');
    if (b.required) {
      const text = head + b.items.map((i) => (b.bulleted === false ? `${i}\n` : `- ${i}\n`)).join('');
      if (size(out + text, bytes) + reserve > max) throw new Error(`The limit of ${limitLabel} is too small for the AI clone disclosure.`);
      out += text;
      continue;
    }
    let added = 0;
    let piece = head;
    for (const item of b.items) {
      const line = b.bulleted === false ? `${item}\n` : `- ${item}\n`;
      if (size(out + piece + line, bytes) + reserve > max) {
        truncated = true;
        break;
      }
      piece += line;
      added++;
    }
    if (added) out += piece;
    if (truncated) break;
  }
  if (truncated) out += footer(limitLabel);
  if (size(out, bytes) > max) throw new Error(`Internal error: export over ${limitLabel}.`);
  return { text: out, truncated };
}

function voiceItems(c, { ids }) {
  const items = [];
  for (const s of c.voice) for (const b of s.bullets) items.push(plain(ids ? b : stripIds(b)));
  return items.filter((x) => x && !/\{\{/.test(x));
}
function mindItems(c, { ids }) {
  const items = [];
  for (const s of c.mind) {
    if (/^unknown$/i.test(s.title)) continue;
    for (const b of s.bullets) items.push(plain(ids ? b : stripIds(b)));
    if (!s.bullets.length && s.text.length && s.title) items.push(`${s.title}: ${plain(ids ? s.text.join(' ') : stripIds(s.text.join(' ')))}`);
  }
  return items.filter((x) => x && !/\{\{/.test(x));
}
function unknownItem(c) {
  const u = c.mind.find((s) => /^unknown$/i.test(s.title));
  return u ? plain(stripIds([...u.text, ...u.bullets].join(' '))) : 'Anything the rules above do not cover: do not invent a view; say you do not know what they would say.';
}
function neverItems(c, { ids }) {
  const items = [];
  for (const s of c.never) for (const b of s.bullets) items.push(plain(ids ? b : stripIds(b)));
  return items.filter((x) => x && !/\{\{/.test(x));
}
function exampleItems(c, n) {
  return c.examples.slice(0, n).map((e) => `${e.context ? `Them: ${plain(e.context)}\n  ${c.firstName}: ` : `${c.firstName} (a post): `}${plain(e.reply).replace(/\n/g, ' / ')}`);
}

const MODES = (c) => [
  `Reply: given a pasted message, write the answer ${c.firstName} would send, in the norms of that channel (chat, email, a comment). Do not add plans, dates or promises they have not made; leave a gap such as [time?].`,
  `Write: posts, newsletters, bios and announcements in their voice for the audience named. A bio states only facts the user gives you.`,
  `Dev: commit messages, PR descriptions, review comments and docs. Code, commands and names stay exact; follow the repository's conventions first and the voice second; never invent test results.`,
  `Ask me: when asked what ${c.firstName} thinks, answer from the opinions below only. If they do not cover it, say "I do not know what ${c.firstName} would say about this."`,
  `Check: if the selfclone CLI is available, run selfclone voicecheck on each draft and revise against its list, at most 2 rounds; never cram every habit or phrase into one text.`,
];

export function buildExports(c, { fp = null, report = null, maxChars = null } = {}) {
  const rules = fingerprintRules(fp, { first: c.firstName, report });
  const ruleText = rules.map((r) => r.text);
  const out = {};
  const intro = plain(stripIds(c.intro)).split('\n').join(' ');

  // Generic system prompt and Claude Project: everything, in priority order.
  const full = (max, ids) =>
    fit(
      [
        { title: '', items: [disclosure(c)], required: true, bulleted: false },
        ...(intro ? [{ title: '', items: [intro], bulleted: false }] : []),
        { title: 'Voice (Most Important First)', items: ruleText },
        { title: 'Modes', items: MODES(c) },
        { title: 'Hard Limits', items: neverItems(c, { ids }) },
        { title: 'Voice Details', items: voiceItems(c, { ids }) },
        { title: 'How They Think', intro: 'Hold weak opinions loosely.', items: mindItems(c, { ids }) },
        { title: 'Unknown', items: [unknownItem(c)] },
        { title: 'Examples (Do Not Copy Word For Word)', items: exampleItems(c, 20) },
        ...(c.fidelity ? [{ title: 'Fidelity', items: [plain(c.fidelity)], bulleted: false }] : []),
      ],
      { max, header: `# ${c.name} (AI Clone)\n` }
    );
  out['system-prompt'] = full(maxChars || TARGETS['system-prompt'].max, true);
  out['claude-project'] = full(Math.min(maxChars || Infinity, TARGETS['claude-project'].max), true);

  // ChatGPT: short; no message ids (they mean nothing there).
  const gpt = (max) =>
    fit(
      [
        { title: '', items: [disclosure(c)], required: true, bulleted: false },
        { title: '', items: [`Write as ${c.firstName} writes:`], bulleted: false },
        { title: '', items: ruleText },
        { title: '', items: [`If you are asked what ${c.firstName} thinks and these instructions do not say, answer that you do not know what ${c.firstName} would say.`], bulleted: false },
        { title: '', items: neverItems(c, { ids: false }).filter((t) => !/real |impersonate/i.test(t)).slice(0, 3) },
        { title: '', items: mindItems(c, { ids: false }) },
      ],
      { max, header: '', footer: () => '' }
    );
  out.chatgpt = { short: gpt(TARGETS.chatgpt.max), long: gpt(TARGETS.chatgpt.maxPaid) };

  // AGENTS.md / Cursor rules: developer writing only.
  out['agents-md'] = fit(
    [
      { title: '', items: [`Use this when writing commit messages, PR descriptions, review comments, changelogs or docs for ${c.name}.`, disclosure(c, { dev: true })], required: true, bulleted: false },
      {
        title: '',
        items: [
          'Being exact comes first: code, identifiers, commands, paths, error messages and versions stay as they are. Never invent test results, benchmarks, issue numbers or approvals.',
          "Follow this repository's conventions first (commit prefixes, PR template, line length), then the voice below around them.",
          'PR description: what changed, why, and how it was tested, listing only tests that were actually run. Review comment: the line, the problem, a suggestion.',
          `Keep chat shorthand and laughter out of anything a stranger reviews; keep ${c.firstName}'s casing, sentence length and directness.`,
        ],
      },
      { title: '', intro: `${c.firstName}'s habits, strongest first:`, items: ruleText.filter((t) => !/^Send a reply as a burst|^Laugh|^Use an emoji|^Shorthand|^Match the channel/.test(t)) },
      { title: '', items: voiceItems(c, { ids: false }).filter((t) => /tone|direct|advis|verdict|sentence|comma/i.test(t) && !/burst|shorthand|emoji|laugh/i.test(t)) },
    ],
    { max: TARGETS['agents-md'].max, bytes: true, header: `## Writing In ${c.name}'s Voice\n`, footer: () => '' }
  );

  out.persona = {
    version: 1,
    name: c.name,
    firstName: c.firstName,
    slug: c.slug,
    aiClone: true,
    disclosure: disclosure(c),
    devDisclosure: disclosure(c, { dev: true }),
    consent: c.consent,
    fidelity: c.fidelity,
    sources: fp ? fp.sources : null,
    messages: fp ? fp.messages : null,
    fingerprint: fp
      ? {
          lengthWords: fp.lengthWords,
          bursts: fp.bursts || null,
          features: fp.features,
          shorthand: (fp.shorthand || []).slice(0, 10),
          topEmoji: (fp.topEmoji || []).slice(0, 10),
          byKind: fp.byKind || null,
        }
      : null,
    rules,
    modes: MODES(c),
    voice: voiceItems(c, { ids: true }),
    mind: mindItems(c, { ids: true }),
    unknown: unknownItem(c),
    never: neverItems(c, { ids: true }),
    examples: c.examples,
  };
  return out;
}

export function chatgptMarkdown(c, gpt) {
  return [
    `# ChatGPT Custom Instructions: ${c.name} (AI Clone)`,
    '',
    `Paste one of the two blocks into ChatGPT, Settings, Personalization, Custom instructions. The limit there is ${TARGETS.chatgpt.note.replace(/^ChatGPT, Settings, Personalization, Custom instructions: /, '')}`,
    '',
    `## All Plans (${gpt.short.text.length} Of 1,500 Characters)`,
    '',
    '```text',
    gpt.short.text.trim(),
    '```',
    '',
    `## Paid Plans (${gpt.long.text.length} Of 5,000 Characters)`,
    '',
    '```text',
    gpt.long.text.trim(),
    '```',
    '',
  ].join('\n');
}

/** Write the chosen exports into <cloneDir>/export/ and return what was written. */
export function writeExports(cloneDir, { to = 'all', fp = null, report = null, maxChars = null } = {}) {
  const want = to === 'all' ? TARGET_NAMES : String(to).split(',').map((t) => t.trim());
  for (const t of want) if (!TARGETS[t]) throw new Error(`Unknown export target "${t}". Use one of: ${TARGET_NAMES.join(', ')}, all.`);
  const c = readClone(cloneDir);
  const ex = buildExports(c, { fp, report, maxChars });
  const dir = path.join(cloneDir, 'export');
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const t of want) {
    const file = path.join(dir, TARGETS[t].file);
    let body;
    let info;
    if (t === 'chatgpt') {
      body = chatgptMarkdown(c, ex.chatgpt);
      info = `${ex.chatgpt.short.text.trim().length} and ${ex.chatgpt.long.text.trim().length} characters`;
    } else if (t === 'persona') {
      body = JSON.stringify(ex.persona, null, 2) + '\n';
      info = `${ex.persona.rules.length} ranked rules`;
    } else {
      body = ex[t].text;
      const limit = t === 'system-prompt' && maxChars ? maxChars : TARGETS[t].max;
      info = `${size(body, TARGETS[t].bytes)} of ${limit.toLocaleString('en-US')} ${TARGETS[t].bytes ? 'bytes' : 'characters'}${ex[t].truncated ? ', shortened' : ''}`;
    }
    fs.writeFileSync(file, body);
    written.push({ target: t, file, info });
  }
  return { written, clone: c };
}
