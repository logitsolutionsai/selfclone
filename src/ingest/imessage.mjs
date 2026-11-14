// iMessage: the TXT output of the open-source imessage-exporter tool
// (`imessage-exporter -f txt`), one file per conversation. Each message is
//
//   May 17, 2022  5:29:42 PM (Read by them after 1 hour, 49 seconds)
//   Me
//   Hello world
//   <blank line>
//
// Your own messages are written by "Me". Replies shown in place under their
// parent are indented by four spaces.

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const STAMP = /^((?: {4})*)([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) {1,2}(\d{1,2}):(\d{2}):(\d{2}) ([AP]M)(?: \(.*\))?\s*$/;

export function looksLikeIMessage(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  return lines.length >= 3 && STAMP.test(lines[0]) && lines.filter((l) => STAMP.test(l)).length >= 1;
}

function stampIso(m) {
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon == null) return null;
  let h = Number(m[5]) % 12;
  if (m[8] === 'PM') h += 12;
  const d = new Date(Date.UTC(Number(m[4]), mon, Number(m[3]), h, Number(m[6]), Number(m[7])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace('.000Z', 'Z');
}

// Lines the exporter writes itself rather than the sender.
const SKIP_LINE = [
  /^This message was deleted from the conversation!$/,
  /^Sent with (?:Confetti|Balloons|Echo|Fireworks|Lasers|Love|Celebration|Spotlight|Shooting Star|Gentle|Loud|Slam|Invisible Ink)$/,
  /^(?:Started|Stopped) sharing location!$/,
  /^(?:SharePlay Message|FaceTime|Ended|Call Ended)$/,
  /^Attachment missing!$/,
  /^(?:~|\/|[A-Za-z]:\\).*\.(?:jpe?g|png|heic|gif|mov|mp4|m4a|caf|pdf|vcf|webp|svg|pluginPayloadAttachment)$/i,
  /^[\w./ -]*attachments\/.*$/i,
  /^Translated from:$/,
];

export function parseIMessage(text, { thread = 'imessage' } = {}) {
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const messages = [];
  let cur = null;
  let indent = '';
  let skipBlock = false;
  const flush = () => {
    if (!cur) return;
    while (cur.body.length && !cur.body[cur.body.length - 1].trim()) cur.body.pop();
    const body = cur.body.join('\n').trim();
    if (body && cur.author) {
      const me = cur.author === 'Me';
      messages.push({ ts: cur.ts, author: me ? 'Me' : cur.author, self: me || undefined, text: body, thread });
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(STAMP);
    // A stamp starts a message at the top of the file or after a blank line, and is followed by a sender line.
    if (m && (i === 0 || !lines[i - 1].trim()) && lines[i + 1] != null && lines[i + 1].trim()) {
      flush();
      indent = m[1];
      cur = { ts: stampIso(m), author: lines[i + 1].slice(indent.length).trim(), body: [] };
      i++;
      skipBlock = false;
      continue;
    }
    if (!cur) continue;
    const l = line.startsWith(indent) ? line.slice(indent.length) : line.trimStart();
    if (/^(?:Tapbacks|Reactions):$/.test(l.trim())) {
      skipBlock = true; // the tapback list under a message: "Loved by Me", one per line
      continue;
    }
    if (skipBlock) {
      if (!l.trim()) skipBlock = false;
      continue;
    }
    if (/^Edited .{1,40} later: /.test(l)) {
      cur.body.push(l.replace(/^Edited .{1,40} later: /, ''));
      continue;
    }
    if (SKIP_LINE.some((re) => re.test(l.trim()))) {
      // "Translated from:" is followed by the original text: keep only the original, which is what was typed.
      if (/^Translated from:$/.test(l.trim())) cur.body = [];
      continue;
    }
    cur.body.push(l);
  }
  flush();
  return messages;
}
