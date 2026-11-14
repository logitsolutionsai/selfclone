// Regression tests for real-export quirks, run on the fictional Rosa Vidal fixtures
// (tests/fixtures/rosa/make-exports.mjs writes them). Each test names the quirk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingest } from '../../src/ingest/index.mjs';
import { parseWhatsApp } from '../../src/ingest/whatsapp.mjs';
import { parseMbox } from '../../src/ingest/mbox.mjs';
import { parseSlack } from '../../src/ingest/slack.mjs';
import { parseTelegram } from '../../src/ingest/telegram.mjs';
import { buildRecords } from '../../src/ingest/index.mjs';

const EXPORTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'rosa', 'exports');
const ME = ['Rosa Vidal,rosa@vidal-boatworks.example,rosa'];
const all = ingest([EXPORTS], { me: ME });
const bySource = (s) => all.records.filter((r) => r.source === s);
const find = (text) => all.records.find((r) => r.text.startsWith(text));

test('a folder of exports opens the .zip files inside it (WhatsApp, Slack and X zips were skipped)', () => {
  assert.deepEqual(Object.keys(all.stats).sort(), ['mbox', 'slack', 'telegram', 'whatsapp', 'x']);
  assert.ok(bySource('slack').length >= 10);
  assert.ok(bySource('x').length >= 8);
  assert.ok(find('Yes!! 12 knots'), 'the iOS chat inside "WhatsApp Chat - Inês Costa.zip"');
});

test('WhatsApp iOS: lines WhatsApp generates (marked with U+200E) never become messages or context', () => {
  for (const r of all.records) {
    assert.doesNotMatch(r.text, /omitted|This message was deleted|deleted this message|Missed voice call|<attached:/);
    assert.doesNotMatch(r.context || '', /Location: https|omitted|Missed voice call|end-to-end/);
  }
  assert.equal(find('Pronto, I will bring').text, 'Pronto, I will bring the spare life vest', 'edited marker removed');
});

test('WhatsApp Android group: system lines that quote names with ": " are not messages', () => {
  const wa = all.records.filter((r) => r.source === 'whatsapp');
  for (const r of wa) assert.doesNotMatch(r.context || '', /changed the subject|added|Saturdays ⛵"|joined using/);
  assert.equal(find('Bora, 9 at the dock').context, 'I am in as well.', 'reply to the contact saved as "Dr. Okoye: Lab"');
  assert.equal(find('Me! I can bring').context, 'Who is in for Saturday? Wind looks good');
  const msgs = parseWhatsApp('05/03/2026, 13:44 - Dr. Okoye: Lab: I am in.\n05/03/2026, 13:45 - Dr. Okoye: Lab: Coming.\n05/03/2026, 13:46 - Rosa Vidal: ok');
  assert.deepEqual(msgs.map((m) => m.author), ['Dr. Okoye: Lab', 'Dr. Okoye: Lab', 'Rosa Vidal']);
  assert.deepEqual(msgs.map((m) => m.text), ['I am in.', 'Coming.', 'ok']);
});

test('WhatsApp: day-first 12-hour dates where every day is 12 or less are read in time order', () => {
  // "03/02/2026, 9:15 pm" is 3 February: read month-first, the chat would jump Mar -> May -> Nov -> Feb.
  assert.equal(find('Yes! I already have the tickets').ts, '2026-02-03T21:18:00Z');
  assert.equal(find('The best one in years').ts, '2026-03-02T09:41:00Z');
  const us = parseWhatsApp('1/2/26, 9:15 PM - Sam: a\n1/3/26, 9:16 PM - Rosa: b\n1/4/26, 9:17 PM - Sam: c');
  assert.equal(us[0].ts, '2026-01-02T21:15:00Z', 'month-first files that step through days stay month-first');
});

test('WhatsApp Android: a caption under an attachment line keeps only the caption', () => {
  assert.equal(find('Ok yes - the transom').context, 'Here you go. The transom is the worst part.');
});

test('--me matches a whole value that contains a comma ("Vidal, Rosa")', () => {
  const msgs = parseWhatsApp('1/14/26, 9:00 PM - Sam: hi there\n1/14/26, 9:01 PM - Vidal, Rosa: hello Sam');
  const { records } = buildRecords([{ format: 'whatsapp', messages: msgs }], { me: ['Vidal, Rosa'] });
  assert.equal(records.length, 1);
  assert.equal(records[0].context, 'hi there');
});

test('Telegram: forwarded messages are not the user\'s writing; explicit replies get their target', () => {
  for (const r of bySource('telegram')) assert.doesNotMatch(r.text, /NOTICE|patience and thin coats/);
  assert.equal(find('Ofc, it is on the shelf').context, 'Can I borrow your heat gun this week?');
  assert.equal(find('Just read it').context, 'Did you see this article about wooden boats?', 'text_link entity flattened');
  const { messages } = parseTelegram({ name: 'M', messages: [
    { id: 1, type: 'message', date: '2026-01-01T10:00:00', from: 'M', from_id: 'user2', text: 'look' },
    { id: 2, type: 'message', date: '2026-01-01T10:01:00', from: 'R', from_id: 'user1', forwarded_from: 'News', text: 'Forwarded words' },
    { id: 3, type: 'message', date: '2026-01-01T10:02:00', from: 'R', from_id: 'user1', text: 'my comment on it' },
  ] });
  const { records } = buildRecords([{ format: 'telegram', messages }], { me: ['user1'] });
  assert.deepEqual(records.map((r) => [r.text, r.context]), [['my comment on it', 'M: look\nR: Forwarded words']]);
});

test('Slack: bots, app users and huddles are skipped; emoji shortcodes become emoji', () => {
  for (const r of bySource('slack')) {
    assert.doesNotMatch(r.context || '', /High tide|Reminder: committee|huddle/);
    assert.doesNotMatch(r.text, /:[a-z_]+:/);
  }
  assert.equal(find('I can 🙌').text, 'I can 🙌 but only from 10');
  assert.equal(find('And coffee').text, 'And coffee, obviously ☕');
  assert.match(find('Taster sails yes').context, /^Clara: Ideas for the spring open day/);
});

test('Slack: large exports with many threads parse in linear time', () => {
  const msgs = [];
  let ts = 1700000000;
  for (let i = 0; i < 20000; i++) {
    const p = (ts += 10).toFixed(6);
    msgs.push({ type: 'message', user: 'U2', text: 'q', ts: p, thread_ts: p });
    msgs.push({ type: 'message', user: 'U1', text: 'a', ts: (ts += 1).toFixed(6), thread_ts: p });
  }
  const entries = [
    { path: 'users.json', read: () => Buffer.from('[{"id":"U1","name":"a"},{"id":"U2","name":"b"}]') },
    { path: 'c/2026-01-01.json', read: () => Buffer.from(JSON.stringify(msgs)) },
  ];
  const t = Date.now();
  assert.equal(parseSlack(entries).messages.length, 60000);
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t} ms`);
});

test('X archive: retweets and likes are not the owner\'s words; a self-thread gets a cleaned context', () => {
  const x = bySource('x');
  for (const r of x) assert.doesNotMatch(r.text, /^RT @|Liked tweet|Entries for the spring regatta/);
  assert.equal(find('Update: new transom').context, 'Restoring a 1970s dinghy this month - the transom was basically sponge');
  assert.equal(find('ahah yes, the knot table').context, null, 'replies to other people have no context in the archive');
  assert.equal(find('Epoxy is not magic').text, 'Epoxy is not magic. Good wood and patience are https://example.org/wooden-boats');
});

test('mbox: quoted replies, attributions in other languages, signatures and footers are removed', () => {
  const mail = bySource('mbox');
  for (const r of mail) {
    assert.doesNotMatch(r.text, /Vidal Boatworks|www\.vidal|\[PHONE\]|escreveu|escribió|wrote:|Enviado do meu|^>/m, r.text);
  }
  assert.equal(find('Yes!! I will bring the photos').text, 'Yes!! I will bring the photos and a bottle of vinho verde.\n\nBest,\nRosa', 'sign-off kept, signature dropped');
  assert.equal(find('Five thin coats').text, 'Five thin coats, and sand lightly between each one - the sun eats anything thinner.');
  assert.equal(find('Five thin coats').context, 'Hola Rosa, how many coats of varnish for a deck that gets a lot of sun?');
});

test('mbox: a body line starting with "From " is not a new mail, and mboxrd ">From " is unescaped', () => {
  const r = find('Hi,\n\nFrom my side');
  assert.ok(r, 'the reply to the marina keeps its first line');
  assert.equal(r.context, 'Dear Ms Vidal,\n\nPlease confirm the mooring fees for March: 320 EUR for berth C14.\n\nKind regards,\nMarina Office');
  assert.match(find('Hi Dan,').context, /\nFrom what you said it is about 1400 euros\./);
});

test('mbox: HTML-only mail decodes numeric entities and ignores line breaks in the HTML source', () => {
  const r = find('Hi all,');
  assert.equal(r.text, 'Hi all,\n\nSunday\'s lessons are on – beginners at 10 and the kids at 2. It’s going to be windy so bring layers & a hat.\n\nBest,\nRosa');
});

test('mbox: signatures are stripped only when they repeat; a one-off closing stays', () => {
  const box = [
    'From a@x Mon Jan  5 10:00:00 2026', 'From: Ann <a@x.org>', 'Subject: one', 'Date: Mon, 5 Jan 2026 10:00:00 +0000', '', 'First mail.', '', 'Cheers,', 'Ann', '', 'Ann Lee', 'Head of Sails, Example Co', '',
    'From a@x Tue Jan  6 10:00:00 2026', 'From: Ann <a@x.org>', 'Subject: two', 'Date: Tue, 6 Jan 2026 10:00:00 +0000', '', 'Second mail.', '', 'Cheers,', 'Ann', '', 'Ann Lee', 'Head of Sails, Example Co', '',
    'From a@x Wed Jan  7 10:00:00 2026', 'From: Ann <a@x.org>', 'Subject: three', 'Date: Wed, 7 Jan 2026 10:00:00 +0000', '', 'Third mail, see you at the', 'regatta tomorrow.', '',
  ].join('\n');
  const msgs = parseMbox(box);
  assert.deepEqual(msgs.map((m) => m.text), ['First mail.\n\nCheers,\nAnn', 'Second mail.\n\nCheers,\nAnn', 'Third mail, see you at the\nregatta tomorrow.']);
});

test('files macOS adds when zipping (__MACOSX/, ._*) are not read as notes', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { writeZip } = await import('../../src/ingest/zip.mjs');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-mac-'));
  const chat = '[06/01/2026, 13:10:24] Sam: are you coming\n[06/01/2026, 13:11:00] Rosa Vidal: yes on my way now\n';
  const appleDouble = Buffer.concat([Buffer.from([0, 5, 22, 7, 0, 2, 0, 0]), Buffer.from('Mac OS X        some resource fork text here')]);
  fs.writeFileSync(path.join(d, 'chat.zip'), writeZip([{ path: '_chat.txt', data: chat }, { path: '__MACOSX/._chat.txt', data: appleDouble }, { path: '.DS_Store', data: appleDouble }]));
  const r = ingest([path.join(d, 'chat.zip')], { me: ['Rosa Vidal'] });
  assert.deepEqual(Object.keys(r.stats), ['whatsapp']);
  assert.deepEqual(r.records.map((x) => x.text), ['yes on my way now']);
});

test('--format on a folder names the file it could not read', () => {
  assert.throws(() => ingest([EXPORTS], { me: ME, format: 'x' }), /Could not read ".*" as x: .*pass the export file itself/);
});

test('WhatsApp: a contact saved with quotes in the name keeps their messages', () => {
  const msgs = parseWhatsApp([
    '05/03/2026, 13:40 - Bob "Builder" Smith: can we fix it',
    '05/03/2026, 13:41 - Rosa Vidal: yes we can, bring the sander',
    '05/03/2026, 13:42 - Bob "Builder" Smith: on my way',
    '05/03/2026, 13:43 - Bob "Builder" Smith changed the subject from "Fix: it" to "Fix: done"',
  ].join('\n'));
  assert.deepEqual(msgs.map((m) => m.author), ['Bob "Builder" Smith', 'Rosa Vidal', 'Bob "Builder" Smith']);
});
