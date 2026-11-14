// Plain text / Markdown notes (authored by the user) and generic JSONL / CSV with author + text.

export function parsePlain(text, { thread = 'notes', markdown = false, ts = null, me = 'me' } = {}) {
  let t = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (markdown) {
    t = t
      .replace(/^---\n[\s\S]*?\n---\n/, '') // front matter
      .replace(/```[\s\S]*?```/g, '') // fenced code
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // links -> link text
      .replace(/^#{1,6}[ \t]+/gm, '') // heading markers
      .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '') // list markers
      .replace(/^>[ \t]?/gm, '') // blockquote markers
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/<!--[\s\S]*?-->/g, '');
  }
  const paras = t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && /[\p{L}\p{N}]/u.test(p));
  const out = [];
  for (const p of paras) {
    // Very long paragraphs are split on sentence boundaries into chunks of about 1200 chars.
    if (p.length <= 2000) {
      out.push(p);
      continue;
    }
    let buf = '';
    for (const s of p.split(/(?<=[.!?])\s+/)) {
      if ((buf + ' ' + s).length > 1200 && buf) {
        out.push(buf.trim());
        buf = '';
      }
      buf += ' ' + s;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.map((p) => ({ ts, author: me, self: true, text: p, thread, standalone: true }));
}

/** RFC 4180 CSV parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const s = String(text).replace(/^\uFEFF/, '');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (c === '\r' && s[i + 1] === '\n') i++;
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x !== ''));
}

const FIELD = {
  author: ['author', 'from', 'sender', 'user', 'username', 'user_name', 'name', 'speaker'],
  text: ['text', 'message', 'body', 'content', 'msg'],
  ts: ['ts', 'timestamp', 'date', 'time', 'datetime', 'created_at', 'sent_at'],
  thread: ['thread', 'conversation', 'chat', 'channel', 'thread_id', 'conversation_id', 'chat_id'],
  context: ['context', 'prompt', 'in_reply_to_text', 'reply_to_text'],
};

function pick(obj, keys) {
  const lower = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) if (lower[k] != null && lower[k] !== '') return lower[k];
  return undefined;
}

function toIso(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  const d = Number.isFinite(n) && String(v).trim() !== '' ? new Date(n > 1e12 ? n : n * 1000) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace('.000Z', 'Z');
}

export function rowsToMessages(rows, { thread = 'generic' } = {}) {
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const text = pick(r, FIELD.text);
    if (text == null || !String(text).trim()) continue;
    const ctx = pick(r, FIELD.context);
    out.push({
      ts: toIso(pick(r, FIELD.ts)),
      author: String(pick(r, FIELD.author) ?? ''),
      text: String(text).trim(),
      thread: `${thread}:${pick(r, FIELD.thread) ?? 'main'}`,
      contextOverride: ctx ? String(ctx) : undefined,
    });
  }
  return out;
}

export function parseJsonl(text, opts) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return rowsToMessages(rows, opts);
}

export function parseCsvMessages(text, opts = {}) {
  const delim = opts.delimiter || (/\t/.test(String(text).split('\n')[0]) ? '\t' : ',');
  const rows = parseCsv(text, delim);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rowsToMessages(
    rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))),
    opts
  );
}
