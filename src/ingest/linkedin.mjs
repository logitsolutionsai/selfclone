// LinkedIn data export: messages.csv (Settings, Data privacy, Get a copy of your data).
// Columns: CONVERSATION ID, CONVERSATION TITLE, FROM, SENDER PROFILE URL, TO,
// RECIPIENT PROFILE URLS, DATE, SUBJECT, CONTENT, FOLDER. CONTENT can be HTML.
import { parseCsv } from './generic.mjs';
import { htmlParagraphs, decodeEntities } from './html.mjs';

export function looksLikeLinkedIn(text) {
  const head = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)[0].toUpperCase();
  return /CONVERSATION ID/.test(head) && /\bFROM\b/.test(head) && /\bCONTENT\b/.test(head);
}

function iso(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/^(\d{4}-\d\d-\d\d) (\d)/, '$1T$2').replace(/\s*UTC$/i, 'Z');
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || !/^\d{4}-/.test(s) ? s : s + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function contentText(v) {
  const s = String(v || '');
  if (/<[a-z][^>]*>/i.test(s)) return htmlParagraphs(s, { keepHeadings: true }).join('\n\n');
  return decodeEntities(s).trim();
}

export function parseLinkedIn(text, { thread = 'linkedin' } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name) => header.indexOf(name);
  const c = { id: col('CONVERSATION ID'), title: col('CONVERSATION TITLE'), from: col('FROM'), url: col('SENDER PROFILE URL'), date: col('DATE'), content: col('CONTENT'), folder: col('FOLDER'), draft: col('IS MESSAGE DRAFT') };
  const messages = [];
  for (const r of rows.slice(1)) {
    const folder = c.folder >= 0 ? String(r[c.folder] || '').toUpperCase() : '';
    if (folder === 'SPAM') continue;
    if (c.draft >= 0 && /^true$/i.test(String(r[c.draft] || '').trim())) continue; // never sent
    const body = contentText(r[c.content]);
    if (!body) continue;
    const from = String(r[c.from] || '').trim();
    messages.push({
      ts: iso(r[c.date]),
      author: from,
      authorNames: [from, c.url >= 0 ? String(r[c.url] || '').trim() : ''].filter(Boolean),
      text: body,
      thread: `${thread}:${r[c.id] || r[c.title] || 'conversation'}`,
    });
  }
  // The export lists the newest message first.
  messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return messages;
}
