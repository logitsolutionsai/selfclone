// Word documents (.docx): the text of word/document.xml, read with the built-in
// ZIP reader. Everything is treated as written by the user, like notes.
import { readZip } from './zip.mjs';
import { decodeEntities } from './html.mjs';
import { parsePlain } from './generic.mjs';

const HEADING_STYLE = /^(?:Title|Subtitle|Heading\d*|TOC\d*|Caption|Header|Footer)$/i;

/** Paragraphs of the main document body. Headings, deleted text and field codes are left out. */
export function docxParagraphs(xml) {
  const body = String(xml).replace(/<w:del\b[\s\S]*?<\/w:del>/g, '').replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, '');
  const out = [];
  for (const p of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const style = (p[1] || '').match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
    if (style && HEADING_STYLE.test(style[1])) continue;
    const inner = (p[1] || '').replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/g, ''); // tab stops in the paragraph settings are not text
    let text = '';
    for (const t of inner.matchAll(/<w:t\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)|<w:(tab|br|cr)\b[^>]*\/>/g)) {
      if (t[2] === 'tab') text += '\t';
      else if (t[2]) text += '\n';
      else text += t[1] || '';
    }
    text = decodeEntities(text).replace(/[ \t]+/g, ' ').trim();
    if (/[\p{L}\p{N}]/u.test(text)) out.push(text);
  }
  return out;
}

export function parseDocx(buf, { thread = 'docx', ts = null, me = 'me' } = {}) {
  const entry = readZip(buf).find((e) => e.path === 'word/document.xml');
  if (!entry) throw new Error('Not a Word document (no word/document.xml)');
  const paras = docxParagraphs(entry.read().toString('utf8'));
  return parsePlain(paras.join('\n\n'), { thread, ts, me });
}
