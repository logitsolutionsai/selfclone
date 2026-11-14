// Telegram Desktop export (JSON, "Machine-readable JSON" option) parser.
// Accepts a single chat export ({name, messages}) or a full account export
// ({personal_information, chats: {list: [...]}}).

export function looksLikeTelegram(obj) {
  return !!obj && typeof obj === 'object' && (Array.isArray(obj.messages) || Array.isArray(obj?.chats?.list));
}

export function telegramText(t) {
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
  return '';
}

function tsOf(m) {
  if (m.date_unixtime) return new Date(Number(m.date_unixtime) * 1000).toISOString().replace('.000Z', 'Z');
  if (m.date) {
    const d = new Date(m.date + (/[zZ]|[+-]\d\d:?\d\d$/.test(m.date) ? '' : 'Z'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().replace('.000Z', 'Z');
  }
  return null;
}

/** Returns { messages, selfIds } where selfIds lists the exporting account's ids/names when known. */
export function parseTelegram(obj, { thread = 'telegram' } = {}) {
  const chats = Array.isArray(obj.messages) ? [obj] : [...(obj.chats?.list || []), ...(obj.left_chats?.list || [])];
  const selfIds = [];
  const pi = obj.personal_information;
  if (pi) {
    if (pi.user_id) selfIds.push(`user${pi.user_id}`, String(pi.user_id));
    const full = [pi.first_name, pi.last_name].filter(Boolean).join(' ').trim();
    if (full) selfIds.push(full);
    if (pi.username) selfIds.push(pi.username.replace(/^@/, ''));
  }
  const messages = [];
  for (const chat of chats) {
    const chatName = `${thread}:${chat.name || chat.id || 'chat'}`;
    for (const m of chat.messages || []) {
      if (m.type && m.type !== 'message') continue;
      const text = telegramText(m.text).trim();
      if (!text) continue;
      messages.push({
        ts: tsOf(m),
        author: m.from || m.actor || '',
        authorId: m.from_id || '',
        text,
        thread: chatName,
        msgId: `${chatName}#${m.id}`,
        replyTo: m.reply_to_message_id != null ? `${chatName}#${m.reply_to_message_id}` : undefined,
        // Forwarded messages and inline-bot results were written by someone else.
        forwarded: !!(m.forwarded_from || m.forwarded_from_id || m.saved_from || m.via_bot) || undefined,
      });
    }
  }
  return { messages, selfIds };
}
