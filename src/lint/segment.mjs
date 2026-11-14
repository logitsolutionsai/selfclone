// A modest Markdown segmenter for lint: a line-based state machine, not a full Markdown parser.
// It finds blocks (headings, paragraphs, list items, table rows) and protected spans (front matter,
// fenced and indented code, HTML comments and tags, inline code, link and image targets, bare URLs,
// MDX imports, JSX and expressions, and technical tokens such as issue references, git hashes,
// versions, file paths, command lines, API identifiers, flags, test results and citations).
// Protected spans are never rewritten and never checked by surface-style rules.
//
// Offsets are UTF-16 code units into the decoded text (a JavaScript string index), after a byte order
// mark is removed. Lines and columns are 1-based; a column also counts UTF-16 code units, which is the
// SARIF default (columnKind "utf16CodeUnits"). Line breaks may be \n, \r\n or \r.

export function lineTable(text) {
  const lines = [];
  const re = /\r\n|\n|\r/g;
  let start = 0;
  let m;
  while ((m = re.exec(text))) {
    lines.push({ start, end: m.index });
    start = m.index + m[0].length;
  }
  lines.push({ start, end: text.length });
  return lines;
}

/** 1-based line and column of an offset. */
export function position(lines, offset) {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lines[lo].start + 1 };
}

// Technical tokens inside prose. Each is protected from rewrites and from style rules.
const TECH = [
  ['command', /^[ \t]*\$[ \t]+\S.*$/gm],
  ['issue', /(?<![\w&/])(?:[\w.-]+\/[\w.-]+)?#\d+\b|\bGH-\d+\b/g],
  ['url', /\b(?:https?|ftp):\/\/[^\s<>()\]]+|\bwww\.[^\s<>()\]]+/g],
  ['email-like', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g],
  ['version', /(?<![\w.])v?\d+\.\d+(?:\.\d+)*(?:-[\w.]+)?(?:\+[\w.]+)?(?![\w])/g],
  ['hash', /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g],
  ['path', /(?<![\w@])(?:\.{1,2}\/|~\/|\/)?(?:[\w.@-]+\/)+[\w.@-]+\/?|\b[\w-]+\.(?:mjs|cjs|js|ts|tsx|jsx|json|jsonl|md|mdx|yml|yaml|toml|py|rs|go|sh|txt|css|html|lock)\b/g],
  ['identifier', /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?:\(\))?|\b[A-Za-z_$][\w$]*\(\)|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g],
  ['flag', /(?<![\w-])--?[a-z][\w-]*(?:=\S+)?/g],
  ['test-result', /\b\d+\s+(?:tests?\s+)?(?:passed|failed|passing|failing|skipped|pending)\b/gi],
  ['citation', /\[\d+(?:[,–-]\s*\d+)*\]|\[@[\w:.-]+\]/g],
];

function addMatches(spans, kind, re, text, from, to) {
  re.lastIndex = 0;
  const slice = text.slice(from, to);
  let m;
  while ((m = re.exec(slice))) {
    if (!m[0].length) {
      re.lastIndex++;
      continue;
    }
    spans.push({ kind, start: from + m.index, end: from + m.index + m[0].length });
  }
}

function mergeSpans(spans) {
  const s = spans.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x.start < last.end) {
      if (x.end > last.end) last.end = x.end;
      continue;
    }
    out.push({ ...x });
  }
  return out;
}

/** Inline protected spans in [from, to): code spans, links, images, autolinks, HTML, MDX expressions, technical tokens. */
function inlineSpans(text, from, to, { mdx, warnings, lines }) {
  const spans = [];
  const s = text.slice(from, to);
  // Code spans: a run of n backticks closed by a run of exactly n.
  for (let i = 0; i < s.length; ) {
    if (s[i] !== '`') {
      i++;
      continue;
    }
    let n = 0;
    while (s[i + n] === '`') n++;
    let j = i + n;
    let found = -1;
    while (j < s.length) {
      if (s[j] === '`') {
        let k = 0;
        while (s[j + k] === '`') k++;
        if (k === n) {
          found = j;
          break;
        }
        j += k;
      } else j++;
    }
    if (found >= 0) {
      spans.push({ kind: 'code', start: from + i, end: from + found + n });
      i = found + n;
    } else i += n;
  }
  const coded = mergeSpans(spans);
  const inCode = (a) => coded.some((c) => a >= c.start && a < c.end);
  const push = (kind, a, b) => {
    if (!inCode(a)) spans.push({ kind, start: a, end: b });
  };
  let m;
  // Images are protected whole (alt text included): an image can be a tracking beacon.
  const img = /!\[[^\]\n]*\]\([^)\n]*\)/g;
  while ((m = img.exec(s))) push('image', from + m.index, from + m.index + m[0].length);
  const link = /\]\(([^)\n]*)\)/g;
  while ((m = link.exec(s))) push('url', from + m.index + 1, from + m.index + m[0].length);
  const refDef = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S.*$/gm;
  while ((m = refDef.exec(s))) push('url', from + m.index, from + m.index + m[0].length);
  const auto = /<(?:https?|mailto):[^>\s]+>/g;
  while ((m = auto.exec(s))) push('url', from + m.index, from + m.index + m[0].length);
  const tag = /<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g;
  while ((m = tag.exec(s))) push('html', from + m.index, from + m.index + m[0].length);
  if (mdx) {
    // Balanced {...} expressions; an unbalanced brace is reported, never edited.
    let depth = 0;
    let open = -1;
    for (let i = 0; i < s.length; i++) {
      if (inCode(from + i)) continue;
      if (s[i] === '{') {
        if (depth++ === 0) open = i;
      } else if (s[i] === '}' && depth > 0) {
        if (--depth === 0) spans.push({ kind: 'mdx-expression', start: from + open, end: from + i + 1 });
      }
    }
    if (depth > 0) {
      spans.push({ kind: 'mdx-expression', start: from + open, end: to });
      const p = position(lines, from + open);
      warnings.push({ code: 'W_MDX_UNSUPPORTED', message: `Unbalanced "{" at line ${p.line}: the rest of the block is protected and not checked.` });
    }
  }
  for (const [kind, re] of TECH) addMatches(spans, kind, re, text, from, to);
  return spans;
}

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const ATX = /^( {0,3})(#{1,6})(?:[ \t]+|$)/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const TABLE = /^[ \t]*\|.*\|[ \t]*$/;
const TABLE_SEP = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;
const HTML_BLOCK = /^[ \t]{0,3}<\/?[A-Za-z][\w:.-]*(?:[\s/>]|$)/;

/**
 * Segment a Markdown (or MDX, or plain text) document.
 * @returns {{ lines, blocks: {type, start, end, line, level?}[], protected: {kind, start, end}[], warnings }}
 */
export function segment(text, { mdx = false, plain = false } = {}) {
  const lines = lineTable(text);
  const lineText = (i) => text.slice(lines[i].start, lines[i].end);
  const prot = [];
  const blocks = [];
  const warnings = [];
  const skip = new Array(lines.length).fill(false);

  if (!plain) {
    // Front matter.
    if (lines.length > 1 && /^---[ \t]*$/.test(lineText(0))) {
      for (let i = 1; i < lines.length; i++) {
        if (/^(?:---|\.\.\.)[ \t]*$/.test(lineText(i))) {
          prot.push({ kind: 'frontmatter', start: 0, end: lines[i].end });
          for (let k = 0; k <= i; k++) skip[k] = true;
          break;
        }
      }
    }
    // Fences.
    for (let i = 0; i < lines.length; i++) {
      if (skip[i]) continue;
      const m = FENCE_OPEN.exec(lineText(i));
      if (!m || (m[2][0] === '`' && m[3].includes('`'))) continue;
      const ch = m[2][0];
      const len = m[2].length;
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const c = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lineText(j));
        if (c && c[1][0] === ch && c[1].length >= len) {
          close = j;
          break;
        }
      }
      const last = close >= 0 ? close : lines.length - 1;
      if (close < 0) warnings.push({ code: 'W_UNCLOSED_FENCE', message: `The code fence opened at line ${i + 1} is never closed; the rest of the file is treated as code.` });
      prot.push({ kind: 'fence', start: lines[i].start, end: lines[last].end });
      for (let k = i; k <= last; k++) skip[k] = true;
      i = last;
    }
    // HTML comments, possibly spanning lines.
    const fenced = mergeSpans(prot);
    const inFence = (o) => fenced.some((f) => o >= f.start && o < f.end);
    let at = text.indexOf('<!--');
    while (at >= 0) {
      if (inFence(at)) {
        at = text.indexOf('<!--', at + 4);
        continue;
      }
      const endAt = text.indexOf('-->', at + 4);
      const end = endAt < 0 ? text.length : endAt + 3;
      prot.push({ kind: 'comment', start: at, end });
      for (let k = 0; k < lines.length; k++) {
        const L = lines[k];
        // A line whose non-blank content is all inside the comment is not a prose line.
        const txt = lineText(k);
        const a = L.start + (txt.length - txt.trimStart().length);
        const b = L.start + txt.trimEnd().length;
        if (a >= at && b <= end && b > a) skip[k] = true;
      }
      at = endAt < 0 ? -1 : text.indexOf('<!--', end);
    }
  }

  let cur = null;
  const close = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  let prevBlank = true;
  let inList = false;
  let jsxDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const t = lineText(i);
    if (skip[i]) {
      close();
      prevBlank = false;
      continue;
    }
    if (!t.trim()) {
      close();
      prevBlank = true;
      continue;
    }
    if (plain) {
      if (!cur) cur = { type: 'paragraph', start: L.start, end: L.end, line: i + 1 };
      else cur.end = L.end;
      prevBlank = false;
      continue;
    }
    if (mdx && (jsxDepth > 0 || (/^(?:import|export)[ \t]/.test(t) && !cur))) {
      close();
      prot.push({ kind: jsxDepth > 0 ? 'jsx' : 'mdx-esm', start: L.start, end: L.end });
      if (jsxDepth > 0) jsxDepth = Math.max(0, jsxDepth + (t.match(/</g) || []).length - (t.match(/>/g) || []).length);
      prevBlank = false;
      continue;
    }
    if (HTML_BLOCK.test(t) && !cur) {
      close();
      prot.push({ kind: mdx ? 'jsx' : 'html', start: L.start, end: L.end });
      if (mdx) {
        const opens = (t.match(/</g) || []).length;
        const closes = (t.match(/>/g) || []).length;
        if (opens > closes) {
          jsxDepth = opens - closes;
          warnings.push({ code: 'W_MDX_UNSUPPORTED', message: `A JSX tag at line ${i + 1} spans several lines; those lines are protected and not checked.` });
        }
      }
      prevBlank = false;
      continue;
    }
    if (prevBlank && !inList && /^(?: {4}|\t)/.test(t)) {
      close();
      prot.push({ kind: 'indented-code', start: L.start, end: L.end });
      prevBlank = false;
      continue;
    }
    if (cur && cur.type === 'paragraph' && SETEXT.test(t)) {
      cur.type = 'heading';
      cur.level = t.trim()[0] === '=' ? 1 : 2;
      close();
      prevBlank = false;
      continue;
    }
    if (HR.test(t)) {
      close();
      prevBlank = false;
      continue;
    }
    const h = ATX.exec(t);
    if (h) {
      close();
      // Content without the opening and closing #s.
      const content = t.slice(h[0].length).replace(/[ \t]+#+[ \t]*$|[ \t]+$/, '');
      const s = L.start + h[0].length;
      blocks.push({ type: 'heading', level: h[2].length, start: s, end: s + content.length, line: i + 1 });
      inList = false;
      prevBlank = false;
      continue;
    }
    if (TABLE.test(t)) {
      close();
      if (!TABLE_SEP.test(t)) blocks.push({ type: 'table', start: L.start, end: L.end, line: i + 1 });
      prevBlank = false;
      continue;
    }
    const li = LIST.exec(t);
    if (li) {
      close();
      cur = { type: 'list-item', start: L.start + li[0].length, end: L.end, line: i + 1 };
      inList = true;
      prevBlank = false;
      continue;
    }
    // Blockquote markers are skipped; the quote's text is checked as a paragraph.
    const q = /^[ \t]{0,3}(?:>[ \t]?)+/.exec(t);
    const s = L.start + (q ? q[0].length : t.length - t.trimStart().length);
    if (cur && !prevBlank) cur.end = L.end;
    else {
      close();
      if (prevBlank && !/^[ \t]/.test(t)) inList = false;
      cur = { type: 'paragraph', start: s, end: L.end, line: i + 1 };
    }
    prevBlank = false;
  }
  close();
  for (const b of blocks) prot.push(...inlineSpans(text, b.start, b.end, { mdx, warnings, lines }));
  return { lines, blocks, protected: mergeSpans(prot), warnings };
}

/** The block's text with every protected span replaced by spaces of the same length, so offsets still line up. */
export function maskedText(text, block, spans) {
  const chars = text.slice(block.start, block.end).split('');
  for (const p of spans) {
    if (p.end <= block.start || p.start >= block.end) continue;
    for (let o = Math.max(p.start, block.start); o < Math.min(p.end, block.end); o++) chars[o - block.start] = ' ';
  }
  return chars.join('');
}

/** The protected spans as their exact source text, in order: what a rewrite must keep byte for byte. */
export function protectedTexts(text, opts) {
  const seg = segment(text, opts);
  return seg.protected.map((p) => ({ kind: p.kind, text: text.slice(p.start, p.end) }));
}
