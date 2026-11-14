// Writes FICTIONAL test exports in the formats the real apps produce, for a person
// who does not exist: Rosa Vidal, who runs a small wooden-boat repair workshop in
// Lisbon and teaches sailing at weekends. Everyone she talks to is invented too.
// The exports carry the quirks real exports have: iOS and Android WhatsApp (12 and
// 24 hour clocks, day-first and month-first dates, narrow no-break spaces, invisible
// direction marks, system lines that contain colons, a contact name with a colon,
// media and deleted placeholders, a .zip), a Telegram Desktop full export (rich-text
// arrays, service messages, forwards, replies), a Slack export .zip (threads, edits,
// bots, emoji shortcodes), an X archive .zip (the window.YTD wrapper, retweets, self
// threads, replies to others) and a Gmail Takeout .mbox (quoted replies in English and
// Portuguese, signatures without "-- ", an HTML-only mail, encoded headers, base64).
// Run: node tests/fixtures/rosa/make-exports.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../../../src/ingest/zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'exports');
const LRM = '\u200E';
const NNBSP = '\u202F';

// Seeded clock: each scene starts some hours after the previous one.
let seed = 20260105;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let clock = Date.UTC(2026, 0, 5, 9, 0, 0);
function sceneStart() {
  clock += Math.round((20 + rnd() * 30) * 3600e3);
  const h = new Date(clock).getUTCHours();
  if (h < 8) clock += (8 - h) * 3600e3;
  if (h > 22) clock += (32 - h) * 3600e3;
  return clock;
}
function times(scene, start) {
  let t = start;
  let prev = null;
  return scene.map(([who]) => {
    t += who === prev ? Math.round(15e3 + rnd() * 40e3) : Math.round(60e3 + rnd() * 200e3);
    prev = who;
    return t;
  });
}
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- WhatsApp: Inês (iOS, 24h, dd/mm/yyyy, .zip)
const INES = [
  [['I', 'Are you still up for Saturday? Forecast says 12 knots'], ['R', 'Yes!! 12 knots is perfect for the little boat'], ['R', 'Meet at the dock at 9?']],
  [['I', 'How did the varnish job go?'], ['R', 'Three coats done - the fourth one tomorrow if it stops raining'], ['R', 'My hands smell like a pine forest ahah']],
  [['I', 'Can I bring my cousin on Saturday? She has never sailed'], ['R', 'Ofc! Tell her to bring a jacket, it gets cold on the water'], ['I', 'Amazing, thank you'], ['R', 'Pronto, I will bring the spare life vest']],
  [['I', 'What do I do if I get seasick?'], ['R', 'Look at the horizon and keep busy - give her the tiller, it helps'], ['R', 'And no big breakfast ahah']],
  [['I', 'Did you finish the Sousa boat?'], ['R', 'Almost! Just the brass fittings left'], ['R', 'It looks so good I don\'t want to give it back 😅']],
  [['I', 'Coffee tomorrow before work?'], ['R', 'Can\'t tomorrow - I have a client at 8'], ['R', 'Thursday?'], ['I', 'Thursday works']],
  [['I', 'Your workshop was on the local news!'], ['R', 'Nooo who sent it to you'], ['R', 'I look like I haven\'t slept in a week ahah'], ['I', 'You look great, stop it']],
  [['I', 'What is the wifi at the workshop again?'], ['R', 'Network is Vidal-Oficina, password: Remos2026!'], ['R', 'Don\'t share it with the whole marina ahah']],
  [['I', 'Do you think I should take the job in Porto?'], ['R', 'Honestly? Yes - you have been bored here for a year'], ['R', 'And Porto has better wind, just saying 🌊'], ['I', 'Ha, that is your main argument'], ['R', 'It\'s a strong argument!']],
  [['I', 'Missed you at the dinner'], ['R', 'I know, sorry!! A hull cracked on the slipway and I had to stay'], ['R', 'Next one I am there, promise']],
  [['I', 'Do you have a spare block for the mainsheet?'], ['R', 'I have two in the drawer by the door - take the bigger one'], ['R', 'Door code is 4471# if I am not there']],
  [['I', 'Rain all weekend apparently'], ['R', 'Ugh. Then I will finally sort the rope cupboard'], ['R', 'Living the dream ahah']],
  [['I', 'Happy birthday!!! 🎉'], ['R', 'Obrigada!! Come to the dock at 6, there will be cake'], ['R', 'And bad music ahah']],
  [['I', 'How much would a new tiller cost?'], ['R', 'In ash, around 180 - in oak a bit more'], ['R', 'But yours just needs sanding tbh, don\'t buy a new one']],
  [['I', 'Are you teaching on Sunday?'], ['R', 'Yes, beginners at 10 and the kids group at 2'], ['R', 'Why, want to help? I need someone in the safety boat']],
  [['I', 'I saw a dolphin from the ferry today!!'], ['R', 'Nooo lucky!! Where?'], ['I', 'Near the bridge'], ['R', 'They come up the river when the water is warm - keep looking']],
  [['I', 'Can you call me later? Long story'], ['R', 'Of course - after 7, I am under a boat until then'], ['R', 'Everything ok?']],
  [['I', 'Thanks for yesterday, I really needed that'], ['R', 'Always! That is what the boat is for'], ['R', 'Same time next week?']],
  [['I', 'My landlord is raising the rent again'], ['R', 'What?? By how much'], ['I', '15 percent'], ['R', 'That is insane - check if it is even legal, I think there is a limit']],
  [['I', 'What should I read on the train?'], ['R', 'The Old Man and the Sea, obviously ahah'], ['R', 'No but really - anything by Saramago']],
  [['I', 'Is the regatta still on?'], ['R', 'Postponed to the 28th, the committee is useless'], ['R', 'Bora anyway, we can train']],
  [['I', 'Send me the address of the sail maker?'], ['R', 'Rua da Boavista 41, ask for Zé'], ['R', 'Tell him I sent you - he will give you a discount, maybe ahah']],
  [['I', 'Good luck with the inspection tomorrow'], ['R', 'Thank you!! I am so nervous'], ['R', 'If they find the leak I am moving to the mountains']],
  [['I', 'How was the inspection?'], ['R', 'PASSED 🙌'], ['R', 'They didn\'t even look at the bilge ahah'], ['I', 'Celebrate!!'], ['R', 'Already on my second beer']],
];
// Lines WhatsApp itself writes in an iOS export, placed between scenes.
const INES_EXTRA = [
  (n) => `${n} Rosa Vidal: ${LRM}image omitted`,
  (n) => `${n} Inês Costa: ${LRM}This message was deleted.`,
  (n) => `${n} Inês Costa: ${LRM}Location: https://maps.google.com/?q=38.7072,-9.1355`,
  (n) => `${n} Rosa Vidal: ${LRM}audio omitted`,
  (n) => `${n} Inês Costa: ${LRM}Missed voice call, ${LRM}Tap to call back`,
  (n) => `${n} Rosa Vidal: ${LRM}You deleted this message.`,
  (n) => `${n} Inês Costa: ${LRM}sticker omitted`,
  (n) => `${n} Rosa Vidal: ${LRM}Orçamento casco.pdf • ${LRM}2 pages ${LRM}document omitted`,
];
function iosStamp(ms) {
  const d = new Date(ms);
  return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}]`;
}
function inesChat() {
  const names = { I: 'Inês Costa', R: 'Rosa Vidal' };
  const lines = [];
  const first = sceneStart();
  lines.push(`${iosStamp(first)} Inês Costa: ${LRM}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`);
  INES.forEach((scene, k) => {
    const ts = times(scene, sceneStart());
    scene.forEach(([who, text], i) => {
      // One message is edited, one is multi-line.
      let t = text;
      if (k === 2 && i === 3) t += ` ${LRM}<This message was edited>`;
      lines.push(`${iosStamp(ts[i])} ${names[who]}: ${t}`);
    });
    if (k % 3 === 1) lines.push(INES_EXTRA[Math.floor(k / 3) % INES_EXTRA.length](iosStamp(ts[ts.length - 1] + 30e3)));
  });
  // A multi-line message from Rosa and an attachment line that iOS prefixes with a mark.
  const t = sceneStart();
  lines.push(`${iosStamp(t)} Inês Costa: What do I need for the course?`);
  lines.push(`${iosStamp(t + 120e3)} Rosa Vidal: Ok list:`);
  lines.push('- shoes that can get wet');
  lines.push('- sunscreen even if it is cloudy');
  lines.push('- snacks!! people always forget');
  lines.push(`${LRM}${iosStamp(t + 200e3)} Rosa Vidal: ${LRM}<attached: 00000041-PHOTO-2026-03-01-10-02-11.jpg>`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- WhatsApp: Dan (Android, US, 12h with U+202F)
const DAN = [
  [['D', 'Hi Rosa, Dan Okoro here, Marta gave me your number. I have a 1970s wooden dinghy that needs work.'], ['R', 'Hi Dan! Happy to take a look'], ['R', 'Can you send me a few photos of the hull and the transom?']],
  [['D', 'Here you go. The transom is the worst part.'], ['R', 'Ok yes - the transom has rot near the drain, that needs replacing'], ['R', 'The rest looks honestly solid for its age']],
  [['D', 'What would that cost, roughly?'], ['R', 'Transom plus a full sand and two coats - around 1400 euros'], ['R', 'I can send a proper quote by email tomorrow'], ['D', 'That is within budget. Please do.']],
  [['D', 'When could you start?'], ['R', 'The week of the 16th - I have one boat ahead of yours'], ['R', 'Is that ok?'], ['D', 'Perfect.']],
  [['D', 'Should I bring it on a trailer or can you collect it?'], ['R', 'I can collect it, I have a trailer - 60 euros for the trip'], ['R', 'Send me the address when you have a minute']],
  [['D', 'The address is the marina at Oeiras, berth C14.'], ['R', 'Got it, I will be there Monday around 9'], ['R', 'Leave the cover on please, it is meant to rain']],
  [['D', 'How is the dinghy doing?'], ['R', 'Good news - the keel is fine, the rot was only in the transom'], ['R', 'Bad news - I found a second soft spot under the seat, small one'], ['D', 'How much extra?'], ['R', 'Around 150, it is a small patch']],
  [['D', 'Can I come and see it on Friday?'], ['R', 'Yes! Come after 4, I will be gluing until then'], ['R', 'Workshop is behind the yellow warehouse, you can\'t miss it']],
  [['D', 'It looks fantastic. Thank you, really.'], ['R', 'Thank YOU - it was a fun one to work on'], ['R', 'Take her out on a calm day first, the new wood needs a few weeks to settle']],
  [['D', 'Where do I send the payment?'], ['R', 'IBAN is PT50 0002 0123 1234 5678 9015 4, Vidal Boatworks'], ['R', 'And no rush!']],
  [['D', 'One more question: what oil should I use on the deck?'], ['R', 'Teak oil, thin coats, once in spring and once in autumn'], ['R', 'And keep her covered in summer - the sun here is brutal']],
];
function androidUsStamp(ms) {
  const d = new Date(ms);
  let h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}, ${h}:${pad(d.getUTCMinutes())}${NNBSP}${ap}`;
}
function danChat() {
  const names = { D: 'Dan Okoro', R: 'Rosa Vidal' };
  const lines = [];
  const first = sceneStart();
  lines.push(`${androidUsStamp(first)} - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.`);
  DAN.forEach((scene, k) => {
    const ts = times(scene, sceneStart());
    scene.forEach(([who, text], i) => {
      if (k === 1 && i === 0) {
        lines.push(`${androidUsStamp(ts[i])} - Dan Okoro: <Media omitted>`);
        lines.push(`${androidUsStamp(ts[i])} - Dan Okoro: IMG-20260201-WA0007.jpg (file attached)`);
        lines.push(text);
        return;
      }
      lines.push(`${androidUsStamp(ts[i])} - ${names[who]}: ${text}${k === 4 && i === 1 ? ' <This message was edited>' : ''}`);
    });
    if (k === 2) lines.push(`${androidUsStamp(ts[ts.length - 1] + 40e3)} - Dan Okoro: This message was deleted`);
    if (k === 5) lines.push(`${androidUsStamp(ts[ts.length - 1] + 40e3)} - Rosa Vidal: null`);
    if (k === 6) lines.push(`${androidUsStamp(ts[ts.length - 1] + 40e3)} - Dan Okoro: Missed voice call`);
  });
  // A multi-line reply.
  const t = sceneStart();
  lines.push(`${androidUsStamp(t)} - Dan Okoro: Any tips for storing it over winter?`);
  lines.push(`${androidUsStamp(t + 150e3)} - Rosa Vidal: Three things:`);
  lines.push('1. dry it completely');
  lines.push('2. cover it but let air through');
  lines.push('3. take the sails home, mice love them');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- WhatsApp: group (Android, 24h, dd/mm/yyyy, system lines)
const GROUP = [
  [['T', 'Who is in for Saturday? Wind looks good'], ['R', 'Me! I can bring the second boat'], ['O', 'I am in as well.'], ['R', 'Bora, 9 at the dock']],
  [['N', 'can someone lend me gloves'], ['R', 'I have spare ones at the workshop - grab them Friday'], ['T', 'You are a legend']],
  [['T', 'Race report: we came fourth out of nine'], ['R', 'Fourth!! Not bad for a crew that can\'t tie a bowline ahah'], ['O', 'Speak for yourself.']],
  [['O', 'Is the clubhouse open on Sunday?'], ['R', 'Only until 1 - after that the key is with Tiago'], ['T', 'Correct, text me']],
  [['T', 'New rule: whoever capsizes buys the coffee'], ['R', 'Then I am buying for the whole season ahah'], ['R', 'Fine, deal']],
  [['N', 'what time tomorrow'], ['R', '9:30 - the tide turns at 11 so don\'t be late'], ['O', 'Noted.']],
];
function ukStamp(ms) {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function groupChat() {
  // "Dr. Okoye: Lab" is how Rosa saved this contact. "+351 913 000 111" is not in her contacts.
  const names = { T: 'Tiago 🚲', O: 'Dr. Okoye: Lab', N: '+351 913 000 111', R: 'Rosa Vidal' };
  const t0 = sceneStart();
  const s = (k) => ukStamp(t0 + k * 60e3);
  const lines = [
    `${s(0)} - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.`,
    `${s(0)} - Tiago 🚲 created group "Sailing Crew ⛵"`,
    `${s(0)} - Tiago 🚲 added you`,
    `${s(1)} - Tiago 🚲 added Dr. Okoye: Lab`,
    `${s(1)} - +351 913 000 111 joined using this group's invite link`,
    `${s(2)} - Tiago 🚲 changed the subject from "Sailing Crew ⛵" to "Sailing Crew: Saturdays ⛵"`,
    `${s(3)} - Tiago 🚲 changed this group's icon`,
    `${s(4)} - Tiago 🚲 changed the group description`,
  ];
  GROUP.forEach((scene, k) => {
    const ts = times(scene, sceneStart());
    scene.forEach(([who, text], i) => lines.push(`${ukStamp(ts[i])} - ${names[who]}: ${text}`));
    if (k === 2) lines.push(`${ukStamp(ts[ts.length - 1] + 60e3)} - You changed the subject from "Sailing Crew: Saturdays ⛵" to "Sailing Crew: Weekends ⛵"`);
    if (k === 3) lines.push(`${ukStamp(ts[ts.length - 1] + 60e3)} - Your security code with Tiago 🚲 changed. Tap to learn more.`);
    if (k === 4) lines.push(`${ukStamp(ts[ts.length - 1] + 60e3)} - Tiago 🚲 pinned a message`);
  });
  lines.push(`${ukStamp(sceneStart())} - +351 913 000 111 left`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- WhatsApp: Pedro (Android, 12h lowercase pm, dd/mm, every day <= 12)
function pedroChat() {
  // Every date in this file reads either way (03/02 is 3 February or 2 March).
  // Only the order of the messages tells them apart.
  const at = (d, m, h, min) => {
    const hh = h % 12 || 12;
    return `${pad(d)}/${pad(m)}/2026, ${hh}:${pad(min)}${NNBSP}${h >= 12 ? 'pm' : 'am'}`;
  };
  return [
    `${at(3, 2, 21, 15)} - Pedro Alves: Still on for the boat show?`,
    `${at(3, 2, 21, 18)} - Rosa Vidal: Yes! I already have the tickets`,
    `${at(5, 2, 10, 0)} - Pedro Alves: Which day works for you`,
    `${at(5, 2, 10, 6)} - Rosa Vidal: Saturday - Sunday I am teaching`,
    `${at(11, 2, 13, 0)} - Pedro Alves: I booked the train`,
    `${at(11, 2, 13, 2)} - Rosa Vidal: Perfect, see you at the station at 8`,
    `${at(2, 3, 9, 30)} - Pedro Alves: That was a great show`,
    `${at(2, 3, 9, 41)} - Rosa Vidal: The best one in years - and I didn't buy anything ahah`,
  ].join('\n') + '\n';
}

// ---------------------------------------------------------------- Telegram Desktop full export
function telegramExport() {
  let id = 100;
  const unix = (ms) => String(Math.floor(ms / 1000));
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
  const msg = (ms, from, fromId, text, extra = {}) => ({ id: ++id, type: 'message', date: iso(ms), date_unixtime: unix(ms), from, from_id: fromId, text, text_entities: [], ...extra });
  const M = ['Marta Sousa', 'user7770002'];
  const R = ['Rosa Vidal', 'user7770001'];
  const messages = [];
  const scenes = [
    [[M, 'Are you going to the boat jumble on Sunday?'], [R, 'Yes! I need cheap cleats and a new bucket ahah'], [R, 'Want a lift?']],
    [[M, ['Did you see ', { type: 'text_link', text: 'this article', href: 'https://example.org/wooden-boats' }, ' about wooden boats?']], [R, 'Just read it - finally someone saying epoxy is not magic'], [R, ['I am sending it to ', { type: 'mention', text: '@tiago_vela' }]]],
    [[M, 'Can I borrow your heat gun this week?'], [R, 'Ofc, it is on the shelf above the bench'], [R, 'Don\'t point it at the varnish tins please ahah']],
    [[M, 'How is your back?'], [R, 'Better! No more lifting hulls alone, I promised the physio'], [R, 'Let\'s see how long that lasts']],
    [[M, 'Dinner on Thursday at mine?'], [R, 'Yes please!! What can I bring?'], [M, 'Wine'], [R, 'Done 🍷']],
    [[M, 'My daughter wants to learn to sail. Is 9 too young?'], [R, 'Not at all - 9 is a great age, the kids group starts at 8'], [R, 'Bring her on Sunday at 2 and she can try']],
    [[M, 'Have you got the number of that electrician?'], [R, 'Yes - João, +351 936 222 111'], [R, 'He is slow but he is good']],
    [[M, 'Happy new year from the mountains!'], [R, 'Happy new year!! Bring snow back for me'], [R, 'Here it is 16 degrees and grey ahah']],
  ];
  for (const [k, scene] of scenes.entries()) {
    const ts = times(scene.map(([p]) => [p[0]]), sceneStart());
    let marta = null;
    scene.forEach(([p, text], i) => {
      const extra = {};
      // In the third scene Rosa answers with an explicit reply to Marta's message.
      if (k === 2 && i === 1 && marta) extra.reply_to_message_id = marta;
      const m = msg(ts[i], p[0], p[1], text, extra);
      if (p === M) marta = m.id;
      messages.push(m);
    });
    if (k === 1) {
      // Rosa forwards a notice: not her words.
      messages.push(msg(ts[ts.length - 1] + 60e3, R[0], R[1], 'NOTICE: Doca de Alcântara closed for dredging from 3 to 14 March. Moorings will be reassigned.', { forwarded_from: 'Lisbon Port Authority' }));
      messages.push({ id: ++id, type: 'service', date: iso(ts[ts.length - 1] + 90e3), date_unixtime: unix(ts[ts.length - 1] + 90e3), actor: R[0], actor_id: R[1], action: 'phone_call', duration_seconds: 240, discard_reason: 'hangup', text: '', text_entities: [] });
    }
    if (k === 4) messages.push(msg(ts[ts.length - 1] + 30e3, M[0], M[1], '', { media_type: 'sticker', sticker_emoji: '🎉', file: '(File not included. Change data exporting settings to download.)' }));
  }
  return {
    about: 'Here is the data you requested. Remember: Telegram is ad free, it doesn\'t sell your data.',
    personal_information: { user_id: 7770001, first_name: 'Rosa', last_name: 'Vidal', phone_number: '+351 912 345 678', username: '@rosa_vidal', bio: 'wooden boats + sailing' },
    chats: {
      about: 'This page lists all chats from this export.',
      list: [
        { name: 'Marta Sousa', type: 'personal_chat', id: 7770002, messages },
        {
          type: 'saved_messages', id: 7770001, messages: [
            msg(sceneStart(), R[0], R[1], 'Buy: 2 tins of varnish, sandpaper 120 and 240, new brushes'),
            msg(sceneStart(), R[0], R[1], 'The trick to a good finish is patience and thin coats.', { forwarded_from: 'Wooden Boat Forum' }),
          ],
        },
      ],
    },
  };
}

// ---------------------------------------------------------------- Slack export (.zip)
function slackExport() {
  const users = [
    { id: 'U01ROSA', team_id: 'T0LSC', name: 'rosa', real_name: 'Rosa Vidal', profile: { display_name: 'rosa', real_name: 'Rosa Vidal' }, is_bot: false },
    { id: 'U02JOAO', team_id: 'T0LSC', name: 'joao.m', real_name: 'João Mendes', profile: { display_name: 'João', real_name: 'João Mendes' }, is_bot: false },
    { id: 'U03CLARA', team_id: 'T0LSC', name: 'clara', real_name: 'Clara Nunes', profile: { display_name: '', real_name: 'Clara Nunes' }, is_bot: false },
    { id: 'U04TIDE', team_id: 'T0LSC', name: 'tidebot', real_name: 'Tide Bot', profile: { display_name: 'Tide Bot' }, is_bot: true },
  ];
  const ts = (ms, k = 0) => `${Math.floor(ms / 1000)}.${String(100 + k).padStart(6, '0')}`;
  const days = new Map();
  const add = (channel, ms, m) => {
    const key = `${channel}/${new Date(ms).toISOString().slice(0, 10)}.json`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push({ type: 'message', ...m });
  };
  // #crew: plain back-and-forth
  const crew = [
    [['U02JOAO', 'Who can skipper the safety boat on Sunday? <!channel>'], ['U01ROSA', 'I can :raised_hands: but only from 10'], ['U01ROSA', 'Someone else take the first hour?']],
    [['U03CLARA', 'The red dinghy has a crack near the centreboard case'], ['U01ROSA', 'Ugh, not again - I will look at it Thursday'], ['U01ROSA', 'Don\'t sail it until then pls']],
    [['U02JOAO', 'Membership fees are due next week &amp; we still have 12 unpaid'], ['U01ROSA', 'I will remind my students - most of them forget :sweat_smile:']],
    [['U03CLARA', 'Is anyone coming to the cleanup on Saturday?'], ['U01ROSA', 'Yes! I will bring bags and gloves'], ['U01ROSA', 'And coffee, obviously :coffee:']],
  ];
  for (const [k, scene] of crew.entries()) {
    const start = sceneStart();
    const tt = times(scene, start);
    scene.forEach(([u, text], i) => add('crew', tt[i], { user: u, text, ts: ts(tt[i], i), ...(k === 1 && i === 1 ? { edited: { user: u, ts: ts(tt[i] + 60e3) } } : {}) }));
    if (k === 0) {
      add('crew', start - 3600e3, { subtype: 'channel_join', user: 'U01ROSA', text: '<@U01ROSA> has joined the channel', ts: ts(start - 3600e3) });
      add('crew', tt[1] - 20e3, { user: 'U04TIDE', bot_id: 'B04TIDE', text: 'High tide today at 14:32 (3.4 m)', ts: ts(tt[1] - 20e3, 9) });
    }
    if (k === 2) add('crew', tt[1] + 30e3, { subtype: 'bot_message', bot_id: 'B09GH', username: 'Calendar', text: 'Reminder: committee meeting tomorrow at 19:00', ts: ts(tt[1] + 30e3, 8) });
  }
  // #general: a thread with replies, a broadcast reply and a file share
  const parentMs = sceneStart();
  const p = ts(parentMs);
  add('general', parentMs, { user: 'U03CLARA', text: 'Ideas for the spring open day? We have a small budget', ts: p, thread_ts: p, reply_count: 4 });
  add('general', parentMs + 200e3, { user: 'U02JOAO', text: 'Free taster sails?', ts: ts(parentMs + 200e3), thread_ts: p, parent_user_id: 'U03CLARA' });
  add('general', parentMs + 400e3, { user: 'U01ROSA', text: 'Taster sails yes - and a knot-tying table for the kids, costs nothing', ts: ts(parentMs + 400e3), thread_ts: p, parent_user_id: 'U03CLARA' });
  add('general', parentMs + 430e3, { user: 'U01ROSA', text: 'I can run it with two of my students', ts: ts(parentMs + 430e3), thread_ts: p, parent_user_id: 'U03CLARA' });
  add('general', parentMs + 900e3, { user: 'U03CLARA', text: 'Love it. <@U01ROSA> can you write a short plan?', ts: ts(parentMs + 900e3), thread_ts: p, parent_user_id: 'U03CLARA' });
  add('general', parentMs + 1100e3, { subtype: 'thread_broadcast', user: 'U01ROSA', text: 'Plan is in the shared drive - <https://docs.example.org/open-day|open day plan>, comments welcome', ts: ts(parentMs + 1100e3), thread_ts: p });
  const fm = sceneStart();
  add('general', fm, { user: 'U02JOAO', text: 'Photos from the regatta are up', ts: ts(fm) });
  add('general', fm + 300e3, { subtype: 'file_share', user: 'U01ROSA', text: 'Here are mine, the light was amazing :ocean:', files: [{ id: 'F1', name: 'regatta.jpg' }], ts: ts(fm + 300e3) });
  add('general', fm + 500e3, { subtype: 'huddle_thread', user: 'U02JOAO', text: '', ts: ts(fm + 500e3) });
  const files = [
    { path: 'users.json', data: JSON.stringify(users, null, 2) },
    { path: 'channels.json', data: JSON.stringify([{ id: 'C01CREW', name: 'crew' }, { id: 'C02GEN', name: 'general' }], null, 2) },
    { path: 'integration_logs.json', data: '[]' },
  ];
  for (const [p2, arr] of [...days].sort()) files.push({ path: p2, data: JSON.stringify(arr.sort((a, b) => Number(a.ts) - Number(b.ts)), null, 2) });
  return writeZip(files);
}

// ---------------------------------------------------------------- X archive (.zip)
function xArchive() {
  const created = (ms) => {
    const d = new Date(ms);
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return `${day} ${mon} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`;
  };
  let n = 1880000000000000000n;
  const tweets = [];
  const tw = (full, extra = {}) => {
    n += 1234567n;
    const t = { edit_info: { initial: { editTweetIds: [String(n)], editableUntil: '', editsRemaining: '5', isEditEligible: true } }, retweeted: false, source: '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>', entities: { hashtags: [], symbols: [], user_mentions: [], urls: [] }, display_text_range: ['0', String(full.length)], favorite_count: '2', id_str: String(n), truncated: false, retweet_count: '0', id: String(n), created_at: created(sceneStart()), favorited: false, full_text: full, lang: 'en', ...extra };
    tweets.push({ tweet: t });
    return t;
  };
  tw('First sail of the year &amp; the river was glass. Best office in the world');
  const a = tw('Restoring a 1970s dinghy this month - the transom was basically sponge');
  tw('@rosa_vidal Update: new transom is in and she floats! https://t.co/AbC123xYz9', { in_reply_to_status_id_str: a.id_str, in_reply_to_user_id: '7770001', in_reply_to_screen_name: 'rosa_vidal', entities: { hashtags: [], symbols: [], user_mentions: [{ screen_name: 'rosa_vidal' }], urls: [], media: [{ url: 'https://t.co/AbC123xYz9' }] } });
  tw('RT @LisbonSailing: Entries for the spring regatta close Friday https://t.co/Zz9Yy8Xx7W', { entities: { hashtags: [], symbols: [], user_mentions: [{ screen_name: 'LisbonSailing' }], urls: [{ url: 'https://t.co/Zz9Yy8Xx7W', expanded_url: 'https://lisbonsailing.example/regatta' }] } });
  tw('@joao_vela @clara_n ahah yes, the knot table was chaos but the kids loved it', { in_reply_to_status_id_str: '1879999999999999999', in_reply_to_screen_name: 'joao_vela' });
  tw('Hot take: varnish is a lifestyle, not a product');
  tw('Epoxy is not magic. Good wood and patience are https://t.co/Qq1Ww2Ee3R', { entities: { hashtags: [], symbols: [], user_mentions: [], urls: [{ url: 'https://t.co/Qq1Ww2Ee3R', expanded_url: 'https://example.org/wooden-boats' }] } });
  tw('Teaching kids to sail is the best part of my week. Nobody complains about the cold like a 9 year old though');
  tw('RT @WoodenBoatMag: Ten classic dinghies worth saving');
  tw('Three coats of varnish down, two to go. My hands smell like a pine forest');
  tw('@marta_s it was so good!! same time next year', { in_reply_to_status_id_str: '1879999999999999000', in_reply_to_screen_name: 'marta_s' });
  tw('PSA: check your bilge pumps before the spring storms, not during');
  const js = 'window.YTD.tweets.part0 = ' + JSON.stringify(tweets, null, 2);
  return writeZip([
    { path: 'Your archive.html', data: '<!doctype html><title>Your archive</title>' },
    { path: 'data/manifest.js', data: 'window.__THAR_CONFIG = {"userInfo":{"accountId":"7770001","userName":"rosa_vidal","displayName":"Rosa Vidal"}}' },
    { path: 'data/account.js', data: 'window.YTD.account.part0 = [{"account":{"username":"rosa_vidal","accountId":"7770001"}}]' },
    { path: 'data/like.js', data: 'window.YTD.like.part0 = [{"like":{"tweetId":"1","fullText":"Liked tweet by someone else, not Rosa"}}]' },
    { path: 'data/tweets.js', data: js },
    { path: 'assets/js/main.js', data: 'console.log("viewer")' },
    { path: '__MACOSX/data/._tweets.js', data: Buffer.from([0, 5, 22, 7, 0, 2, 0, 0, 77, 97, 99]) },
  ]);
}

// ---------------------------------------------------------------- Gmail Takeout mbox
function mbox() {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\n');
  const postmark = (ms) => {
    const d = new Date(ms);
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return `${day} ${mon} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`;
  };
  const rfc = (ms) => new Date(ms).toUTCString().replace('GMT', '+0000');
  const SIG = '\n\nRosa Vidal\nVidal Boatworks | Doca de Alcântara, Lisboa\n+351 912 345 678\nwww.vidal-boatworks.example';
  const mails = [];
  const mail = (ms, headers, body) => mails.push([`From 18${ms}@xxx ${postmark(ms)}`, 'X-GM-THRID: 18' + Math.floor(ms / 1e6), 'X-Gmail-Labels: ' + (/Rosa Vidal/.test(headers.From) ? 'Sent' : 'Inbox,Opened'), `Date: ${rfc(ms)}`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), '', body, ''].join('\n'));
  // 1. Dan asks for a quote (plain, quoted-printable); Rosa answers (base64, multipart, Portuguese-style English quote)
  let t = sceneStart();
  mail(t, { 'Message-ID': '<dan-1@mail.example.com>', Subject: 'Quote for the dinghy', From: 'Dan Okoro <dan@example.com>', To: 'Rosa Vidal <rosa@vidal-boatworks.example>', 'Content-Type': 'text/plain; charset="UTF-8"', 'Content-Transfer-Encoding': 'quoted-printable' },
    'Hi Rosa,\n\nCould you send the quote for the transom and the refinish? I would like to=\n have it in writing before I confirm.\n>From what you said it is about 1400 euros.\n\nThanks,\nDan');
  t += 5 * 3600e3;
  mail(t, { 'Message-ID': '<rosa-1@mail.vidal-boatworks.example>', 'In-Reply-To': '<dan-1@mail.example.com>', Subject: 'Re: Quote for the dinghy', From: 'Rosa Vidal <rosa@vidal-boatworks.example>', To: 'Dan Okoro <dan@example.com>', 'Content-Type': 'multipart/alternative; boundary="000000000000a1b2c3"' },
    ['--000000000000a1b2c3', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
      b64(`Hi Dan,\n\nHere it is: new transom in oak, full sand, two coats of varnish - 1,400 euros, collection included.\nI can start the week of the 16th.\n\nBest,\nRosa${SIG}\n\nOn Mon, Feb 2, 2026 at 10:12 AM Dan Okoro <dan@example.com> wrote:\n> Hi Rosa,\n>\n> Could you send the quote for the transom and the refinish?\n`),
      '--000000000000a1b2c3', 'Content-Type: text/html; charset="UTF-8"', '', '<div dir="ltr">Hi Dan,</div>', '--000000000000a1b2c3--'].join('\n'));
  // 2. Inês writes in Portuguese (encoded headers); Rosa replies with a Portuguese Gmail attribution
  t = sceneStart();
  mail(t, { 'Message-ID': '<ines-1@mail.example.pt>', Subject: '=?UTF-8?Q?Jantar_de_s=C3=A1bado?=', From: '=?UTF-8?Q?In=C3=AAs_Costa?= <ines@example.pt>', To: 'Rosa Vidal <rosa@vidal-boatworks.example>', 'Content-Type': 'text/plain; charset="UTF-8"', 'Content-Transfer-Encoding': 'quoted-printable' },
    'Ol=C3=A1! Are you coming to dinner on Saturday? Bring the photos from the regatta.');
  t += 3 * 3600e3;
  mail(t, { 'Message-ID': '<rosa-2@mail.vidal-boatworks.example>', 'In-Reply-To': '<ines-1@mail.example.pt>', Subject: 'Re: =?UTF-8?Q?Jantar_de_s=C3=A1bado?=', From: 'Rosa Vidal <rosa@vidal-boatworks.example>', To: '=?UTF-8?Q?In=C3=AAs_Costa?= <ines@example.pt>', 'Content-Type': 'text/plain; charset="UTF-8"', 'Content-Transfer-Encoding': 'quoted-printable' },
    `Yes!! I will bring the photos and a bottle of vinho verde.\n\nBest,\nRosa${SIG}\n\nEm s=C3=A1b., 7 de fev. de 2026 =C3=A0s 10:12, In=C3=AAs Costa <ines@example.pt> escreveu:\n> Ol=C3=A1! Are you coming to dinner on Saturday? Bring the photos from the\n> regatta.`);
  // 3. An HTML-only mail from Rosa to the sailing club (numeric entities, quoted-printable, hard-wrapped source)
  t = sceneStart();
  mail(t, { 'Message-ID': '<rosa-3@mail.vidal-boatworks.example>', Subject: 'Sunday lessons', From: 'Rosa Vidal <rosa@vidal-boatworks.example>', To: 'crew@lisbonsailing.example', 'Content-Type': 'text/html; charset="UTF-8"', 'Content-Transfer-Encoding': 'quoted-printable' },
    '<html><head><style>p{margin:0}</style></head><body><div dir=3D"ltr">Hi all,<div><br></div><div>Sunday&#39;s lessons are on =E2=80=93 beginners at 10 and the kids at 2.=\n It&#8217;s going to be windy so bring layers &amp; a hat.</div><div><br></div><div>Best,</div><div>Rosa</div>' +
      '<div><br></div><div>Rosa Vidal</div><div>Vidal Boatworks | Doca de Alc&acirc;ntara, Lisboa</div><div>+351 912 345 678</div><div>www.vidal-boatworks.example</div></div></body></html>');
  // 4. The marina office writes; Rosa replies inline with a Gmail attribution that wraps, and a "From" line in her text
  t = sceneStart();
  mail(t, { 'Message-ID': '<office-1@marina.example>', Subject: 'Mooring fees for March', From: 'Marina Office <office@marina.example>', To: 'Rosa Vidal <rosa@vidal-boatworks.example>', 'Content-Type': 'text/plain; charset="UTF-8"' },
    'Dear Ms Vidal,\n\nPlease confirm the mooring fees for March: 320 EUR for berth C14.\n\nKind regards,\nMarina Office');
  t += 26 * 3600e3;
  mail(t, { 'Message-ID': '<rosa-4@mail.vidal-boatworks.example>', 'In-Reply-To': '<office-1@marina.example>', Subject: 'Re: Mooring fees for March', From: 'Rosa Vidal <rosa@vidal-boatworks.example>', To: 'Marina Office <office@marina.example>', 'Content-Type': 'text/plain; charset="UTF-8"' },
    `Hi,\n\n>From my side the fees look fine - I will pay this week.\n\nBest,\nRosa${SIG}\n\nOn Tue, Feb 24, 2026 at 5:00 PM Marina Office <office@marina.example>\nwrote:\n> Dear Ms Vidal,\n>\n> Please confirm the mooring fees for March: 320 EUR for berth C14.\n`);
  // 5. A Spanish-language thread answered from the phone (mobile footer in Portuguese)
  t = sceneStart();
  mail(t, { 'Message-ID': '<pablo-1@example.es>', Subject: 'Barniz', From: 'Pablo Ruiz <pablo@example.es>', To: 'Rosa Vidal <rosa@vidal-boatworks.example>', 'Content-Type': 'text/plain; charset="ISO-8859-1"', 'Content-Transfer-Encoding': 'quoted-printable' },
    'Hola Rosa, how many coats of varnish for a deck that gets a lot of sun?');
  t += 2 * 3600e3;
  mail(t, { 'Message-ID': '<rosa-5@mail.vidal-boatworks.example>', 'In-Reply-To': '<pablo-1@example.es>', Subject: 'Re: Barniz', From: 'Rosa Vidal <rosa@vidal-boatworks.example>', To: 'Pablo Ruiz <pablo@example.es>', 'Content-Type': 'text/plain; charset="UTF-8"' },
    'Five thin coats, and sand lightly between each one - the sun eats anything thinner.\n\nEnviado do meu iPhone\n\nEl dom, 1 mar 2026 a las 10:00, Pablo Ruiz <pablo@example.es> escribió:\n> Hola Rosa, how many coats of varnish for a deck that gets a lot of sun?');
  return mails.join('\n');
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'Takeout', 'Mail'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'Telegram Desktop', 'DataExport_2026-03-10'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'WhatsApp Chat - Inês Costa.zip'), writeZip([
  { path: '_chat.txt', data: '\uFEFF' + inesChat() },
  { path: '00000041-PHOTO-2026-03-01-10-02-11.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
]));
fs.writeFileSync(path.join(OUT, 'WhatsApp Chat with Dan Okoro.txt'), danChat());
fs.writeFileSync(path.join(OUT, 'WhatsApp Chat with Sailing Crew ⛵.txt'), groupChat());
fs.writeFileSync(path.join(OUT, 'WhatsApp Chat with Pedro Alves.txt'), pedroChat());
fs.writeFileSync(path.join(OUT, 'Telegram Desktop', 'DataExport_2026-03-10', 'result.json'), JSON.stringify(telegramExport(), null, 1));
fs.writeFileSync(path.join(OUT, 'slack-lisbon-sailing-club.zip'), slackExport());
fs.writeFileSync(path.join(OUT, 'twitter-2026-03-10-rosa_vidal.zip'), xArchive());
fs.writeFileSync(path.join(OUT, 'Takeout', 'Mail', 'All mail Including Spam and Trash.mbox'), mbox());
console.log(`Wrote fictional exports to ${OUT}`);
