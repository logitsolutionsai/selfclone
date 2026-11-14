// Small HTML and XML helpers shared by the LinkedIn, Word and blog parsers.
// No dependencies: regular expressions over well-formed export files.

const NAMED = {
  nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…', eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â',
  atilde: 'ã', ccedil: 'ç', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', uuml: 'ü', ouml: 'ö',
  auml: 'ä', ntilde: 'ñ', szlig: 'ß', euro: '€', pound: '£', copy: '©', middot: '·', bull: '•', laquo: '«',
  raquo: '»', trade: '™', reg: '®', deg: '°', times: '×',
};

function codePoint(n, fallback) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return fallback;
  }
}

/** Decode named and numeric character references. `&amp;` is decoded last, so `&amp;lt;` stays `&lt;`. */
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d{1,7});/g, (m, d) => codePoint(Number(d), m))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() === 'amp' ? m : NAMED[n] ?? NAMED[n.toLowerCase()] ?? m))
    .replace(/&amp;/gi, '&');
}

/** Unwrap a CDATA section, if the value is one. */
export function cdata(s) {
  const m = String(s).match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : String(s);
}

const DROP_BLOCKS = /<(head|script|style|noscript|template|svg|nav|header|footer|aside|form|pre|code|button|select|figure|iframe|object)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * Turn an HTML fragment into paragraphs of prose. Headings are dropped (a title is not how someone writes),
 * code blocks and page furniture (navigation, header, footer, forms) are removed, and every block element ends a
 * paragraph. Line breaks in the HTML source are not line breaks in the text.
 */
export function htmlParagraphs(html, { keepHeadings = false } = {}) {
  let t = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(DROP_BLOCKS, ' ');
  if (!keepHeadings) t = t.replace(/<h[1-6]\b[\s\S]*?<\/h[1-6]\s*>/gi, ' ');
  t = t
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|li|ul|ol|tr|table|blockquote|section|article|main|h[1-6]|dd|dt|dl)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  return t
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t ]*\n[ \t ]*/g, '\n').replace(/[ \t ]{2,}/g, ' ').trim())
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
}

/** Inner HTML of every element with this tag name (non-nested use only: article, main, item, entry). */
export function elements(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  return [...String(html).matchAll(re)].map((m) => m[1]);
}

/** Text content of the first child element named `tag` (namespace prefixes allowed in the name). */
export function childText(xml, tag) {
  const re = new RegExp(`<${tag.replace(/[:]/g, '\\:')}\\b[^>]*?(?:/>|>([\\s\\S]*?)<\\/${tag.replace(/[:]/g, '\\:')}\\s*>)`, 'i');
  const m = String(xml).match(re);
  return m && m[1] != null ? cdata(m[1]) : null;
}
