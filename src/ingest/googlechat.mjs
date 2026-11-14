// Google Chat from Google Takeout: Google Chat/Groups/<space or DM>/messages.json
// ({messages: [{creator: {name, email, user_type}, created_date, text, topic_id}]})
// with group_info.json beside it, and Google Chat/Users/User <id>/user_info.json
// naming the account owner.

export function looksLikeGoogleChat(obj) {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj) && Array.isArray(obj.messages) &&
    obj.messages.length > 0 && obj.messages.slice(0, 5).some((m) => m && typeof m.creator === 'object' && ('created_date' in m || 'text' in m));
}

/** "Tuesday, March 14, 2023 at 10:22:01 AM UTC" or "Wednesday 5 April 2023 at 10:15:30 UTC". */
export function googleChatDate(s) {
  if (!s) return null;
  const t = String(s).replace(/[  ]/g, ' ').replace(/^[A-Za-z]+,?\s+/, '').replace(/\s+at\s+/, ' ').trim();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function parseGoogleChat(obj, { thread = 'googlechat', group = null } = {}) {
  const name = group?.name || (group?.members ? group.members.map((m) => m.name).filter(Boolean).join(', ') : null) || 'chat';
  const key = `${thread}:${name}`;
  const messages = [];
  for (const m of obj.messages || []) {
    if (!m || typeof m !== 'object') continue;
    const c = m.creator || {};
    if (/bot/i.test(String(c.user_type || ''))) continue;
    const text = String(m.text ?? '').trim();
    if (!text) continue;
    messages.push({
      ts: googleChatDate(m.created_date),
      author: c.name || c.email || '',
      authorId: c.email || '',
      authorNames: [c.name, c.email].filter(Boolean),
      text,
      thread: key,
    });
  }
  messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return messages;
}

/** The owner's name and email from Users/User <id>/user_info.json, when the export has it. */
export function googleChatSelf(obj) {
  const u = obj?.user;
  return u ? [u.name, u.email].filter(Boolean) : [];
}
