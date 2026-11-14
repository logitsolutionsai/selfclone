// Discord, Instagram, Messenger, LinkedIn, iMessage, Reddit, Google Chat, Word and blog exports.
// Every fixture is synthetic: Maya Okafor, Theo Lindqvist, Priya Raman and the rest are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeZip } from '../../src/ingest/zip.mjs';
import { ingest, detectFormat, FORMATS } from '../../src/ingest/index.mjs';
import { fixMojibake } from '../../src/ingest/meta.mjs';
import { parseIMessage } from '../../src/ingest/imessage.mjs';
import { docxParagraphs } from '../../src/ingest/docx.mjs';
import { parseFeed, parseHtmlPage } from '../../src/ingest/blog.mjs';
import { googleChatDate } from '../../src/ingest/googlechat.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-more-'));
const put = (root, rel, data) => {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  return p;
};
// Zip a folder tree given as {relativePath: content}.
const zipOf = (files) => writeZip(Object.entries(files).map(([p, data]) => ({ path: p, data })));
const texts = (records) => records.map((r) => r.text);

// Meta writes each UTF-8 byte of a non-ASCII character as its own \u00XX escape.
const BS = String.fromCharCode(92);
const HIGH = new RegExp('[' + String.fromCharCode(0x80) + '-' + String.fromCharCode(0xff) + ']', 'g');
function metaJson(obj) {
  const moji = JSON.parse(JSON.stringify(obj), (k, v) => (typeof v === 'string' ? Buffer.from(v, 'utf8').toString('latin1') : v));
  return JSON.stringify(moji, null, 2).replace(HIGH, (c) => BS + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

test('new format names are listed for --format', () => {
  for (const f of ['discord', 'instagram', 'messenger', 'linkedin', 'imessage', 'reddit', 'googlechat', 'docx', 'blog']) assert.ok(FORMATS.includes(f), f);
});

// ---------- Discord ----------

function discordExporter() {
  const author = (id, name, nickname, isBot = false) => ({ id, name, discriminator: '0000', nickname, isBot });
  const theo = author('100', 'theo.l', 'Theo');
  const maya = author('200', 'maya.ok', 'Maya');
  const bot = author('300', 'KilnBot', 'KilnBot', true);
  return {
    guild: { id: '1', name: 'Riverside Makers' },
    channel: { id: '10', type: 'GuildTextChat', category: 'Studio', name: 'kiln-room' },
    messages: [
      { id: 'm1', type: 'GuildMemberJoin', timestamp: '2026-05-01T09:00:00+00:00', content: '', author: theo },
      { id: 'm2', type: 'Default', timestamp: '2026-05-01T09:01:00+00:00', content: 'Is the big kiln free on Thursday?', author: theo },
      { id: 'm3', type: 'Reply', timestamp: '2026-05-01T09:03:00+00:00', content: 'yes after 2, i booked the morning', author: maya, reference: { messageId: 'm2' } },
      { id: 'm4', type: 'Default', timestamp: '2026-05-01T09:04:00+00:00', content: 'Reminder: kiln log due', author: bot },
      { id: 'm5', type: 'Default', timestamp: '2026-05-01T10:00:00+00:00', content: 'Can you send me the glaze recipe?', author: theo },
      { id: 'm6', type: 'Default', timestamp: '2026-05-01T10:02:00+00:00', content: 'mail me at maya.okafor@example.com and ill send it', author: maya },
      { id: 'm7', type: 'Default', timestamp: '2026-05-01T10:05:00+00:00', content: '', author: maya, attachments: [{ url: 'x.png' }] },
      { id: 'm8', type: 'Default', timestamp: '2026-05-01T10:06:00+00:00', content: 'Thanks, got it.', author: theo },
    ],
  };
}

test('Discord: DiscordChatExporter JSON in a folder and a zip, with replies, bots, joins and scrubbing', () => {
  const d = tmp();
  const json = JSON.stringify(discordExporter());
  put(d, 'Riverside Makers - Studio - kiln-room [10].json', json);
  assert.equal(detectFormat('Riverside Makers - kiln-room [10].json', json), 'discord');
  const { records, scrubCounts, stats } = ingest([d], { me: ['maya.ok'] });
  assert.deepEqual(texts(records), ['yes after 2, i booked the morning', 'mail me at [EMAIL] and ill send it']);
  assert.ok(records.every((r) => r.source === 'discord' && r.id.startsWith('dc-')));
  assert.equal(records[0].context, 'Is the big kiln free on Thursday?', 'the reply target is the context');
  assert.equal(records[1].context, 'Can you send me the glaze recipe?');
  assert.equal(scrubCounts.EMAIL, 1);
  assert.equal(stats.discord.others, 3, 'Theo three times; the bot and the join notice are skipped');
  assert.ok(records.every((r) => !/Thanks, got it|Reminder/.test(r.text)), 'other authors are never the user');
  // the nickname and the user id work as --me too, and a zip is opened
  const z = path.join(tmp(), 'discord.zip');
  fs.writeFileSync(z, zipOf({ 'exports/kiln-room.json': json }));
  assert.equal(ingest([z], { me: ['Maya'] }).records.length, 2);
  assert.equal(ingest([z], { me: ['200'] }).records.length, 2);
  assert.equal(ingest([z], { me: ['Theo'] }).records.length, 3);
});

test('Discord: the data package (messages.json and messages.csv per channel) holds only your messages', () => {
  const d = tmp();
  put(d, 'package/Messages/index.json', JSON.stringify({ 111: 'Direct Message with theo.l', 222: 'kiln-room in Riverside Makers' }));
  put(d, 'package/Messages/c111/channel.json', JSON.stringify({ id: '111', type: 'DM', recipients: ['200', '100'] }));
  put(d, 'package/Messages/c111/messages.json', JSON.stringify([
    { ID: 5, Timestamp: '2026-05-02 08:00:00', Contents: 'running late, 10 mins', Attachments: '' },
    { ID: 6, Timestamp: '2026-05-02 08:01:00', Contents: '', Attachments: 'https://cdn.example/a.png' },
    { ID: 7, Timestamp: '2026-05-02 08:02:00', Contents: 'door code is 4521, pin: 4521', Attachments: '' },
  ]));
  put(d, 'package/Messages/c222/channel.json', JSON.stringify({ id: '222', type: 'GUILD_TEXT', name: 'kiln-room', guild: { id: '1', name: 'Riverside Makers' } }));
  put(d, 'package/Messages/c222/messages.csv', 'ID,Timestamp,Contents,Attachments\n9,2026-05-03 12:00:00.123000+00:00,"glaze day, who is in",\n');
  put(d, 'package/Account/user.json', JSON.stringify({ id: '200', username: 'maya.ok' }));
  const { records } = ingest([d], { me: [] });
  assert.deepEqual(texts(records).sort(), ['door code is [PASSWORD], pin: [PASSWORD]', 'glaze day, who is in', 'running late, 10 mins'].sort());
  assert.ok(records.every((r) => r.source === 'discord' && r.context === null), 'no context: the package has nobody else in it');
  assert.ok(records.some((r) => r.thread === 'discord:Riverside Makers/kiln-room'));
  assert.ok(records.some((r) => r.thread === 'discord:Direct Message with theo.l'), 'index.json names a DM without a channel name');
  assert.equal(records.find((r) => r.text.startsWith('glaze')).ts, '2026-05-03T12:00:00Z');
  // one messages.json on its own is detected too
  const one = ingest([path.join(d, 'package', 'Messages', 'c111', 'messages.json')], { me: [] });
  assert.equal(one.records.length, 2);
  // and the package inside a zip
  const z = path.join(tmp(), 'package.zip');
  fs.writeFileSync(z, zipOf({ 'Messages/c222/messages.csv': 'ID,Timestamp,Contents,Attachments\n9,2026-05-03 12:00:00,hello there,\n' }));
  assert.deepEqual(texts(ingest([z], { me: [] }).records), ['hello there']);
});

// ---------- Instagram and Messenger ----------

function instagramThread() {
  // newest first, as Meta writes it
  return {
    participants: [{ name: 'Maya Okafor' }, { name: 'Théo Lindqvist' }],
    messages: [
      { sender_name: 'Théo Lindqvist', timestamp_ms: Date.UTC(2026, 4, 3, 9, 10), content: 'Reacted 😂 to your message' },
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 4, 3, 9, 6), content: 'Maya Okafor sent an attachment.' },
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 4, 3, 9, 5), content: 'ok café at 4, my email is maya@example.org 😂' },
      { sender_name: 'Théo Lindqvist', timestamp_ms: Date.UTC(2026, 4, 3, 9, 0), content: 'Coffee later? The café on Rua Augusta is open.' },
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 4, 2, 9, 0), content: 'Maya Okafor unsent a message' },
    ],
    title: 'Théo Lindqvist',
    thread_path: 'inbox/theolindqvist_123',
  };
}

test('Instagram: Meta JSON with mojibake, newest first, system lines skipped, other people excluded', () => {
  const raw = metaJson(instagramThread());
  assert.ok(raw.includes(BS + 'u00c3' + BS + 'u00a9'), 'the fixture has the escaped UTF-8 bytes Meta writes');
  const d = tmp();
  put(d, 'instagram-maya-2026-05-10/your_instagram_activity/messages/inbox/theolindqvist_123/message_1.json', raw);
  const { records, stats, authors } = ingest([d], { me: ['Maya Okafor'] });
  assert.deepEqual(texts(records), ['ok café at 4, my email is [EMAIL] 😂']);
  assert.equal(records[0].source, 'instagram');
  assert.ok(records[0].id.startsWith('ig-'));
  assert.equal(records[0].context, 'Coffee later? The café on Rua Augusta is open.');
  assert.equal(stats.instagram.others, 1, 'the reaction line is skipped, the real message counts');
  assert.ok(authors.some(([a]) => a === 'Théo Lindqvist'), 'names are decoded too');
  // --me matches the decoded name, never the other participant
  assert.equal(ingest([d], { me: ['Théo Lindqvist'] }).records[0].text, 'Coffee later? The café on Rua Augusta is open.');
  // a zip of the export works
  const z = path.join(tmp(), 'instagram.zip');
  fs.writeFileSync(z, zipOf({ 'your_instagram_activity/messages/inbox/theolindqvist_123/message_1.json': raw }));
  assert.equal(ingest([z], { me: ['Maya Okafor'] }).records.length, 1);
});

test('Meta mojibake: decoded only when the bytes are valid UTF-8', () => {
  const moji = Buffer.from('ação 🙏 naïve', 'utf8').toString('latin1');
  assert.equal(fixMojibake(moji), 'ação 🙏 naïve');
  assert.equal(fixMojibake('plain ascii'), 'plain ascii');
  assert.equal(fixMojibake('Ç' + 'a va'), 'Ça va', 'real Latin-1 text that is not valid UTF-8 stays');
  assert.equal(fixMojibake('already 🙏 fine'), 'already 🙏 fine');
});

test('Messenger: Facebook layout, several message files per thread, calls and shares skipped', () => {
  const d = tmp();
  const base = 'facebook-mayaokafor/your_facebook_activity/messages/inbox/priyaraman_456';
  const part2 = {
    participants: [{ name: 'Priya Raman' }, { name: 'Maya Okafor' }],
    messages: [
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 3, 1, 10, 2), content: 'yes!! i can do saturday', is_geoblocked_for_viewer: false },
      { sender_name: 'Priya Raman', timestamp_ms: Date.UTC(2026, 3, 1, 10, 0), content: 'Can you cover the shop on Saturday?', is_geoblocked_for_viewer: false },
    ],
    thread_path: 'inbox/priyaraman_456',
  };
  const part1 = {
    participants: part2.participants,
    messages: [
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 3, 2, 18, 0), content: 'Maya missed a call.', call_duration: 0 },
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 3, 2, 17, 0), content: 'https://example.com/kiln', share: { link: 'https://example.com/kiln' } },
      { sender_name: 'Priya Raman', timestamp_ms: Date.UTC(2026, 3, 2, 16, 0), content: 'The new kiln came today' },
      { sender_name: 'Maya Okafor', timestamp_ms: Date.UTC(2026, 3, 2, 16, 5), content: 'omg finally, photos pls' },
    ],
    thread_path: 'inbox/priyaraman_456',
  };
  put(d, `${base}/message_1.json`, metaJson(part1));
  put(d, `${base}/message_2.json`, metaJson(part2));
  const { records } = ingest([d], { me: ['Maya Okafor'] });
  assert.deepEqual(texts(records), ['yes!! i can do saturday', 'omg finally, photos pls']);
  assert.ok(records.every((r) => r.source === 'messenger' && r.id.startsWith('fb-')));
  assert.equal(records[1].context, 'The new kiln came today');
  assert.equal(new Set(records.map((r) => r.thread)).size, 1, 'both files are one conversation');
  // --format instagram forces the label when a folder name says nothing
  const loose = tmp();
  put(loose, 'inbox/x/message_1.json', metaJson(part2));
  assert.equal(ingest([loose], { me: ['Maya Okafor'], format: 'instagram' }).records[0].source, 'instagram');
});

// ---------- LinkedIn ----------

test('LinkedIn: messages.csv with HTML content, newest first, only your rows', () => {
  const csv = [
    'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER',
    '2-abc,,Maya Okafor,https://www.linkedin.com/in/maya-example,Sam Recruiter,https://www.linkedin.com/in/sam-example,2026-05-04 10:05:00 UTC,,"<p>thanks Sam, not looking right now</p><p>happy to chat in the autumn tho</p>",INBOX',
    '2-abc,,Sam Recruiter,https://www.linkedin.com/in/sam-example,Maya Okafor,https://www.linkedin.com/in/maya-example,2026-05-04 10:00:00 UTC,Studio lead role,"Hi Maya, would you consider a studio lead role? Call me on +44 20 7946 0958.",INBOX',
    '2-def,,Maya Okafor,https://www.linkedin.com/in/maya-example,Lee Example,,2026-05-05 09:00:00 UTC,,congrats on the show &amp; the new space,INBOX',
    '2-def,,Lee Example,,Maya Okafor,,2026-05-05 08:00:00 UTC,,We opened the new space!,INBOX',
  ].join('\n');
  assert.equal(detectFormat('messages.csv', csv), 'linkedin');
  const d = tmp();
  put(d, 'Basic_LinkedInDataExport_05-10-2026/messages.csv', csv);
  const { records } = ingest([d], { me: ['Maya Okafor'] });
  assert.deepEqual(texts(records), ['thanks Sam, not looking right now\n\nhappy to chat in the autumn tho', 'congrats on the show & the new space']);
  assert.ok(records.every((r) => r.source === 'linkedin' && r.id.startsWith('li-')));
  assert.equal(records[0].context, 'Hi Maya, would you consider a studio lead role? Call me on [PHONE].', 'context is scrubbed too');
  assert.equal(records[1].context, 'We opened the new space!');
  assert.equal(ingest([d], { me: ['https://www.linkedin.com/in/maya-example'] }).records.length, 2, 'the profile URL works as --me');
  const z = path.join(tmp(), 'linkedin.zip');
  fs.writeFileSync(z, zipOf({ 'messages.csv': csv }));
  assert.equal(ingest([z], { me: ['Maya Okafor'] }).records.length, 2);
});

// ---------- iMessage ----------

const IMESSAGE = [
  'May 17, 2026  5:29:42 PM',
  'Theo Lindqvist',
  'Are you bringing the clay tomorrow?',
  '',
  'May 17, 2026  5:31:02 PM (Read by them after 1 minute, 3 seconds)',
  'Me',
  'yes 10kg of the red one',
  'and the wire tool',
  '',
  'May 17, 2026  5:31:40 PM',
  'Me',
  '/Users/maya/Library/Messages/Attachments/ab/12/IMG_0042.heic',
  '',
  'May 17, 2026  5:40:00 PM (Read by you after 2 minutes)',
  'Theo Lindqvist',
  'Great. The wifi password is kilnroom2026',
  '',
  'May 18, 2026  9:00:00 AM',
  'Me',
  'This message was deleted from the conversation!',
  'here, my email is maya@example.net',
  'Tapbacks:',
  '    Loved by Theo Lindqvist',
  '',
].join('\n');

test('iMessage: imessage-exporter TXT with read receipts, attachments, tapbacks and multi-line messages', () => {
  const m = parseIMessage(IMESSAGE);
  assert.deepEqual(m.map((x) => x.author), ['Theo Lindqvist', 'Me', 'Theo Lindqvist', 'Me']);
  assert.equal(m[1].text, 'yes 10kg of the red one\nand the wire tool');
  assert.equal(m[1].ts, '2026-05-17T17:31:02Z');
  assert.equal(m[3].text, 'here, my email is maya@example.net', 'deleted notice and tapbacks are not text');
  assert.equal(detectFormat('Theo Lindqvist.txt', IMESSAGE), 'imessage');
  const d = tmp();
  put(d, 'imessage_export/Theo Lindqvist.txt', IMESSAGE);
  const { records } = ingest([d], { me: [] });
  assert.deepEqual(texts(records), ['yes 10kg of the red one\nand the wire tool', 'here, my email is [EMAIL]']);
  assert.ok(records.every((r) => r.source === 'imessage' && r.id.startsWith('im-')));
  assert.equal(records[0].context, 'Are you bringing the clay tomorrow?');
  assert.equal(records[1].context, 'Great. The wifi password is [PASSWORD]');
  const z = path.join(tmp(), 'imessage.zip');
  fs.writeFileSync(z, zipOf({ 'export/Theo Lindqvist.txt': IMESSAGE }));
  assert.equal(ingest([z], { me: [] }).records.length, 2, '"Me" is always the user; Theo never is');
});

// ---------- Reddit ----------

test('Reddit: comments.csv and posts.csv; a comment gets its parent as context only when the parent is yours', () => {
  const posts = [
    'id,permalink,date,ip,subreddit,gildings,title,url,body',
    'p1,https://www.reddit.com/r/Pottery/comments/p1/x/,2026-04-01 10:00:00 UTC,0.0.0.0,Pottery,0,First wood firing,,"so we finally did it, 30 hours of stoking"',
    'p2,https://www.reddit.com/r/Pottery/comments/p2/y/,2026-04-02 10:00:00 UTC,0.0.0.0,Pottery,0,[removed],,[removed]',
  ].join('\n');
  const comments = [
    'id,permalink,date,ip,subreddit,gildings,link,parent,body,media',
    'c1,https://www.reddit.com/r/Pottery/comments/p1/x/c1/,2026-04-01 12:00:00 UTC,0.0.0.0,Pottery,0,https://www.reddit.com/r/Pottery/comments/p1/,t3_p1,"edit: the ash glaze on the back shelf came out best, dm me at maya@example.com",',
    'c2,https://www.reddit.com/r/Pottery/comments/zz/q/c2/,2026-04-03 12:00:00 UTC,0.0.0.0,Pottery,0,https://www.reddit.com/r/Pottery/comments/zz/,t1_notmine,"&gt; is cone 6 enough\n\nhonestly yes for most functional ware",',
    'c3,https://www.reddit.com/r/Pottery/comments/zz/q/c3/,2026-04-04 12:00:00 UTC,0.0.0.0,Pottery,0,https://www.reddit.com/r/Pottery/comments/zz/,t1_c2,[deleted],',
  ].join('\n');
  assert.equal(detectFormat('comments.csv', comments), 'reddit');
  assert.equal(detectFormat('posts.csv', posts), 'reddit');
  const d = tmp();
  put(d, 'export_maya/comments.csv', comments);
  put(d, 'export_maya/posts.csv', posts);
  const { records } = ingest([d], { me: [] });
  assert.deepEqual(texts(records), [
    'First wood firing\n\nso we finally did it, 30 hours of stoking',
    'edit: the ash glaze on the back shelf came out best, dm me at [EMAIL]',
    'honestly yes for most functional ware',
  ]);
  assert.ok(records.every((r) => r.source === 'reddit' && r.id.startsWith('rd-')));
  assert.equal(records[1].context, 'First wood firing\n\nso we finally did it, 30 hours of stoking', 'the parent is their own post');
  assert.equal(records[2].context, null, 'the parent is someone else, not in the export');
  assert.ok(!records[2].text.includes('cone 6'), 'quoted text is not their writing');
  const z = path.join(tmp(), 'reddit.zip');
  fs.writeFileSync(z, zipOf({ 'comments.csv': comments, 'posts.csv': posts }));
  assert.equal(ingest([z], { me: [] }).records[1].context.startsWith('First wood firing'), true);
});

// ---------- Google Chat ----------

test('Google Chat: Takeout messages.json, group_info.json and user_info.json', () => {
  const d = tmp();
  const g = 'Takeout/Google Chat/Groups/DM 7y2Aa';
  put(d, `${g}/group_info.json`, JSON.stringify({ members: [{ name: 'Maya Okafor', email: 'maya@example.com' }, { name: 'Priya Raman', email: 'priya@example.com' }] }));
  put(d, `${g}/messages.json`, JSON.stringify({
    messages: [
      { creator: { name: 'Priya Raman', email: 'priya@example.com', user_type: 'Human' }, created_date: 'Tuesday, March 10, 2026 at 9:00:00 AM UTC', text: 'Did the glaze order arrive?' },
      { creator: { name: 'Maya Okafor', email: 'maya@example.com', user_type: 'Human' }, created_date: 'Tuesday, March 10, 2026 at 9:02:30 AM UTC', text: 'yes!! unpacking now, card ending 4242 was charged' },
      { creator: { name: 'Studio Bot', email: 'bot@example.com', user_type: 'Bot' }, created_date: 'Tuesday, March 10, 2026 at 9:03:00 AM UTC', text: 'Order delivered' },
      { creator: { name: 'Priya Raman', email: 'priya@example.com', user_type: 'Human' }, created_date: 'Wednesday 11 March 2026 at 10:15:30 UTC', text: 'Great, thanks' },
    ],
  }));
  put(d, 'Takeout/Google Chat/Users/User 1234/user_info.json', JSON.stringify({ user: { name: 'Maya Okafor', email: 'maya@example.com', user_type: 'Human' } }));
  const { records, stats } = ingest([d], { me: [] });
  assert.deepEqual(texts(records), ['yes!! unpacking now, card ending 4242 was charged'], 'user_info.json names the owner, so --me can be left out');
  assert.equal(records[0].source, 'googlechat');
  assert.ok(records[0].id.startsWith('gch-'));
  assert.equal(records[0].ts, '2026-03-10T09:02:30Z');
  assert.equal(records[0].context, 'Did the glaze order arrive?');
  assert.equal(stats.googlechat.others, 2, 'the bot is skipped');
  assert.equal(googleChatDate('Wednesday 11 March 2026 at 10:15:30 UTC'), '2026-03-11T10:15:30Z');
  assert.equal(ingest([d], { me: ['priya@example.com'] }).records.length, 3, 'with --me, Priya is matched by email too (and Maya by user_info)');
  const z = path.join(tmp(), 'takeout.zip');
  fs.writeFileSync(z, zipOf({ [`${g}/messages.json`]: fs.readFileSync(path.join(d, ...`${g}/messages.json`.split('/'))) }));
  assert.equal(ingest([z], { me: ['Maya Okafor'] }).records.length, 1);
});

// ---------- Word ----------

function docx(paragraphXml) {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphXml}</w:body></w:document>`;
  return zipOf({ '[Content_Types].xml': '<Types/>', 'word/document.xml': xml, 'docProps/core.xml': '<cp/>' });
}

test('Word .docx: paragraphs from document.xml, headings and deleted text left out, entities decoded', () => {
  const body = [
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Studio Notes</w:t></w:r></w:p>',
    '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t xml:space="preserve">Clay &amp; glaze </w:t></w:r><w:r><w:t>orders go out on Mondays.</w:t></w:r><w:del><w:r><w:delText>Never on Fridays.</w:delText></w:r></w:del></w:p>',
    '<w:p/>',
    '<w:p><w:r><w:t>First line</w:t><w:br/><w:t>second line, the alarm code is 7781</w:t></w:r></w:p>',
  ].join('');
  assert.deepEqual(docxParagraphs(body), ['Clay & glaze orders go out on Mondays.', 'First line\nsecond line, the alarm code is 7781']);
  const d = tmp();
  put(d, 'writing/studio notes.docx', docx(body));
  const { records } = ingest([d], { me: [] });
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.source === 'docx' && r.id.startsWith('dx-') && r.context === null));
  assert.equal(records[1].text, 'First line\nsecond line, the alarm code is [PASSWORD]');
  assert.equal(detectFormat('a.docx', ''), 'docx');
  const z = path.join(tmp(), 'docs.zip');
  fs.writeFileSync(z, zipOf({ 'notes.docx': docx(body) }));
  assert.equal(ingest([z], { me: [] }).records.length, 2);
});

// ---------- Blog ----------

const PAGE = `<!doctype html><html><head><title>Why I fire slow</title><style>p{color:red}</style><script>var x = "not prose";</script></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a></nav><header><p>Maya's Studio Blog</p></header>
<article><h1>Why I fire slow</h1><p>Most cracks are not the clay's fault.
They are mine, for rushing the first 200 degrees.</p>
<ul><li>candle overnight</li><li>then 50 an hour</li></ul><pre><code>ramp(50)</code></pre>
<p>Questions? Write to maya@example.com &mdash; I answer slowly too.</p></article>
<footer><p>Copyright 2026</p></footer></body></html>`;

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Maya's Studio</title>
<item><title>Market day</title><pubDate>Sat, 02 May 2026 09:00:00 GMT</pubDate><description>short summary</description>
<content:encoded><![CDATA[<p>Sold out of mugs by noon.</p><p>Next time: twice as many mugs, half as many vases.</p>]]></content:encoded></item>
<item><title>Glaze test</title><pubDate>Sun, 03 May 2026 09:00:00 GMT</pubDate><description>&lt;p&gt;The celadon ran. Again.&lt;/p&gt;</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Maya</title>
<entry><title>Kiln log</title><updated>2026-05-04T08:00:00Z</updated><content type="html">&lt;p&gt;Cone 10 reached at 11 hours.&lt;/p&gt;</content></entry></feed>`;

test('Blog: an HTML article without page furniture, and RSS and Atom feeds', () => {
  const page = parseHtmlPage(PAGE);
  assert.deepEqual(page.map((m) => m.text), [
    "Most cracks are not the clay's fault. They are mine, for rushing the first 200 degrees.",
    'candle overnight',
    'then 50 an hour',
    'Questions? Write to maya@example.com — I answer slowly too.',
  ]);
  const feed = parseFeed(RSS);
  assert.deepEqual(feed.map((m) => m.text), ['Sold out of mugs by noon.', 'Next time: twice as many mugs, half as many vases.', 'The celadon ran. Again.']);
  assert.equal(feed[0].ts, '2026-05-02T09:00:00Z');
  assert.deepEqual(parseFeed(ATOM).map((m) => m.text), ['Cone 10 reached at 11 hours.']);
  assert.equal(detectFormat('feed.xml', RSS), 'blog-feed');
  assert.equal(detectFormat('atom.xml', ATOM), 'blog-feed');
  assert.equal(detectFormat('other.xml', '<config><a/></config>'), null);

  const d = tmp();
  put(d, 'blog/why-i-fire-slow.html', PAGE);
  put(d, 'blog/feed.rss', RSS);
  put(d, 'blog/index.html', '<html><body><p>A list of links, not an article.</p></body></html>');
  put(d, 'blog/messages/inbox/x/message_1.html', '<html><body><article><p>Someone else wrote this.</p></article></body></html>');
  const { records } = ingest([d], { me: [] });
  assert.equal(records.length, 7);
  assert.ok(records.every((r) => r.source === 'blog' && r.id.startsWith('bl-') && r.context === null));
  assert.ok(records.some((r) => r.text === 'Questions? Write to [EMAIL] — I answer slowly too.'));
  assert.ok(!records.some((r) => /list of links|Someone else|Copyright|Home|not prose|ramp/.test(r.text)), 'pages without an article, app export pages, furniture and code are left out');
  // a page passed on its own is always read
  assert.equal(ingest([path.join(d, 'blog', 'index.html')], { me: [] }).records.length, 1);
  const z = path.join(tmp(), 'blog.zip');
  fs.writeFileSync(z, zipOf({ 'feed.xml': RSS }));
  assert.equal(ingest([z], { me: [] }).records.length, 3);
});

// ---------- Existing generic formats keep working ----------

test('generic JSON rows and CSV are not mistaken for the new formats', () => {
  assert.equal(detectFormat('rows.json', JSON.stringify([{ author: 'Maya', text: 'hi' }])), 'json-rows');
  assert.equal(detectFormat('chat.csv', 'author,text\nMaya,hi'), 'csv');
  assert.equal(detectFormat('result.json', JSON.stringify({ name: 'Theo', messages: [{ id: 1, type: 'message', from: 'Theo', text: 'hi' }] })), 'telegram');
  assert.equal(detectFormat('notes.txt', 'May is a good month for firing.\n\nMore notes.'), 'text');
  const d = tmp();
  put(d, 'x.csv', 'author,text,context\nMaya,sure thing,can you help?\nTheo,thanks,\n');
  const { records } = ingest([d], { me: ['Maya'] });
  assert.deepEqual(texts(records), ['sure thing']);
  assert.equal(records[0].source, 'csv');
});

test('Messenger: the end-to-end encrypted chats download (camelCase fields) and LinkedIn drafts', () => {
  const d = tmp();
  put(d, 'messenger-e2ee/Priya Raman.json', JSON.stringify({
    participants: ['Maya Okafor', 'Priya Raman'],
    threadName: 'Priya Raman',
    messages: [
      { senderName: 'Maya Okafor', timestamp: Date.UTC(2026, 5, 1, 12, 1), text: 'on my way, 5 mins', type: 'text', isUnsent: false },
      { senderName: 'Priya Raman', timestamp: Date.UTC(2026, 5, 1, 12, 0), text: 'Are you close?', type: 'text', isUnsent: false },
      { senderName: 'Maya Okafor', timestamp: Date.UTC(2026, 5, 1, 12, 2), text: 'oops', type: 'text', isUnsent: true },
    ],
  }));
  const { records } = ingest([d], { me: ['Maya Okafor'], format: 'messenger' });
  assert.deepEqual(texts(records), ['on my way, 5 mins']);
  assert.equal(records[0].context, 'Are you close?');
  const li = tmp();
  put(li, 'messages.csv', [
    'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER,IS MESSAGE DRAFT',
    '2-x,,Maya Okafor,,Lee Example,,2026-05-05 09:00:00 UTC,,half written thou,INBOX,true',
    '2-x,,Maya Okafor,,Lee Example,,2026-05-05 09:01:00 UTC,,sent this one,INBOX,false',
  ].join('\n'));
  assert.deepEqual(texts(ingest([li], { me: ['Maya Okafor'] }).records), ['sent this one'], 'drafts were never sent');
});

test('LinkedIn coach and guide chats are not read as your messages; entities decode', async () => {
  const head = 'CONVERSATION ID,FROM,CONTENT,DATE\n1,Maya Okafor,help me,2026-01-01 10:00:00 UTC\n';
  assert.equal(detectFormat('Learning_Coach_Messages.csv', head), null);
  assert.equal(detectFormat('messages.csv', head), 'linkedin');
  const { decodeEntities } = await import('../../src/ingest/html.mjs');
  assert.equal(decodeEntities('a&nbsp;b &amp;lt; &#233;&#x1F64F;').replace(/\s/g, ' '), 'a b &lt; é🙏');
});
