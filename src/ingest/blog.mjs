// Blog posts: saved HTML pages and RSS or Atom feed files. Everything is
// treated as written by the user, like notes: it shapes the voice, and is never
// sealed because a post answers nobody.
import { htmlParagraphs, elements, childText, decodeEntities } from './html.mjs';
import { parsePlain } from './generic.mjs';

export function looksLikeFeed(text) {
  const head = String(text).slice(0, 4000);
  return /<rss\b[^>]*>/i.test(head) || /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(head) || /<rdf:RDF\b/i.test(head);
}

/** True when an HTML page found inside a folder looks like an article someone wrote, not an app's export page. */
export function looksLikeArticle(html) {
  const s = String(html);
  return /<article\b/i.test(s) || /<meta\b[^>]*property=["']og:type["'][^>]*content=["']article["']/i.test(s) || /<meta\b[^>]*content=["']article["'][^>]*property=["']og:type["']/i.test(s);
}

function iso(v) {
  if (!v) return null;
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toMessages(paras, opts) {
  return parsePlain(paras.join('\n\n'), opts);
}

/** One saved HTML page: the article (or main) content, without navigation, headers, footers or code. */
export function parseHtmlPage(html, { thread = 'blog', ts = null, me = 'me' } = {}) {
  const s = String(html);
  const published = s.match(/<meta\b[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)?.[1] || s.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1];
  let parts = elements(s, 'article');
  if (!parts.length) parts = elements(s, 'main');
  if (!parts.length) parts = elements(s, 'body');
  if (!parts.length) parts = [s];
  const paras = parts.flatMap((p) => htmlParagraphs(p));
  return toMessages(paras, { thread, ts: iso(published) || ts, me });
}

/** RSS 2.0, RSS 1.0 (RDF) or Atom: one post per item or entry, full content preferred over the summary. */
export function parseFeed(xml, { thread = 'blog', me = 'me' } = {}) {
  const s = String(xml);
  const items = [...elements(s, 'item'), ...elements(s, 'entry')];
  const out = [];
  for (const it of items) {
    const html = childText(it, 'content:encoded') ?? childText(it, 'content') ?? childText(it, 'description') ?? childText(it, 'summary') ?? '';
    // Feeds escape the HTML of a post (&lt;p&gt;) unless it is in CDATA.
    const body = /&lt;[a-z]/i.test(html) && !/<[a-z]/i.test(html) ? decodeEntities(html) : html;
    const when = iso(childText(it, 'pubDate') ?? childText(it, 'published') ?? childText(it, 'updated') ?? childText(it, 'dc:date'));
    const title = decodeEntities(childText(it, 'title') || '').replace(/<[^>]+>/g, '').trim();
    out.push(...toMessages(htmlParagraphs(body), { thread: `${thread}:${title || 'post'}`, ts: when, me }));
  }
  return out;
}
