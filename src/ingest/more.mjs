// Detection and parsing for the formats added after the first release: Discord, Instagram, Messenger,
// LinkedIn, iMessage, Reddit, Google Chat, Word and blog posts. index.mjs calls in here.
import path from 'node:path';
import { looksLikeDiscordExporter, looksLikeDiscordPackageRows, looksLikeDiscordPackageCsv, parseDiscordExporter, parseDiscordPackage, DISCORD_PACKAGE_FILE } from './discord.mjs';
import { looksLikeMeta, parseMeta, metaPlatform } from './meta.mjs';
import { looksLikeLinkedIn, parseLinkedIn } from './linkedin.mjs';
import { looksLikeIMessage, parseIMessage } from './imessage.mjs';
import { redditKind, parseReddit } from './reddit.mjs';
import { looksLikeGoogleChat, parseGoogleChat, googleChatSelf } from './googlechat.mjs';
import { parseDocx } from './docx.mjs';
import { looksLikeFeed, looksLikeArticle, parseHtmlPage, parseFeed } from './blog.mjs';

export const MORE_FORMATS = ['discord', 'instagram', 'messenger', 'linkedin', 'imessage', 'reddit', 'googlechat', 'docx', 'blog'];
export const MORE_PREFIX = { discord: 'dc', instagram: 'ig', messenger: 'fb', linkedin: 'li', imessage: 'im', reddit: 'rd', googlechat: 'gch', docx: 'dx', blog: 'bl' };

const BOM = /^\uFEFF/;
export function safeJson(text) {
  try {
    return JSON.parse(String(text).replace(BOM, ''));
  } catch {
    return null;
  }
}
const jsonOf = (entry) => safeJson(entry.read().toString('utf8'));
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);

// Pages that apps write next to their data (the X archive viewer, the Takeout index, Meta's HTML export) are not posts.
const APP_HTML = /(?:^|\/)(?:Your archive\.html|archive_browser\.html|messages\/|your_instagram_activity\/|your_facebook_activity\/|Google Chat\/|Takeout\/)/i;

/** Detection by name and content; null when none of the added formats matches. */
export function detectMore(lower, text) {
  if (/\.docx$/.test(lower)) return 'docx';
  if (/\.(?:html?|xhtml)$/.test(lower)) return 'blog-html';
  if (/\.(?:xml|rss|atom)$/.test(lower)) return looksLikeFeed(text) ? 'blog-feed' : 'none';
  if (/\.(?:csv|tsv)$/.test(lower)) {
    if (looksLikeDiscordPackageCsv(text)) return 'discord-package';
    // LinkedIn's learning coach and AI guide chats use the same columns; writing to a bot is not the user's usual voice.
    if (looksLikeLinkedIn(text)) return /(?:coach|guide)[^/]*\.csv$/.test(lower) ? 'none' : 'linkedin';
    if (redditKind(text)) return 'reddit';
    return null;
  }
  if (/\.json$/.test(lower)) {
    // Discord, Meta and Google Chat files also hold a "messages" array, so they are checked before Telegram.
    const obj = safeJson(text);
    if (looksLikeDiscordExporter(obj)) return 'discord';
    if (looksLikeMeta(obj)) return 'meta';
    if (looksLikeGoogleChat(obj)) return 'googlechat';
    if (looksLikeDiscordPackageRows(obj)) return 'discord-package';
    return null;
  }
  return null;
}

/** For text files with no telling extension, after WhatsApp has been ruled out. */
export function detectMoreText(text) {
  return looksLikeIMessage(text) ? 'imessage' : null;
}

/** A forced --format that covers several file shapes still needs the shape. */
export function resolveForced(format, lower, text) {
  const shape = detectMore(lower, text);
  if (format === 'discord') return shape === 'discord-package' ? 'discord-package' : 'discord';
  if (format === 'blog') return shape === 'blog-feed' ? 'blog-feed' : 'blog-html';
  if (format === 'instagram' || format === 'messenger') return 'meta';
  return format;
}

/** Parse one file of an added format into units, or return null when fmt is not one of them. */
export function parseMoreFile(fmt, { entry, buf, utf8, name, base, label, format, meName, inFolder }) {
  switch (fmt) {
    case 'discord': {
      const obj = safeJson(utf8);
      return looksLikeDiscordExporter(obj) ? [{ format: 'discord', label, messages: parseDiscordExporter(obj, { thread: 'discord' }) }] : [];
    }
    case 'discord-package': {
      const rows = /\.json$/i.test(name) ? safeJson(utf8) : null;
      const channel = { name: path.basename(path.dirname(name)) };
      return [{ format: 'discord', label, messages: parseDiscordPackage({ rows, csv: rows ? null : utf8, channel, thread: 'discord' }) }];
    }
    case 'meta': {
      const obj = safeJson(utf8);
      if (!looksLikeMeta(obj)) return [];
      const platform = format === 'instagram' || format === 'messenger' ? format : metaPlatform(`${label}/${name}`, obj);
      return [{ format: platform, label, messages: parseMeta(obj, { thread: platform, path: name }) }];
    }
    case 'googlechat': {
      const obj = safeJson(utf8);
      if (!looksLikeGoogleChat(obj)) return [];
      return [{ format: 'googlechat', label, messages: parseGoogleChat(obj, { thread: 'googlechat', group: { name: path.basename(path.dirname(name)) } }) }];
    }
    case 'linkedin':
      return [{ format: 'linkedin', label, messages: parseLinkedIn(utf8, { thread: 'linkedin' }) }];
    case 'imessage':
      return [{ format: 'imessage', label, messages: parseIMessage(utf8, { thread: `imessage:${base}` }) }];
    case 'reddit': {
      const kind = redditKind(utf8);
      return kind ? [{ format: 'reddit', label, messages: parseReddit([{ text: utf8, kind }], { thread: 'reddit' }) }] : [];
    }
    case 'docx':
      return [{ format: 'docx', label, messages: parseDocx(buf, { thread: `docx:${base}`, ts: entry.mtime || null, me: meName }) }];
    case 'blog-html':
      // Inside a folder only a page marked up as an article counts, so the pages apps export are never read as posts.
      if (inFolder && (APP_HTML.test(name) || !looksLikeArticle(utf8))) return [];
      return [{ format: 'blog', label, messages: parseHtmlPage(utf8, { thread: `blog:${base}`, ts: entry.mtime || null, me: meName }) }];
    case 'blog-feed':
      return [{ format: 'blog', label, messages: parseFeed(utf8, { thread: `blog:${base}`, me: meName }) }];
    case 'none':
      return [];
    default:
      return null;
  }
}

/** Exports spread over several files, read together. Claims the files they use. */
export function multiFileUnits(entries, label, claimed, format) {
  const units = [];
  if (!format || format === 'discord') units.push(...discordPackageUnits(entries, label, claimed));
  if (!format || format === 'reddit') units.push(...redditUnits(entries, label, claimed));
  if (!format || format === 'googlechat') units.push(...googleChatUnits(entries, label, claimed));
  if (!format || format === 'instagram' || format === 'messenger') units.push(...metaUnits(entries, label, claimed, format));
  return units;
}

/** Meta: message_1.json, message_2.json, ... in one conversation folder are one conversation, so read them together. */
function metaUnits(entries, label, claimed, format) {
  const byDir = new Map();
  for (const e of entries) {
    if (claimed.has(e.path) || !/(^|\/)message_\d+\.json$/i.test(e.path)) continue;
    const obj = jsonOf(e);
    if (!looksLikeMeta(obj)) continue;
    const d = dirOf(e.path);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push({ obj, path: e.path });
    claimed.add(e.path);
  }
  const units = [];
  for (const [d, files] of byDir) {
    const platform = format || metaPlatform(`${label}/${d}`, files[0].obj);
    const messages = files.flatMap((x) => parseMeta(x.obj, { thread: platform, path: x.path }));
    messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    units.push({ format: platform, label: `${label}/${d}`.replace(/\/$/, ''), messages });
  }
  return units;
}

/** Discord data package: Messages/c<id>/messages.json (or .csv), channel.json beside it, Messages/index.json. */
function discordPackageUnits(entries, label, claimed) {
  const files = entries.filter((e) => !claimed.has(e.path) && DISCORD_PACKAGE_FILE.test(e.path));
  if (!files.length) return [];
  const units = [];
  const indexEntry = entries.find((e) => /(^|\/)messages\/index\.json$/i.test(e.path));
  const names = (indexEntry && jsonOf(indexEntry)) || {};
  if (indexEntry) claimed.add(indexEntry.path);
  for (const e of files) {
    const dir = dirOf(e.path);
    const chEntry = entries.find((x) => x.path === dir + 'channel.json');
    let channel = chEntry ? jsonOf(chEntry) : null;
    const id = (dir.match(/c?(\d+)\/$/) || [])[1];
    if (!channel?.name && id && typeof names[id] === 'string') channel = { ...(channel || {}), name: names[id] };
    const text = e.read().toString('utf8').replace(BOM, '');
    let rows = null;
    if (/\.json$/i.test(e.path)) {
      rows = safeJson(text);
      if (!Array.isArray(rows)) continue;
    }
    units.push({ format: 'discord', label: `${label}/${e.path}`, messages: parseDiscordPackage({ rows, csv: rows ? null : text, channel, thread: 'discord' }) });
    claimed.add(e.path);
    if (chEntry) claimed.add(chEntry.path);
  }
  return units;
}

/** Reddit data request: comments.csv and posts.csv from one folder are read together, so a comment finds its parent. */
function redditUnits(entries, label, claimed) {
  const byDir = new Map();
  for (const e of entries) {
    if (claimed.has(e.path) || !/(^|\/)(?:comments|posts)\.csv$/i.test(e.path)) continue;
    const text = e.read().toString('utf8');
    const kind = redditKind(text);
    if (!kind) continue;
    const d = dirOf(e.path);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push({ text, kind, path: e.path });
  }
  const units = [];
  for (const [d, files] of byDir) {
    for (const x of files) claimed.add(x.path);
    units.push({ format: 'reddit', label: `${label}/${d}`.replace(/\/$/, ''), messages: parseReddit(files, { thread: 'reddit' }) });
  }
  return units;
}

/** Google Chat in Takeout: Groups/<name>/messages.json, group_info.json beside it, Users/User <id>/user_info.json. */
function googleChatUnits(entries, label, claimed) {
  const files = entries.filter((e) => !claimed.has(e.path) && /(^|\/)Groups\/[^/]+\/messages\.json$/i.test(e.path));
  if (!files.length) return [];
  const userFiles = entries.filter((e) => /(^|\/)Users\/[^/]+\/user_info\.json$/i.test(e.path));
  const selfIds = userFiles.flatMap((e) => googleChatSelf(jsonOf(e)));
  const units = [];
  for (const e of files) {
    const obj = jsonOf(e);
    if (!looksLikeGoogleChat(obj)) continue;
    const gEntry = entries.find((x) => x.path === dirOf(e.path) + 'group_info.json');
    const group = (gEntry && jsonOf(gEntry)) || { name: dirOf(e.path).split('/').slice(-2, -1)[0] };
    units.push({ format: 'googlechat', label: `${label}/${e.path}`, messages: parseGoogleChat(obj, { thread: 'googlechat', group }), selfIds });
    claimed.add(e.path);
    if (gEntry) claimed.add(gEntry.path);
  }
  for (const e of userFiles) claimed.add(e.path);
  return units;
}
