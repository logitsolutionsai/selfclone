// Instagram and Facebook Messenger: Meta's "Download your information" export
// in JSON format. One folder per conversation under messages/inbox/ (older
// exports), your_instagram_activity/messages/inbox/ or
// your_facebook_activity/messages/inbox/ (newer ones), holding message_1.json,
// message_2.json, ... with the newest message first.
//
// Meta writes every non-ASCII character as its UTF-8 bytes, each escaped as a
// separate \u00XX code unit ("cafÃ©" for "café"), so text is decoded back.

export function looksLikeMeta(obj) {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj) && Array.isArray(obj.participants) && Array.isArray(obj.messages) &&
    (obj.messages.length === 0 || obj.messages.some((m) => m && (('sender_name' in m && 'timestamp_ms' in m) || ('senderName' in m && 'timestamp' in m))));
}

/** Undo Meta's mojibake: a string of code units <= 0xFF that is valid UTF-8 when read as bytes. */
export function fixMojibake(s) {
  if (typeof s !== 'string' || !/[\u0080-\u00FF]/.test(s) || /[^\u0000-\u00FF]/.test(s)) return s;
  const bytes = Buffer.from(s, 'latin1');
  const out = bytes.toString('utf8');
  // Invalid UTF-8 decodes to U+FFFD: then the text really was Latin-1, keep it.
  return out.includes('\uFFFD') ? s : out;
}

// Lines Meta writes itself, in English: attachments, reactions, calls, unsent messages, group notices.
const SYSTEM = [
  /^.{0,80} sent an attachment\.$/i,
  /^You sent an attachment\.$/i,
  /^.{0,80} (?:sent|shared) (?:a|an) (?:photo|video|link|story|post|reel|voice message|location|sticker|GIF)\.?$/i,
  /^(?:Reacted|.{0,80} reacted) .{1,12} to (?:your|a|their) message$/i,
  /^Liked a message$/i,
  /^.{0,80} unsent a message\.?$/i,
  /^(?:You|.{0,80}) (?:missed|started|joined) (?:a |the )?(?:video |audio )?(?:call|chat)\.?$/i,
  /^The (?:video|audio) (?:call|chat) ended\.?$/i,
  /^.{0,80} (?:named the group|changed the group photo|added .{1,80} to the group|left the group|removed .{1,80} from the group)\b.*$/i,
  /^.{0,80} set the nickname for .*$/i,
  /^.{0,80} changed the (?:chat )?theme\b.*$/i,
  /^.{0,80} (?:wave|waved) at you!?$/i,
];

export function metaPlatform(pathName, obj) {
  const p = String(pathName || '').toLowerCase();
  if (/instagram/.test(p)) return 'instagram';
  if (/facebook|messenger/.test(p)) return 'messenger';
  // Without a telling folder name: Messenger threads carry Facebook-only keys.
  const fbKeys = obj?.magic_words || obj?.joinable_mode || obj?.messages?.some((m) => m && ('is_geoblocked_for_viewer' in m || m.type === 'Generic'));
  return fbKeys ? 'messenger' : 'instagram';
}

export function parseMeta(obj, { thread = 'meta', path: file = '' } = {}) {
  const title = fixMojibake(obj.title || obj.threadName || '') || '';
  const folder = obj.thread_path || String(file).split('/').slice(-2, -1)[0] || title || 'chat';
  const key = `${thread}:${folder}`;
  const messages = [];
  for (const m of obj.messages || []) {
    if (!m || typeof m !== 'object') continue;
    // The end-to-end encrypted chats download writes camelCase fields (senderName, timestamp, text, isUnsent).
    if (m.is_unsent || m.isUnsent || m.call_duration != null) continue;
    if (m.type && !/^(?:generic|text)$/i.test(m.type)) continue; // Share, Call, Subscribe, Unsubscribe
    const text = fixMojibake(String(m.content ?? m.text ?? '')).trim();
    if (!text) continue;
    if (SYSTEM.some((re) => re.test(text))) continue;
    if (m.share && /^https?:\/\/\S+$/.test(text)) continue; // a shared link with no words of their own
    const author = fixMojibake(String(m.sender_name ?? m.senderName ?? ''));
    const ms = Number(m.timestamp_ms ?? m.timestamp);
    messages.push({
      ts: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
      author,
      text,
      thread: key,
    });
  }
  // Meta lists the newest message first; context needs time order.
  messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return messages;
}
