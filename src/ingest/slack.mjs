// Slack workspace export parser. Input: a list of entries [{path, read()}]
// containing users.json and one folder per channel with YYYY-MM-DD.json files.
import { slackEmoji } from './slack-emoji.mjs';

const DAY_FILE = /(?:^|\/)([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/;
const SKIP_SUBTYPES = new Set([
  'channel_join', 'channel_leave', 'channel_topic', 'channel_purpose', 'channel_name', 'channel_archive',
  'channel_unarchive', 'group_join', 'group_leave', 'group_topic', 'group_purpose', 'bot_message',
  'pinned_item', 'unpinned_item', 'tombstone', 'reminder_add', 'bot_add', 'bot_remove', 'app_conversation_leave',
  'huddle_thread', 'sh_room_created', 'channel_convert_to_private', 'channel_posting_permissions', 'group_name',
  'group_archive', 'group_unarchive', 'channel_canvas_updated',
]);

export function looksLikeSlack(entries) {
  return entries.some((e) => /(^|\/)users\.json$/.test(e.path)) && entries.some((e) => DAY_FILE.test(e.path));
}

function unescape(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function slackText(text, users) {
  return unescape(
    String(text || '')
      .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/g, (_, id, label) => '@' + (label || users.get(id)?.display || id))
      .replace(/<#[A-Z0-9]+\|([^>]*)>/g, (_, name) => '#' + name)
      .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, (_, w) => '@' + w)
      .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_, l) => l || '@team')
      .replace(/<(https?:\/\/[^|>]+)(?:\|[^>]+)?>/g, (_, url) => url)
      .replace(/<mailto:([^|>]+)(?:\|[^>]+)?>/g, (_, m) => m)
      .replace(/:[a-z0-9_+-]+:(?::skin-tone-[2-6]:)?/g, slackEmoji)
  );
}

export function parseSlack(entries, { thread = 'slack' } = {}) {
  const users = new Map();
  const usersEntry = entries.find((e) => /(^|\/)users\.json$/.test(e.path));
  if (usersEntry) {
    for (const u of JSON.parse(usersEntry.read().toString('utf8'))) {
      const display = u.profile?.display_name || u.real_name || u.profile?.real_name || u.name || u.id;
      users.set(u.id, {
        display,
        bot: !!u.is_bot || u.id === 'USLACKBOT',
        names: [u.id, u.name, u.real_name, u.profile?.display_name, u.profile?.real_name].filter(Boolean),
      });
    }
  }
  const byChannel = new Map();
  for (const e of entries) {
    const m = e.path.match(DAY_FILE);
    if (!m) continue;
    const channel = m[1];
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    let arr;
    try {
      arr = JSON.parse(e.read().toString('utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const msg of arr) byChannel.get(channel).push(msg);
  }
  const messages = [];
  for (const [channel, list] of [...byChannel].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => Number(a.ts) - Number(b.ts));
    const main = `${thread}:#${channel}`;
    const parents = new Map();
    const threadsStarted = new Set();
    for (const msg of list) {
      if (msg.type && msg.type !== 'message') continue;
      if (msg.subtype && SKIP_SUBTYPES.has(msg.subtype)) continue;
      if (users.get(msg.user)?.bot || (msg.bot_id && !msg.user)) continue; // apps and bots
      const text = slackText(msg.text, users).trim();
      if (!text) continue;
      const uid = msg.user || '';
      const author = users.get(uid)?.display || msg.user_profile?.display_name || msg.user_profile?.real_name || uid;
      const ts = msg.ts ? new Date(Number(msg.ts) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
      const isReply = msg.thread_ts && msg.thread_ts !== msg.ts;
      const base = { ts, author, authorId: uid, authorNames: users.get(uid)?.names || [author, uid], text };
      if (!isReply) {
        messages.push({ ...base, thread: main, msgId: `${main}/${msg.ts}` });
        parents.set(msg.ts, base);
      } else {
        const tkey = `${main}/thread/${msg.thread_ts}`;
        // Make sure the thread starts with its parent, used only as context.
        if (!threadsStarted.has(tkey)) {
          threadsStarted.add(tkey);
          const p = parents.get(msg.thread_ts);
          if (p) messages.push({ ...p, thread: tkey, contextOnly: true, msgId: `${tkey}/parent` });
        }
        messages.push({ ...base, thread: tkey, msgId: `${main}/${msg.ts}` });
      }
    }
  }
  return { messages, users };
}
