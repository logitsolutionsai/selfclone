// WhatsApp "Export chat" .txt parser. Handles Android ("12/31/20, 11:59 PM - Name: text")
// and iOS ("[31/12/2020, 23:59:59] Name: text") date styles, multi-line messages,
// system lines, media placeholders and invisible direction marks.

const DATE = String.raw`(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})`;
const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s?([AaPp])\.?\s?[Mm]\.?)?`;
const ANDROID = new RegExp(String.raw`^${DATE},? ${TIME} - (.*)$`);
const IOS = new RegExp(String.raw`^\[${DATE},? ${TIME}\] (.*)$`);

const SKIP_TEXT = [
  /^<media omitted>$/i,
  /^(?:image|video|audio|sticker|gif|document|contact card|voice message) omitted$/i,
  /\bdocument omitted$/i,
  /^<attached: [^>]+>$/i,
  /^.*\(file attached\)$/i,
  /^this message was deleted\.?$/i,
  /^you deleted this message\.?$/i,
  /^missed (?:voice|video|group voice|group video) call/i,
  /^null$/,
  /^messages and calls are end-to-end encrypted/i,
  /^waiting for this message/i,
  /^<view once (?:voice message|photo|video) omitted>$/i,
  /^location: https?:\/\/\S+$/i,
  /^live location shared$/i,
  /^POLL:\n/,
];

// Android system lines that quote a user-chosen name can contain ": ", for example
// `Ana changed the subject from "Sail: Sat" to "Sail: Sun"` or `Ana added Dr. Lee: Lab`.
const SYSTEM_PHRASE = /\s(?:created group|created this group|added|removed|left|changed the subject|changed this group's|changed the group|joined using|pinned a message|changed their phone number|changed to|deleted this group's|turned (?:on|off) disappearing|reset this group's|was added|is a contact)\b/;

// iOS marks every line it generates itself (system notes, media placeholders, deleted
// messages, calls, locations) with a left-to-right mark right after "Name: ".
const GENERATED = '\u0001';

export function looksLikeWhatsApp(text) {
  const lines = clean(text).split('\n').filter((l) => l.trim()).slice(0, 30);
  let hits = 0;
  for (const l of lines) if (ANDROID.test(l) || IOS.test(l)) hits++;
  return hits >= Math.min(2, lines.length) && hits > 0;
}

function clean(text) {
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/: \u200E/g, `: ${GENERATED}`)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u202F\u00A0]/g, ' ')
    .replace(/\r\n?/g, '\n');
}

// How often a reading makes time go backwards, and how long a period it spans.
function timeline(headers, order) {
  let back = 0;
  let span = 0;
  let prev = null;
  for (const h of headers) {
    const t = toIso(h, order);
    if (!t) continue;
    const ms = Date.parse(t);
    if (prev != null && ms < prev) back++;
    else if (prev != null) span += ms - prev;
    prev = ms;
  }
  return { back, span };
}

function detectDateOrder(headers) {
  let firstBig = false;
  let secondBig = false;
  let yearFirst = false;
  let ampm = false;
  for (const h of headers) {
    const a = Number(h.a);
    const b = Number(h.b);
    if (h.a.length === 4) yearFirst = true;
    if (a > 12 && h.a.length <= 2) firstBig = true;
    if (b > 12) secondBig = true;
    if (h.ap) ampm = true;
  }
  if (yearFirst) return 'YMD';
  if (firstBig) return 'DMY';
  if (secondBig) return 'MDY';
  // Every day and month is 12 or less. Messages are in time order, so the reading
  // that keeps the timestamps going forward is the right one; if both do, the one
  // that steps through days rather than months ("03/02, 04/02, 05/02").
  const dmy = timeline(headers, 'DMY');
  const mdy = timeline(headers, 'MDY');
  if (dmy.back !== mdy.back) return dmy.back < mdy.back ? 'DMY' : 'MDY';
  if (dmy.span !== mdy.span) return dmy.span < mdy.span ? 'DMY' : 'MDY';
  return ampm ? 'MDY' : 'DMY';
}

function toIso(h, order) {
  let y;
  let mo;
  let d;
  if (order === 'YMD') [y, mo, d] = [h.a, h.b, h.c];
  else if (order === 'MDY') [mo, d, y] = [h.a, h.b, h.c];
  else [d, mo, y] = [h.a, h.b, h.c];
  let year = Number(y);
  if (year < 100) year += 2000;
  let hour = Number(h.hh);
  if (h.ap) {
    const pm = h.ap.toLowerCase() === 'p';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const dt = new Date(Date.UTC(year, Number(mo) - 1, Number(d), hour, Number(h.mm), Number(h.ss || 0)));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().replace('.000Z', 'Z');
}

/** Contact names that contain ": " ("Dr. Lee: Lab"): every line from them splits the same way. */
function colonNames(rests) {
  const seconds = new Map();
  for (const rest of rests) {
    const i = rest.indexOf(': ');
    if (i <= 0) continue;
    const first = rest.slice(0, i);
    const j = rest.indexOf(': ', i + 2);
    const second = j > 0 && j - i <= 40 ? rest.slice(0, j) : null;
    if (!seconds.has(first)) seconds.set(first, []);
    seconds.get(first).push(second);
  }
  const names = [];
  for (const list of seconds.values()) {
    if (list.length >= 2 && list[0] && list.every((s) => s === list[0])) names.push(list[0]);
  }
  return names;
}

/**
 * Parse a WhatsApp export into messages: [{ts, author, text, thread}].
 * System lines are dropped. Media placeholders are dropped.
 */
export function parseWhatsApp(text, { thread = 'whatsapp' } = {}) {
  const lines = clean(text).split('\n');
  const raw = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(IOS) || line.match(ANDROID);
    if (m) {
      const [, a, b, c, hh, mm, ss, ap, rest] = m;
      cur = { a, b, c, hh, mm, ss, ap, rest };
      raw.push(cur);
    } else if (cur) {
      cur.rest += '\n' + line;
    }
  }
  const multiColon = colonNames(raw.map((r) => r.rest.split('\n')[0]).filter((r) => !SYSTEM_PHRASE.test(r.slice(0, r.indexOf(': ')))));
  const prefixCount = new Map();
  for (const r of raw) {
    const i = r.rest.indexOf(': ');
    if (i > 0) prefixCount.set(r.rest.slice(0, i), (prefixCount.get(r.rest.slice(0, i)) || 0) + 1);
  }
  for (const r of raw) {
    const name = multiColon.find((n) => r.rest.startsWith(n + ': '));
    const nameSep = name ? name.length : r.rest.indexOf(': ');
    const author = nameSep > 0 ? r.rest.slice(0, nameSep).trim() : '';
    // Android system lines have no "Name: " part, or quote a name that contains ": ". A quote in a
    // name that writes several messages (Bob "Builder" Smith) is a real contact name.
    const oneOffQuote = /["“”]/.test(author) && (prefixCount.get(r.rest.slice(0, nameSep)) || 0) <= 1;
    if (nameSep <= 0 || nameSep > 80 || oneOffQuote || SYSTEM_PHRASE.test(author)) {
      r.system = true;
      continue;
    }
    r.author = author.replace(/^~\s*/, ''); // iOS shows people who are not in your contacts as "~ Name"
    r.text = r.rest.slice(nameSep + 2);
  }
  const order = detectDateOrder(raw);
  const out = [];
  for (const r of raw) {
    if (r.system) continue;
    if (r.text.startsWith(GENERATED)) continue;
    let t = r.text.split(GENERATED).join('').replace(/\s*<This message was edited>\s*$/i, '').trim();
    t = t.replace(/^[^\n]*\(file attached\)\n+/i, ''); // Android attachment line above a caption
    if (!t || SKIP_TEXT.some((re) => re.test(t))) continue;
    out.push({ ts: toIso(r, order), author: r.author, text: t, thread });
  }
  return out;
}
