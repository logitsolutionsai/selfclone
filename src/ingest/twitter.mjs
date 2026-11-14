// X / Twitter archive parser (data/tweets.js, or the older tweet.js).
// Every tweet in the archive was written by the account owner.

export function looksLikeTwitter(text) {
  return /^\s*window\.YTD\.tweets?\.part\d+\s*=/.test(text);
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The words the owner wrote: links expanded, media links and leading reply mentions removed. */
function tweetText(t) {
  let full = t.full_text ?? t.text ?? '';
  for (const u of t.entities?.urls || []) if (u.url && u.expanded_url) full = full.split(u.url).join(u.expanded_url);
  // Remove t.co media links that have no expansion.
  full = full.replace(/\s*https:\/\/t\.co\/\w+$/g, (m) => (t.entities?.media?.length || t.extended_entities?.media?.length ? '' : m));
  full = decodeEntities(full);
  if (t.in_reply_to_status_id_str) full = full.replace(/^(?:@\w+\s+)+/, '');
  return full.trim();
}

export function parseTwitter(text, { thread = 'x', me = 'me' } = {}) {
  const json = text.slice(text.indexOf('=') + 1).trim().replace(/;\s*$/, '');
  const arr = JSON.parse(json);
  const tweets = arr.map((x) => x.tweet || x).filter(Boolean);
  const byId = new Map(tweets.map((t) => [t.id_str || t.id, t]));
  const messages = [];
  for (const t of tweets) {
    if (/^RT @\w+:/.test(t.full_text ?? t.text ?? '')) continue; // retweets are not the owner's words
    const full = tweetText(t);
    if (!full) continue;
    const d = new Date(t.created_at);
    const parent = t.in_reply_to_status_id_str ? byId.get(t.in_reply_to_status_id_str) : null;
    messages.push({
      ts: Number.isNaN(d.getTime()) ? null : d.toISOString().replace('.000Z', 'Z'),
      author: me,
      self: true,
      text: full,
      thread,
      msgId: `${thread}#${t.id_str || t.id}`,
      // A reply to one of the owner's own tweets has its parent in the archive.
      contextOverride: parent ? tweetText(parent) || undefined : undefined,
      standalone: true,
    });
  }
  messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return messages;
}
