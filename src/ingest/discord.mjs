// Discord: DiscordChatExporter JSON (one channel per file, every author) and
// Discord's own data package (Messages/c<channel id>/messages.json or
// messages.csv, which holds only the account owner's messages).
import { parseCsv } from './generic.mjs';

const KEEP_TYPES = new Set(['default', 'reply', '0', '19']);

export function looksLikeDiscordExporter(obj) {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj) && !!obj.channel && typeof obj.channel === 'object' &&
    Array.isArray(obj.messages) && (obj.guild != null || obj.messages.some((m) => m && typeof m.author === 'object'));
}

export function looksLikeDiscordPackageRows(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.slice(0, 5).every((r) => r && typeof r === 'object' && 'Contents' in r && ('Timestamp' in r || 'ID' in r));
}

export function looksLikeDiscordPackageCsv(text) {
  const head = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)[0].toLowerCase().replace(/"/g, '');
  return /^id,timestamp,contents(,attachments)?\s*$/.test(head);
}

function iso(v) {
  if (v == null || v === '') return null;
  let s = String(v).trim();
  // The package writes "2023-12-22 07:14:15" (UTC) or "2020-05-10 18:32:01.123000+00:00".
  if (/^\d{4}-\d\d-\d\d \d/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d\d-\d\dT[\d:.]+$/.test(s)) s += 'Z';
  s = s.replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** DiscordChatExporter JSON export of one channel, DM or thread. */
export function parseDiscordExporter(obj, { thread = 'discord' } = {}) {
  const guild = obj.guild?.name && obj.guild.name !== 'Direct Messages' ? `${obj.guild.name}/` : '';
  const cat = obj.channel?.category && obj.channel.category !== obj.channel.name ? `${obj.channel.category}/` : '';
  const key = `${thread}:${guild}${cat}${obj.channel?.name || obj.channel?.id || 'channel'}`;
  const messages = [];
  for (const m of obj.messages || []) {
    if (!m || typeof m !== 'object') continue;
    if (m.type != null && !KEEP_TYPES.has(String(m.type).toLowerCase())) continue; // joins, pins, calls, thread notices
    const a = m.author || {};
    if (a.isBot) continue;
    const text = String(m.content ?? '').trim();
    if (!text) continue; // attachments or stickers only
    const handle = a.discriminator && a.discriminator !== '0000' && a.discriminator !== '0' ? `${a.name}#${a.discriminator}` : null;
    messages.push({
      ts: iso(m.timestamp),
      author: a.nickname || a.name || a.id || '',
      authorId: a.id ? String(a.id) : '',
      authorNames: [a.name, a.nickname, a.id && String(a.id), handle, a.globalName].filter(Boolean),
      text,
      thread: key,
      msgId: `${key}#${m.id}`,
      replyTo: m.reference?.messageId ? `${key}#${m.reference.messageId}` : undefined,
    });
  }
  messages.sort((x, y) => String(x.ts).localeCompare(String(y.ts)));
  return messages;
}

/**
 * One channel folder of Discord's data package. Every message in it was sent by the account owner, and the
 * package holds nobody else's messages, so there is no context: they shape the voice but are never sealed.
 */
export function parseDiscordPackage({ rows, csv, channel, thread = 'discord' }) {
  let list = rows;
  if (!list && csv != null) {
    const table = parseCsv(csv);
    const header = (table[0] || []).map((h) => h.trim().toLowerCase());
    list = table.slice(1).map((r) => ({ ID: r[header.indexOf('id')], Timestamp: r[header.indexOf('timestamp')], Contents: r[header.indexOf('contents')] }));
  }
  const name = channel?.name || (channel?.recipients ? 'direct message' : null) || channel?.id || 'channel';
  const key = `${thread}:${channel?.guild?.name ? `${channel.guild.name}/` : ''}${name}`;
  const messages = [];
  for (const r of list || []) {
    const text = String(r?.Contents ?? '').trim();
    if (!text) continue;
    messages.push({ ts: iso(r.Timestamp), author: 'me', self: true, text, thread: key, msgId: `${key}#${r.ID}`, standalone: true });
  }
  messages.sort((x, y) => String(x.ts).localeCompare(String(y.ts)));
  return messages;
}

/** The folders of a data package inside a list of entries: Messages/c123/messages.json or .csv. */
export const DISCORD_PACKAGE_FILE = /(^|\/)messages\/c?\d+\/messages\.(?:json|csv)$/i;
