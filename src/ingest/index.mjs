// Ingest orchestration: detect the export format of each input path, parse it,
// keep only the user's own messages (with the message they replied to as
// context), scrub secrets, and assign stable ids and turns.
import fs from 'node:fs';
import path from 'node:path';
import { sha1 } from '../util.mjs';
import { scrub, mergeCounts } from '../scrub.mjs';
import { readZip } from './zip.mjs';
import { looksLikeWhatsApp, parseWhatsApp } from './whatsapp.mjs';
import { looksLikeTelegram, parseTelegram } from './telegram.mjs';
import { looksLikeSlack, parseSlack } from './slack.mjs';
import { looksLikeTwitter, parseTwitter } from './twitter.mjs';
import { looksLikeMbox, looksLikeEml, parseMbox } from './mbox.mjs';
import { parsePlain, parseJsonl, parseCsvMessages, rowsToMessages } from './generic.mjs';
import { MORE_FORMATS, MORE_PREFIX, detectMore, detectMoreText, resolveForced, parseMoreFile, multiFileUnits } from './more.mjs';

export const FORMATS = ['whatsapp', 'telegram', 'slack', 'x', 'mbox', 'text', 'jsonl', 'csv', ...MORE_FORMATS];
const SOURCE_PREFIX = { whatsapp: 'wa', telegram: 'tg', slack: 'sl', x: 'x', mbox: 'em', text: 'tx', jsonl: 'gj', csv: 'gc', ...MORE_PREFIX };
const MEDIA_EXT = /\.(?:jpe?g|png|gif|webp|heic|mp4|mov|opus|ogg|m4a|mp3|wav|pdf|vcf|webm|zip)$/i;

const TURN_GAP_MS = 5 * 60 * 1000; // consecutive own messages within 5 minutes form one turn
const CONTEXT_GAP_MS = 24 * 3600 * 1000; // a reply more than a day later has no context
const CONTEXT_MAX_MESSAGES = 3;
const CONTEXT_MAX_CHARS = 800;

export function makeMatcher(me) {
  // Each value is matched whole and split on commas, so "Vidal, Rosa" (a contact saved
  // last name first) works as well as "Rosa Vidal,rosa,U01ROSA".
  const list = (Array.isArray(me) ? me : [me])
    .flatMap((x) => [String(x || ''), ...String(x || '').split(',')])
    .map((x) => x.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return (msg) => {
    if (msg.self) return true;
    const names = [msg.author, msg.authorId, ...(msg.authorNames || [])].filter(Boolean).map((x) => String(x).toLowerCase().replace(/^@/, ''));
    for (const want of list) {
      for (const n of names) {
        if (n === want) return true;
        // email "From:" headers: "Jane Doe <jane@x.com>" matches "jane@x.com" or "jane doe"
        if (n.includes('<') && (n.includes(`<${want}>`) || n.startsWith(want + ' <') || n.startsWith(`"${want}" <`))) return true;
      }
    }
    return false;
  };
}

function fileEntry(p) {
  return { path: p.replace(/\\/g, '/'), read: () => fs.readFileSync(p), mtime: fs.statSync(p).mtime.toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

function walk(dir, base = dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, base, out);
    else if (d.isFile()) out.push({ ...fileEntry(p), path: path.relative(base, p).replace(/\\/g, '/') });
    if (out.length > 50000) throw new Error(`Too many files under ${base}`);
  }
  return out;
}

/** Turn an input path into a list of parsed units {format, messages, label}. */
export function parseInput(p, { format, me } = {}) {
  const stat = fs.statSync(p);
  const label = path.basename(p);
  if (stat.isDirectory()) return parseEntries(walk(p), label, { format, me });
  if (/\.zip$/i.test(p)) return parseEntries(readZip(fs.readFileSync(p)).map((e) => ({ ...e, mtime: stat.mtime.toISOString() })), label, { format, me });
  return parseFile(fileEntry(p), { format, me, label });
}

function parseEntries(entries, label, { format, me }, depth = 0) {
  if (format === 'slack') return [{ format: 'slack', label, ...parseSlackUnit(entries, label) }];
  const units = [];
  // A folder can hold several exports side by side: Slack workspaces (a folder
  // with users.json and channel/date.json files), an X archive, and loose files.
  const claimed = new Set();
  if (!format) {
    const roots = entries
      .filter((e) => /(^|\/)users\.json$/.test(e.path))
      .map((e) => e.path.slice(0, e.path.length - 'users.json'.length))
      .filter((root) => entries.some((x) => x.path.startsWith(root) && /^[^/]+\/\d{4}-\d{2}-\d{2}\.json$/.test(x.path.slice(root.length))));
    for (const root of roots) {
      const sub = entries.filter((e) => e.path.startsWith(root)).map((e) => ({ ...e, path: e.path.slice(root.length) }));
      if (!looksLikeSlack(sub)) continue;
      for (const e of entries) if (e.path.startsWith(root)) claimed.add(e.path);
      const name = root ? `${label}/${root.replace(/\/$/, '')}` : label;
      units.push({ format: 'slack', label: name, ...parseSlackUnit(sub, name) });
    }
  }
  units.push(...multiFileUnits(entries, label, claimed, format));
  const tw = entries.filter((e) => !claimed.has(e.path) && /(^|\/)tweets?(-part\d+)?\.js$/.test(e.path));
  if (format === 'x' || !format) {
    for (const e of tw) {
      units.push(...parseFile(e, { format: 'x', me, label }));
      claimed.add(e.path);
    }
    // An X archive folder holds many other .js data files that are not messages.
    // Its viewer pages are not blog posts either.
    if (tw.length) for (const e of entries) if (/^(?:.*\/)?data\/[^/]+\.js$/.test(e.path) || /\.html?$/i.test(e.path)) claimed.add(e.path);
  }
  for (const e of entries) {
    if (claimed.has(e.path)) continue;
    if (/(?:^|\/)(?:__MACOSX\/|\._|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i.test(e.path)) continue; // OS junk added when a folder is zipped
    if (/\.zip$/i.test(e.path) && depth < 2) {
      // A folder of downloads usually holds the exports as .zip files: open them too.
      let inner;
      try {
        inner = readZip(e.read()).map((x) => ({ ...x, mtime: e.mtime }));
      } catch (err) {
        if (format) throw err;
        continue;
      }
      units.push(...parseEntries(inner, `${label}/${e.path}`, { format, me }, depth + 1));
      continue;
    }
    if (MEDIA_EXT.test(e.path)) continue;
    if (/(^|\/)(?:users|channels|groups|dms|mpims|integration_logs|canvases)\.json$/.test(e.path)) continue;
    try {
      units.push(...parseFile(e, { format, me, label: `${label}/${e.path}`, inFolder: true }));
    } catch (err) {
      if (format) throw new Error(`Could not read "${label}/${e.path}" as ${format}: ${err.message}. --format applies to every file in a folder or .zip; pass the export file itself instead.`);
    }
  }
  return units;
}

function parseSlackUnit(entries, label) {
  const { messages } = parseSlack(entries, { thread: `slack:${label}` });
  return { messages };
}

export function detectFormat(name, text) {
  const lower = name.toLowerCase();
  const more = detectMore(lower, text);
  if (more) return more === 'none' ? null : more;
  if (/\.js$/.test(lower) && looksLikeTwitter(text)) return 'x';
  if (/\.(?:mbox|mbx|eml)$/.test(lower)) return 'mbox';
  if (/\.(?:jsonl|ndjson)$/.test(lower)) return 'jsonl';
  if (/\.(?:csv|tsv)$/.test(lower)) return 'csv';
  if (/\.(?:md|markdown)$/.test(lower)) return 'text';
  if (/\.json$/.test(lower)) {
    try {
      const obj = JSON.parse(text);
      if (looksLikeTelegram(obj)) return 'telegram';
      if (Array.isArray(obj)) return 'json-rows';
    } catch {
      return null;
    }
    return null;
  }
  if (looksLikeWhatsApp(text)) return 'whatsapp';
  const txt = detectMoreText(text);
  if (txt) return txt;
  if (looksLikeMbox(text) || looksLikeEml(text)) return 'mbox';
  if (/\.txt$/.test(lower) || !/\.[a-z0-9]{1,5}$/.test(lower)) return 'text';
  return null;
}

function parseFile(entry, { format, me, label, inFolder = false }) {
  const buf = entry.read();
  const name = entry.path;
  const utf8 = buf.toString('utf8');
  const fmt = format ? resolveForced(format, name.toLowerCase(), utf8) : detectFormat(name, utf8);
  const base = path.basename(name);
  const meName = Array.isArray(me) ? me[0] : String(me || 'me').split(',')[0];
  const more = parseMoreFile(fmt, { entry, buf, utf8, name, base, label, format, meName, inFolder });
  if (more) return more;
  switch (fmt) {
    case 'whatsapp':
      // iOS names every export "_chat.txt" inside its .zip; use the zip name so two chats stay apart.
      return [{ format: 'whatsapp', label, messages: parseWhatsApp(utf8, { thread: `whatsapp:${base === '_chat.txt' ? label : base}` }) }];
    case 'telegram': {
      const { messages, selfIds } = parseTelegram(JSON.parse(utf8.replace(/^\uFEFF/, '')), { thread: 'telegram' });
      return [{ format: 'telegram', label, messages, selfIds }];
    }
    case 'x':
      return [{ format: 'x', label, messages: parseTwitter(utf8, { thread: 'x', me: meName }) }];
    case 'mbox':
      return [{ format: 'mbox', label, messages: parseMbox(buf.toString('latin1'), { thread: 'email' }) }];
    case 'text':
      return [{ format: 'text', label, messages: parsePlain(utf8, { thread: `text:${base}`, markdown: /\.(md|markdown)$/i.test(base), ts: entry.mtime || null, me: meName }) }];
    case 'jsonl':
      return [{ format: 'jsonl', label, messages: parseJsonl(utf8, { thread: `jsonl:${base}` }) }];
    case 'json-rows':
      return [{ format: 'jsonl', label, messages: rowsToMessages(JSON.parse(utf8), { thread: `json:${base}` }) }];
    case 'csv':
      return [{ format: 'csv', label, messages: parseCsvMessages(utf8, { thread: `csv:${base}` }) }];
    default:
      return [];
  }
}

function firstName(author) {
  const a = String(author || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  return a.split(/\s+/)[0] || 'Them';
}

function clip(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/**
 * Build corpus records from parsed messages: only the user's own messages,
 * each with `context` (what someone else said just before) on the first
 * message of a turn.
 */
export function buildRecords(units, { me, scrubText = true } = {}) {
  const isMe = makeMatcher(me);
  const records = [];
  const scrubCounts = {};
  const stats = {};
  const seen = new Set();
  const usedIds = new Set();
  const sc = (t) => {
    if (!scrubText) return t;
    const r = scrub(t);
    mergeCounts(scrubCounts, r.counts);
    return r.text;
  };

  for (const unit of units) {
    const fmt = unit.format;
    const st = (stats[fmt] ||= { parsed: 0, mine: 0, others: 0, withContext: 0 });
    const matchSelf = unit.selfIds?.length ? makeMatcher([...(Array.isArray(me) ? me : [me]), ...unit.selfIds]) : isMe;
    const globalIndex = new Map();
    for (const m of unit.messages) if (m.msgId) globalIndex.set(m.msgId, m);

    const byThread = new Map();
    for (const m of unit.messages) {
      if (!byThread.has(m.thread)) byThread.set(m.thread, []);
      byThread.get(m.thread).push(m);
    }
    for (const [thread, msgs] of byThread) {
      let turn = null;
      let lastMineTs = null;
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (!m.contextOnly) st.parsed++;
        if (m.forwarded && !m.contextOnly && matchSelf(m)) {
          // Something the user forwarded: not their writing, and it ends their turn.
          st.forwarded = (st.forwarded || 0) + 1;
          turn = null;
          continue;
        }
        const mine = !m.contextOnly && matchSelf(m);
        if (!mine) {
          if (!m.contextOnly) st.others++;
          turn = null;
          continue;
        }
        if (!m.text || !m.text.trim()) continue;
        st.mine++;
        const tsMs = m.ts ? Date.parse(m.ts) : NaN;
        const prev = msgs[i - 1];
        const continues =
          !m.standalone && turn && prev && !prev.contextOnly && matchSelf(prev) &&
          (Number.isNaN(tsMs) || lastMineTs == null || tsMs - lastMineTs <= TURN_GAP_MS);
        let context = null;
        if (!continues) {
          turn = null;
          // 1. explicit reply target
          const target = m.replyTo ? globalIndex.get(m.replyTo) : null;
          if (target && !matchSelf(target) && target.text) {
            context = target.text.trim();
          } else if (m.contextOverride) {
            context = String(m.contextOverride).trim() || null;
          } else if (!m.standalone) {
            // 2. preceding run of other people's messages
            const ctx = [];
            for (let j = i - 1; j >= 0 && ctx.length < CONTEXT_MAX_MESSAGES; j--) {
              const p = msgs[j];
              if (!p.contextOnly && !p.forwarded && matchSelf(p)) break;
              const pMs = p.ts ? Date.parse(p.ts) : NaN;
              const ref = ctx.length ? (ctx[0].ts ? Date.parse(ctx[0].ts) : NaN) : tsMs;
              if (!Number.isNaN(pMs) && !Number.isNaN(ref) && ref - pMs > CONTEXT_GAP_MS) break;
              ctx.unshift(p);
            }
            if (ctx.length) {
              const multi = new Set(ctx.map((c) => c.author)).size > 1;
              context = ctx.map((c) => (multi ? `${firstName(c.author)}: ${c.text}` : c.text)).join('\n');
            }
          }
        }
        const text = sc(m.text.trim());
        const ctxText = context ? clip(sc(context), CONTEXT_MAX_CHARS) : null;
        const key = `${thread}|${m.ts}|${text}`;
        if (seen.has(key)) continue; // same message ingested twice
        seen.add(key);
        const prefix = SOURCE_PREFIX[fmt] || 'm';
        let id = `${prefix}-${sha1(key).slice(0, 10)}`;
        let n = 1;
        while (usedIds.has(id)) id = `${prefix}-${sha1(key + n++).slice(0, 10)}`;
        usedIds.add(id);
        if (!turn) turn = `t-${sha1(key).slice(0, 10)}`;
        if (ctxText) st.withContext++;
        records.push({ id, ts: m.ts || null, source: fmt, author: m.author, text, context: ctxText, turn, thread });
        lastMineTs = Number.isNaN(tsMs) ? lastMineTs : tsMs;
      }
    }
  }
  return { records, stats, scrubCounts };
}

/** Collect distinct author names (with counts) to help when --me matched nothing. */
export function authorCounts(units) {
  const c = new Map();
  for (const u of units) for (const m of u.messages) if (!m.contextOnly && m.author) c.set(m.author, (c.get(m.author) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]);
}

export function ingest(paths, { me, format, scrubText = true } = {}) {
  const units = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) throw new Error(`Input not found: ${p}`);
    units.push(...parseInput(p, { format, me }));
  }
  const out = buildRecords(units, { me, scrubText });
  out.authors = authorCounts(units);
  return out;
}
