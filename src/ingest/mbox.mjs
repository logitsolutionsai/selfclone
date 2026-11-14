// mbox parser (Gmail Takeout, Thunderbird, Apple Mail exports) and single .eml files.
// Keeps the readable text/plain part, decodes quoted-printable and base64,
// strips quoted replies and signatures from the user's own messages, and keeps
// the quoted part as the context the user was replying to.

export function looksLikeMbox(text) {
  const head = text.slice(0, 4000);
  return /^From \S+/m.test(head) && /^(?:From|Date|Subject|Message-ID):/im.test(head);
}

export function looksLikeEml(text) {
  const head = text.slice(0, 4000);
  return /^(?:From|Received|Return-Path|Delivered-To|MIME-Version):/im.test(head) && /^Subject:/im.test(head);
}

// The "From " separator line carries a postmark time ("From x@y Wed Jan 14 21:41:07 2026").
// A body line that merely starts with "From " ("From my side...") is not a separator.
const FROM_LINE = /^From \S*[^\n]*\b\d{1,2}:\d{2}:\d{2}\b[^\n]*$/;

export function splitMbox(text) {
  const t = text.replace(/\r\n?/g, '\n');
  const parts = t.split(/\n(?=From [^\n]*\n)/);
  const out = [];
  for (const p of parts) {
    const first = p.slice(0, p.indexOf('\n') >>> 0);
    if (out.length && !FROM_LINE.test(first)) out[out.length - 1] += '\n' + p;
    else out.push(p);
  }
  // mboxrd escapes body lines that start with "From " as ">From "; undo one level.
  return out.map((p) => p.replace(/^From [^\n]*\n/, '').replace(/^>(>*From )/gm, '$1')).filter((p) => p.trim());
}

function decodeCharset(bytes, charset) {
  const cs = (charset || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
  try {
    return new TextDecoder(cs).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function latin1Bytes(s) {
  return Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

export function decodeQP(s) {
  const soft = s.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < soft.length; i++) {
    const c = soft[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = c.charCodeAt(0);
      if (code < 256) bytes.push(code);
      else for (const b of Buffer.from(c, 'utf8')) bytes.push(b);
    }
  }
  return Uint8Array.from(bytes);
}

// RFC 2047 encoded words in headers: =?UTF-8?B?...?= and =?ISO-8859-1?Q?...?=
export function decodeHeader(v) {
  return String(v || '')
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, data) => {
      const bytes = enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : decodeQP(data.replace(/_/g, ' '));
      return decodeCharset(bytes, cs);
    });
}

function parseHeaders(block) {
  const headers = {};
  const unfolded = block.replace(/\n[ \t]+/g, ' ');
  for (const line of unfolded.split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (!(k in headers)) headers[k] = v;
  }
  return headers;
}

function param(header, name) {
  const m = String(header || '').match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, 'i'));
  return m ? (m[2] ?? m[1]) : undefined;
}

function decodeBody(body, headers) {
  const cte = (headers['content-transfer-encoding'] || '').toLowerCase();
  const charset = param(headers['content-type'], 'charset');
  if (cte.includes('base64')) return decodeCharset(Buffer.from(body.replace(/\s+/g, ''), 'base64'), charset);
  if (cte.includes('quoted-printable')) return decodeCharset(decodeQP(body), charset);
  // 7bit / 8bit: the file was read as latin1 so bytes are preserved; decode with the declared charset.
  return decodeCharset(latin1Bytes(body), charset);
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/\s+/g, ' ') // line breaks in HTML source are not line breaks in the mail
    .replace(/<\/(?:div|p|li|tr|h\d)>\s*<br\s*\/?>/gi, (m) => m.replace(/<br\s*\/?>/i, ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, (m) => m.replace(/^/gm, '> '))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d{1,7});/g, (m, d) => codePoint(Number(d), m))
    .replace(/&(?:rsquo|lsquo);/g, '’')
    .replace(/&(?:rdquo|ldquo);/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n] ?? m)
    .replace(/&amp;/g, '&')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
}

const NAMED = { eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', ccedil: 'ç', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ', szlig: 'ß', euro: '€', pound: '£', copy: '©', middot: '·', bull: '•', laquo: '«', raquo: '»' };

function codePoint(n, fallback) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return fallback;
  }
}

// Returns {plain, html} text for a MIME entity (recursing into multiparts).
function extractText(raw) {
  const sep = raw.search(/\n\n/);
  const headBlock = sep >= 0 ? raw.slice(0, sep) : raw;
  const body = sep >= 0 ? raw.slice(sep + 2) : '';
  const headers = parseHeaders(headBlock);
  const ctype = (headers['content-type'] || 'text/plain').toLowerCase();
  if (ctype.startsWith('multipart/')) {
    const boundary = param(headers['content-type'], 'boundary');
    if (!boundary) return { plain: '', html: '' };
    const parts = body.split(new RegExp(`\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\s*\\n`));
    let plain = '';
    let html = '';
    for (const p of parts.slice(1)) {
      if (!p.trim()) continue;
      const r = extractText(p);
      if (!plain && r.plain) plain = r.plain;
      if (!html && r.html) html = r.html;
    }
    return { plain, html };
  }
  const disp = (headers['content-disposition'] || '').toLowerCase();
  if (disp.startsWith('attachment')) return { plain: '', html: '' };
  if (ctype.startsWith('text/plain')) return { plain: decodeBody(body, headers), html: '' };
  if (ctype.startsWith('text/html')) return { plain: '', html: htmlToText(decodeBody(body, headers)) };
  return { plain: '', html: '' };
}

// "On <date>, <name> wrote:" in the languages mail clients use. Gmail in Portuguese also writes
// "<name> <addr> escreveu no dia <date>:", and German puts the verb first ("schrieb <name>:").
const INTRO = 'On|Em|No dia|El|Le|Am|Il|Il giorno|Op|Den|På|W dniu';
const VERBS = '(?:wrote|escreveu|escribió|a écrit|schrieb|ha scritto|schreef|skrev|napisał)';
const ATTRIBUTION = new RegExp(String.raw`\n?(?:(?:${INTRO})\s[^\n]{0,200}(?:\n[^\n]{0,120})?${VERBS}|[^\n]{0,120}<[^>\n]+@[^>\n]+>[^\n]{0,40}${VERBS})[^\n]{0,80}:[ \t]*\n`);
const ATTRIBUTION_LINE = new RegExp(String.raw`^(?:(?:${INTRO})\s.*${VERBS}|.*<[^>]+@[^>]+>.*${VERBS}|${VERBS}).*:\s*$`);

/** Split an email body into the author's own words and the quoted text they replied to. */
export function splitReply(body) {
  let text = body.replace(/\r\n?/g, '\n');
  // Outlook-style forwarded/replied block: everything after it is quoted.
  const outlook = text.search(/\n-{2,}\s*Original Message\s*-{2,}|\n_{10,}\s*\nFrom: |\nFrom: [^\n]+\nSent: [^\n]+\n/i);
  let quoted = '';
  if (outlook >= 0) {
    quoted = text.slice(outlook);
    text = text.slice(0, outlook);
  }
  // Attribution line: "On Mon, 1 Jan 2024 at 10:00, Jane <j@x.com> wrote:" (may wrap once),
  // also in the other languages Gmail, Apple Mail and Outlook write it in.
  const attrib = text.search(ATTRIBUTION);
  if (attrib >= 0) {
    quoted = text.slice(attrib).replace(ATTRIBUTION, '\n') + '\n' + quoted;
    text = text.slice(0, attrib);
  }
  const own = [];
  const q = [];
  for (const line of text.split('\n')) {
    if (/^\s*>/.test(line)) q.push(line.replace(/^\s*(?:>\s?)+/, ''));
    else own.push(line);
  }
  if (quoted) {
    for (const line of quoted.split('\n')) {
      if (ATTRIBUTION_LINE.test(line) || /^(?:From|Sent|To|Cc|Subject|Date|De|Enviado|Para|Assunto|Asunto|Von|Gesendet|An|Betreff|Envoyé|Objet|À):/i.test(line) || /Original Message|Mensagem original|Mensaje original|Ursprüngliche Nachricht|Message d'origine/i.test(line)) continue;
      q.push(line.replace(/^\s*(?:>\s?)+/, ''));
    }
  }
  let mine = own.join('\n');
  // Signature: RFC 3676 delimiter "-- " and common mobile footers.
  mine = ('\n' + mine).split(/\n-- ?\n/)[0];
  mine = mine.replace(/\n*(?:Sent from my [^\n]+|Get Outlook for [^\n]+|Sent from Mail for Windows[^\n]*|Enviado (?:do|desde) (?:meu|mi) [^\n]+|Envoyé de mon [^\n]+|Von meinem [^\n]+ gesendet|Inviato da [^\n]+|Verzonden met [^\n]+)\s*$/i, '');
  return {
    own: mine.replace(/\n{3,}/g, '\n\n').trim(),
    quoted: q.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

export function parseEmail(raw) {
  const sep = raw.search(/\n\n/);
  const headers = parseHeaders(sep >= 0 ? raw.slice(0, sep) : raw);
  const { plain, html } = extractText(raw);
  const body = plain || html || '';
  const date = headers.date ? new Date(headers.date.replace(/\s*\([^)]*\)\s*$/, '')) : null;
  return {
    from: decodeHeader(headers.from || ''),
    subject: decodeHeader(headers.subject || ''),
    messageId: (headers['message-id'] || '').trim(),
    inReplyTo: (headers['in-reply-to'] || '').trim().split(/\s+/)[0] || '',
    ts: date && !Number.isNaN(date.getTime()) ? date.toISOString().replace('.000Z', 'Z') : null,
    body,
  };
}

const SIGN_OFF = /^(?:best|best wishes|cheers|thanks|thank you|many thanks|regards|kind regards|best regards|warm regards|all the best|take care|love|ciao|abraço|abraços|beijos|bjs|obrigad[ao]|saludos|un saludo|gracias|grüße|viele grüße|liebe grüße|cordialement|bises|x+)[,!.]?$/i;

function senderKey(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim().toLowerCase();
}

/**
 * Remove signature blocks that have no "-- " line (Apple Mail, Outlook, most phones):
 * two or more lines that end at least two of the same sender's mails. A sign-off line
 * ("Best,") and the short name under it are kept: they are how the person writes.
 */
export function stripRepeatedSignatures(messages) {
  const groups = new Map();
  for (const m of messages) {
    if (!m.text) continue;
    const k = senderKey(m.author);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const seen = new Map();
    for (const m of list) {
      const tail = new Set(m.text.split('\n').map((l) => l.trim()).filter(Boolean).slice(-12));
      for (const l of tail) seen.set(l, (seen.get(l) || 0) + 1);
    }
    const repeated = (l) => (seen.get(l) || 0) >= Math.max(2, Math.ceil(0.4 * list.length));
    for (const m of list) {
      const lines = m.text.split('\n');
      let start = lines.length;
      while (start > 0 && (!lines[start - 1].trim() || repeated(lines[start - 1].trim()))) start--;
      const block = lines.slice(start).map((l) => l.trim()).filter(Boolean);
      if (block.length < 2) continue;
      // Keep "Best," and the name under it.
      let keep = 0;
      if (SIGN_OFF.test(block[0])) {
        keep = 1;
        if (block[1] && block[1].split(/\s+/).length <= 2 && !/\d|@|https?:|www\.|\|/.test(block[1]) && block.length > 2) keep = 2;
      }
      if (block.length - keep < 2) continue;
      let cut = start;
      for (let k = 0; k < keep; k++) {
        while (!lines[cut].trim()) cut++;
        cut++;
      }
      m.text = lines.slice(0, cut).join('\n').replace(/\s+$/, '');
    }
  }
  return messages;
}

function threadKey(subject) {
  return subject.replace(/^(?:\s*(?:re|fw|fwd|aw|sv|antw)\s*(?:\[\d+\])?\s*:\s*)+/i, '').trim().toLowerCase() || '(no subject)';
}

/**
 * Parse mbox text (read as latin1 to preserve bytes) into messages.
 * Other people's emails become context-only messages.
 */
export function parseMbox(text, { thread = 'email' } = {}) {
  const emails = (looksLikeMbox(text) ? splitMbox(text) : [text.replace(/\r\n?/g, '\n')]).map(parseEmail);
  const messages = [];
  for (const e of emails) {
    const { own, quoted } = splitReply(e.body);
    messages.push({
      ts: e.ts,
      author: e.from,
      text: own,
      quoted,
      thread: `${thread}:${threadKey(e.subject)}`,
      msgId: e.messageId || undefined,
      replyTo: e.inReplyTo || undefined,
      contextOverride: quoted ? quoted.slice(0, 800) : undefined,
      standalone: true,
      globalReplyLookup: true,
    });
  }
  stripRepeatedSignatures(messages);
  messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return messages;
}
