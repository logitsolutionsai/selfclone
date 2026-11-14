import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseWhatsApp, looksLikeWhatsApp } from '../../src/ingest/whatsapp.mjs';
import { parseTelegram } from '../../src/ingest/telegram.mjs';
import { parseSlack, slackText } from '../../src/ingest/slack.mjs';
import { parseTwitter } from '../../src/ingest/twitter.mjs';
import { parseMbox, splitReply, decodeHeader } from '../../src/ingest/mbox.mjs';
import { parsePlain, parseCsv, parseCsvMessages, parseJsonl } from '../../src/ingest/generic.mjs';
import { readZip, writeZip } from '../../src/ingest/zip.mjs';
import { ingest, detectFormat, buildRecords } from '../../src/ingest/index.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-test-'));

test('WhatsApp Android export with 12-hour times, multi-line and system lines', () => {
  const txt = [
    '12/30/23, 9:41 PM - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
    '12/30/23, 9:41 PM - Sam Lee: are you coming tomorrow?',
    '12/30/23, 9:43 PM - Alex Kim: yeah def',
    'bringing snacks',
    '12/30/23, 9:44 PM - Alex Kim: <Media omitted>',
    '12/31/23, 12:05 AM - Sam Lee: This message was deleted',
    '12/31/23, 12:06 AM - Alex Kim: happy new year!! <This message was edited>',
  ].join('\n');
  assert.ok(looksLikeWhatsApp(txt));
  const m = parseWhatsApp(txt);
  assert.equal(m.length, 3);
  assert.deepEqual(m.map((x) => x.author), ['Sam Lee', 'Alex Kim', 'Alex Kim']);
  assert.equal(m[1].text, 'yeah def\nbringing snacks');
  assert.equal(m[1].ts, '2023-12-30T21:43:00Z');
  assert.equal(m[2].text, 'happy new year!!');
  assert.equal(m[2].ts, '2023-12-31T00:06:00Z');
});

test('WhatsApp iOS export with day-first dates, seconds, LRM marks and attachments', () => {
  const lrm = String.fromCharCode(0x200e);
  const txt = [
    `[14/02/2024, 18:02:11] Sam Lee: ${lrm}Messages and calls are end-to-end encrypted.`,
    '[14/02/2024, 18:02:11] Sam Lee: dinner at 8?',
    '[14/02/2024, 18:05:40] Alex Kim: sounds good',
    `[14/02/2024, 18:06:00] Alex Kim: ${lrm}image omitted`,
    `${lrm}[15/02/2024, 09:00:00] Alex Kim: ${lrm}<attached: 00000012-PHOTO-2024-02-15.jpg>`,
  ].join('\n');
  const m = parseWhatsApp(txt);
  assert.deepEqual(m.map((x) => x.text), ['dinner at 8?', 'sounds good']);
  assert.equal(m[0].ts, '2024-02-14T18:02:11Z');
});

test('WhatsApp narrow no-break space before AM/PM is handled', () => {
  const nnbsp = String.fromCharCode(0x202f);
  const txt = `1/2/24, 10:15${nnbsp}AM - Alex: hi there\n1/2/24, 10:16${nnbsp}PM - Sam: hey`;
  const m = parseWhatsApp(txt);
  assert.equal(m.length, 2);
  assert.equal(m[1].ts, '2024-01-02T22:16:00Z');
});

test('Telegram single-chat export with rich text arrays and replies', () => {
  const obj = {
    name: 'Sam',
    type: 'personal_chat',
    id: 1,
    messages: [
      { id: 1, type: 'message', date: '2024-03-01T10:00:00', from: 'Sam', from_id: 'user2', text: 'did you see this' },
      { id: 2, type: 'service', date: '2024-03-01T10:00:01', actor: 'Sam', action: 'pin_message', text: '' },
      { id: 3, type: 'message', date: '2024-03-01T10:01:00', from: 'Alex', from_id: 'user1', text: ['yes ', { type: 'bold', text: 'wild' }, ' stuff'], reply_to_message_id: 1 },
      { id: 4, type: 'message', date: '2024-03-01T10:02:00', from: 'Alex', from_id: 'user1', text: '', photo: 'p.jpg' },
    ],
  };
  const { messages } = parseTelegram(obj);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].text, 'yes wild stuff');
  const { records } = buildRecords([{ format: 'telegram', messages }], { me: ['user1'] });
  assert.equal(records.length, 1);
  assert.equal(records[0].context, 'did you see this');
});

test('Telegram full account export uses personal_information to find the owner', () => {
  const obj = {
    personal_information: { user_id: 99, first_name: 'Alex', last_name: 'Kim' },
    chats: { list: [{ name: 'Sam', id: 5, messages: [
      { id: 1, type: 'message', date: '2024-03-01T10:00:00', from: 'Sam', from_id: 'user7', text: 'yo' },
      { id: 2, type: 'message', date: '2024-03-01T10:00:30', from: 'Alex Kim', from_id: 'user99', text: 'hey hey' },
    ] }] },
  };
  const d = tmp();
  fs.writeFileSync(path.join(d, 'result.json'), JSON.stringify(obj));
  const { records } = ingest([path.join(d, 'result.json')], { me: [] });
  assert.equal(records.length, 1);
  assert.equal(records[0].text, 'hey hey');
  assert.equal(records[0].context, 'yo');
});

test('Slack export folder with users, mentions, links and threads', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'users.json'), JSON.stringify([
    { id: 'U1', name: 'alex', real_name: 'Alex Kim', profile: { display_name: 'alex' } },
    { id: 'U2', name: 'sam', real_name: 'Sam Lee', profile: { display_name: 'Sam' } },
  ]));
  fs.mkdirSync(path.join(d, 'general'));
  fs.writeFileSync(path.join(d, 'general', '2024-04-01.json'), JSON.stringify([
    { type: 'message', subtype: 'channel_join', user: 'U1', text: '<@U1> has joined the channel', ts: '1711965500.000100' },
    { type: 'message', user: 'U2', text: 'can <@U1> review <https://example.com/pr/1|the PR>?', ts: '1711965600.000100' },
    { type: 'message', user: 'U1', text: 'on it &amp; will ping you', ts: '1711965700.000200' },
    { type: 'message', user: 'U2', text: 'thread start', ts: '1711965800.000300', thread_ts: '1711965800.000300' },
    { type: 'message', user: 'U1', text: 'reply in thread', ts: '1711965900.000400', thread_ts: '1711965800.000300' },
  ]));
  const { records, stats } = ingest([d], { me: ['Alex Kim'] });
  assert.equal(stats.slack.mine, 2);
  const main = records.find((r) => r.text.startsWith('on it'));
  assert.equal(main.text, 'on it & will ping you');
  assert.equal(main.context, 'can @alex review https://example.com/pr/1?');
  const th = records.find((r) => r.text === 'reply in thread');
  assert.equal(th.context, 'thread start');
  const users = new Map([['U9', { display: 'Jo' }]]);
  assert.equal(slackText('<!here> <#C1|random> <@U9>', users), '@here #random @Jo');
});

test('Slack export inside a ZIP file', () => {
  const zip = writeZip([
    { path: 'users.json', data: JSON.stringify([{ id: 'U1', name: 'alex', real_name: 'Alex Kim' }, { id: 'U2', name: 'sam' }]) },
    { path: 'random/2024-01-01.json', data: JSON.stringify([
      { type: 'message', user: 'U2', text: 'lunch?', ts: '1704100000.0001' },
      { type: 'message', user: 'U1', text: 'yes please', ts: '1704100060.0001' },
    ]) },
  ]);
  const d = tmp();
  const f = path.join(d, 'export.zip');
  fs.writeFileSync(f, zip);
  assert.equal(readZip(fs.readFileSync(f)).length, 2);
  const { records } = ingest([f], { me: ['alex'] });
  assert.equal(records.length, 1);
  assert.equal(records[0].context, 'lunch?');
});

test('X archive tweets.js: skips retweets, expands links, strips reply mentions, threads to self', () => {
  const data = [
    { tweet: { id_str: '1', full_text: 'shipping a thing today &amp; nervous', created_at: 'Wed Oct 10 20:19:24 +0000 2018', entities: { urls: [] } } },
    { tweet: { id_str: '2', full_text: 'RT @someone: hello', created_at: 'Wed Oct 10 21:00:00 +0000 2018' } },
    { tweet: { id_str: '3', full_text: '@me_handle update: it shipped https://t.co/abc', created_at: 'Wed Oct 10 22:00:00 +0000 2018', in_reply_to_status_id_str: '1', entities: { urls: [{ url: 'https://t.co/abc', expanded_url: 'https://example.com/post' }] } } },
    { tweet: { id_str: '4', full_text: '@bob totally agree', created_at: 'Thu Oct 11 08:00:00 +0000 2018', in_reply_to_status_id_str: '999' } },
  ];
  const js = 'window.YTD.tweets.part0 = ' + JSON.stringify(data);
  assert.equal(detectFormat('data/tweets.js', js), 'x');
  const m = parseTwitter(js, { me: 'alex' });
  assert.deepEqual(m.map((x) => x.text), ['shipping a thing today & nervous', 'update: it shipped https://example.com/post', 'totally agree']);
  assert.equal(m[1].contextOverride, 'shipping a thing today & nervous');
  const { records } = buildRecords([{ format: 'x', messages: m }], { me: [] });
  assert.equal(records.length, 3);
  assert.equal(records.filter((r) => r.context).length, 1);
});

test('mbox: multipart, quoted-printable, base64, encoded headers, quoted context, signature', () => {
  const b64 = Buffer.from('Thanks Sam, Friday works for me.\n\n-- \nAlex\n', 'utf8').toString('base64');
  const mbox = [
    'From sam@example.com Mon Jan  1 10:00:00 2024',
    'From: Sam Lee <sam@example.com>',
    'To: Alex Kim <alex@example.com>',
    'Subject: Meeting',
    'Message-ID: <a1@example.com>',
    'Date: Mon, 1 Jan 2024 10:00:00 +0000',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Can we meet on Friday? Caf=C3=A9 near the office=',
    ' at noon.',
    '',
    'From alex@example.com Mon Jan  1 11:00:00 2024',
    'From: =?UTF-8?B?QWxleCBLaW0=?= <alex@example.com>',
    'To: Sam Lee <sam@example.com>',
    'Subject: Re: Meeting',
    'Message-ID: <a2@example.com>',
    'In-Reply-To: <a1@example.com>',
    'Date: Mon, 1 Jan 2024 11:00:00 +0000',
    'Content-Type: multipart/alternative; boundary="XYZ"',
    '',
    '--XYZ',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '--XYZ',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Thanks Sam</p>',
    '--XYZ--',
    '',
    'From alex@example.com Tue Jan  2 09:00:00 2024',
    'From: Alex Kim <alex@example.com>',
    'Subject: Re: Lunch',
    'Date: Tue, 2 Jan 2024 09:00:00 +0000',
    '',
    'Sounds great, see you there.',
    '',
    'On Mon, 1 Jan 2024 at 18:00, Jo <jo@example.com> wrote:',
    '> Lunch at 1 tomorrow?',
    '',
  ].join('\n');
  assert.equal(decodeHeader('=?UTF-8?B?QWxleCBLaW0=?= <alex@example.com>'), 'Alex Kim <alex@example.com>');
  const msgs = parseMbox(mbox);
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].text, 'Can we meet on Friday? Café near the office at noon.');
  const { records } = buildRecords([{ format: 'mbox', messages: msgs }], { me: ['alex@example.com'] });
  assert.equal(records.length, 2);
  assert.equal(records[0].text, 'Thanks Sam, Friday works for me.');
  assert.equal(records[0].context, 'Can we meet on Friday? Café near the office at noon.');
  assert.equal(records[1].text, 'Sounds great, see you there.');
  assert.equal(records[1].context, 'Lunch at 1 tomorrow?');
});

test('email reply splitting handles Outlook blocks and mobile footers', () => {
  const r = splitReply('Yes, approved.\n\nSent from my iPhone\n\n-----Original Message-----\nFrom: Bo\nSent: Monday\nSubject: x\n\nCan you approve?');
  assert.equal(r.own, 'Yes, approved.');
  assert.match(r.quoted, /Can you approve\?/);
});

test('plain text and markdown notes split into paragraphs', () => {
  const md = '---\ntitle: x\n---\n# Heading\n\nFirst para with a [link](https://x.y).\n\n```js\ncode()\n```\n\n- list item one\n\nSecond **bold** para.';
  const m = parsePlain(md, { markdown: true });
  assert.deepEqual(m.map((x) => x.text), ['Heading', 'First para with a link.', 'list item one', 'Second bold para.']);
  const t = parsePlain('one\n\n\ntwo lines\nhere\n\n  \n');
  assert.deepEqual(t.map((x) => x.text), ['one', 'two lines\nhere']);
});

test('CSV parser handles quotes, commas and newlines; generic rows find author/text fields', () => {
  const rows = parseCsv('a,b\n"x, y","he said ""hi""\nthen left"\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"\nthen left']]);
  const csv = 'timestamp,sender,message\n2024-01-01T10:00:00Z,Sam,"ok, so?"\n2024-01-01T10:01:00Z,Alex,"fine, fine"\n';
  const msgs = parseCsvMessages(csv);
  assert.equal(msgs.length, 2);
  const { records } = buildRecords([{ format: 'csv', messages: msgs }], { me: ['alex'] });
  assert.equal(records[0].context, 'ok, so?');
  const jl = parseJsonl('{"author":"Alex","text":"hi","context":"hello?"}\nnot json\n{"from":"Sam","body":"yo"}\n');
  assert.equal(jl.length, 2);
  assert.equal(jl[0].contextOverride, 'hello?');
});

test('format detection by name and content', () => {
  assert.equal(detectFormat('chat.txt', '1/2/24, 10:15 AM - A: hi\n1/2/24, 10:16 AM - B: yo'), 'whatsapp');
  assert.equal(detectFormat('notes.txt', 'just some notes\n\nmore notes'), 'text');
  assert.equal(detectFormat('result.json', '{"messages":[]}'), 'telegram');
  assert.equal(detectFormat('mail.mbox', 'From x'), 'mbox');
  assert.equal(detectFormat('a.csv', 'x'), 'csv');
  assert.equal(detectFormat('a.jsonl', ''), 'jsonl');
  assert.equal(detectFormat('README.md', '# hi'), 'text');
});

test('ingest groups bursts into turns, scrubs secrets, ignores media files', () => {
  const d = tmp();
  const txt = [
    '1/5/24, 10:00 AM - Sam: what is the wifi password',
    '1/5/24, 10:01 AM - Alex: password: Tr0ub4dor&3',
    '1/5/24, 10:01 AM - Alex: and mail me at alex@example.com',
    '1/5/24, 10:30 AM - Alex: also bring the charger',
    '1/5/24, 11:00 AM - Sam: ok',
  ].join('\n');
  fs.writeFileSync(path.join(d, 'WhatsApp Chat with Sam.txt'), txt);
  fs.writeFileSync(path.join(d, 'IMG-0001.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  const { records, scrubCounts } = ingest([d], { me: ['Alex'] });
  assert.equal(records.length, 3);
  assert.equal(records[0].text, 'password: [PASSWORD]');
  assert.equal(records[1].text, 'and mail me at [EMAIL]');
  assert.equal(records[0].turn, records[1].turn);
  assert.notEqual(records[1].turn, records[2].turn);
  assert.equal(records[0].context, 'what is the wifi password');
  assert.equal(records[1].context, null);
  assert.equal(records[2].context, null, 'a message right after my own has no new context');
  assert.deepEqual(scrubCounts, { PASSWORD: 1, EMAIL: 1 });
  const again = ingest([d, path.join(d, 'WhatsApp Chat with Sam.txt')], { me: ['Alex'] });
  assert.equal(again.records.length, 3, 'the same export ingested twice is de-duplicated');
});
