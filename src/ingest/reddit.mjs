// Reddit data request (reddit.com/settings/data-request): comments.csv and posts.csv.
// Everything in them was written by the account owner. A comment gets context
// only when its parent (one of their own posts or comments) is in the export,
// because the export does not contain other people's comments.
import { parseCsv } from './generic.mjs';
import { decodeEntities } from './html.mjs';

export function redditKind(text) {
  const head = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)[0].toLowerCase().replace(/"/g, '').split(',').map((h) => h.trim());
  if (!head.includes('permalink') || !head.includes('subreddit')) return null;
  if (head.includes('body') && (head.includes('parent') || head.includes('link'))) return 'comments';
  if (head.includes('title')) return 'posts';
  return null;
}

function table(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function iso(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/^(\d{4}-\d\d-\d\d) (\d)/, '$1T$2').replace(/\s*UTC$/i, 'Z');
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const bare = (id) => String(id || '').trim().replace(/^t[1-6]_/, '');
const gone = (s) => !s || /^\[(?:deleted|removed)\]$/i.test(s.trim());

/** Markdown as Reddit stores it: links keep their text, quotes and escapes are dropped. */
function redditText(s) {
  return decodeEntities(String(s || ''))
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
    .replace(/^&gt;.*$|^>.*$/gm, '') // quoted text is someone else's words
    .replace(/\\([*_~`>#\\[\]()])/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** files: [{text, kind: 'comments'|'posts'}] from one export. */
export function parseReddit(files, { thread = 'reddit' } = {}) {
  const posts = [];
  const comments = [];
  for (const f of files) (f.kind === 'posts' ? posts : comments).push(...table(f.text));
  const textById = new Map();
  const out = [];
  for (const p of posts) {
    const title = gone(p.title) ? '' : redditText(p.title);
    const body = gone(p.body) ? '' : redditText(p.body);
    const text = [title, body].filter(Boolean).join('\n\n');
    if (!text) continue;
    textById.set(bare(p.id), text);
    out.push({ ts: iso(p.date), author: 'me', self: true, text, thread: `${thread}:r/${p.subreddit || 'unknown'}`, standalone: true, rid: bare(p.id) });
  }
  for (const c of comments) {
    if (gone(c.body)) continue;
    const text = redditText(c.body);
    if (!text) continue;
    textById.set(bare(c.id), text);
    out.push({ ts: iso(c.date), author: 'me', self: true, text, thread: `${thread}:r/${c.subreddit || 'unknown'}`, standalone: true, rid: bare(c.id), parent: bare(c.parent) });
  }
  for (const m of out) {
    if (m.parent && textById.has(m.parent) && m.parent !== m.rid) m.contextOverride = textById.get(m.parent);
    delete m.parent;
    delete m.rid;
  }
  out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return out;
}
