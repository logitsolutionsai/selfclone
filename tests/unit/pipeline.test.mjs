import { test } from 'node:test';
import assert from 'node:assert/strict';
import { split, sealedCountFor } from '../../src/split.mjs';
import { features, words, punctuation, englishShare } from '../../src/text.mjs';
import { fingerprint, signaturePhrases, openersClosers } from '../../src/fingerprint.mjs';
import { buildPack } from '../../src/pack.mjs';
import { synthRecords } from './synth.mjs';

function corpus(n = 200) {
  // Mix of turns with and without context, some multi-message turns.
  const recs = synthRecords('casual', n, 'split-corpus');
  for (let i = 0; i < recs.length; i += 7) {
    if (recs[i + 1]) {
      recs[i + 1].turn = recs[i].turn;
      recs[i + 1].context = null;
    }
  }
  return recs;
}

test('split is deterministic for a seed and changes with the seed', () => {
  const recs = corpus();
  const a = split(recs, { seed: 'one' });
  const b = split(recs, { seed: 'one' });
  const c = split(recs, { seed: 'two' });
  assert.deepEqual(a.sealed, b.sealed);
  assert.deepEqual(a.train.map((r) => r.id), b.train.map((r) => r.id));
  assert.notDeepEqual(a.sealed.map((s) => s.turn), c.sealed.map((s) => s.turn));
  // Input order does not matter.
  const d = split(recs.slice().reverse(), { seed: 'one' });
  assert.deepEqual(new Set(d.sealed.map((s) => s.turn)), new Set(a.sealed.map((s) => s.turn)));
});

test('split seals about 15% (at least 20) context pairs and never leaks into train', () => {
  const recs = corpus(400);
  const { train, sealed, meta } = split(recs, { seed: 'x' });
  const turns = new Set(recs.map((r) => r.turn)).size;
  assert.equal(sealed.length, Math.max(20, Math.round(0.15 * turns)));
  assert.ok(sealed.every((s) => s.context && s.reply));
  const sealedIds = new Set(sealed.flatMap((s) => s.ids));
  const sealedTurns = new Set(sealed.map((s) => s.turn));
  assert.ok(train.every((r) => !sealedIds.has(r.id) && !sealedTurns.has(r.turn)), 'no sealed id or turn in train');
  assert.equal(train.length + meta.sealedMessages, recs.length);
  // A multi-message sealed turn keeps all its messages together.
  for (const s of sealed) assert.equal(s.reply.split('\n').length >= s.ids.length, true);
  assert.match(meta.sealedSha256, /^[0-9a-f]{64}$/);
});

test('sealed count rules for small corpora', () => {
  assert.equal(sealedCountFor(1000, 500), 150);
  assert.equal(sealedCountFor(100, 80), 20);
  assert.equal(sealedCountFor(30, 25), 12, 'never seals more than 40% of a tiny corpus when the minimum would');
  assert.equal(sealedCountFor(1000, 5), 5);
});

test('pack never contains sealed messages, even identical short replies', () => {
  const recs = corpus(300);
  const { train, sealed } = split(recs, { seed: 'pack' });
  // Plant a train message with the same text as a sealed reply.
  const twin = { ...train[0], id: 'twin-1', text: sealed[0].reply };
  const fp = fingerprint(train);
  const { markdown, sample } = buildPack({ train: [...train, twin], sealed, fp, name: 'Test', maxChars: 20000 });
  for (const s of sealed) {
    for (const id of s.ids) assert.ok(!markdown.includes(`[${id}]`), `sealed id ${id} leaked`);
  }
  assert.ok(!sample.some((r) => r.id === 'twin-1'), 'train message equal to a sealed reply is excluded');
  assert.ok(markdown.length <= 20000 + 500);
  assert.match(markdown, /## Sample Turns/);
});

test('punctuation and word counts on hand-checked input', () => {
  assert.deepEqual(punctuation('Wait... what?! Fine, ok. See https://a.b/c.d — done; yes: no…'), {
    period: 1, comma: 1, exclamation: 1, question: 1, ellipsis: 2, dash: 1, semicolon: 1, colon: 1,
  });
  assert.deepEqual(words("I don’t know, it's 2 AM"), ['i', "don't", 'know', "it's", '2', 'am']);
});

test('feature values on hand-checked messages', () => {
  const f = features(['hey im here lol', 'OK. See you soon!', 'dont worry 😂😂', 'What time? https://example.com']);
  assert.equal(f.msgWords, (4 + 4 + 2 + 2) / 4);
  assert.equal(f.lowercaseStartRate, 2 / 4);
  assert.equal(f.questionMsgRate, 1 / 4);
  assert.equal(f.exclamationMsgRate, 1 / 4);
  assert.equal(f.linkMsgRate, 1 / 4);
  assert.equal(f.emojiMsgRate, 1 / 4);
  assert.equal(f.laughMsgRate, 2 / 4);
  // contractions: "im" and "dont" (both without apostrophe) out of 12 words
  assert.equal(f.contractionRate, 2 / 12);
  assert.equal(f.apostropheDropRate, 1);
  // ALL-CAPS words with 2+ letters: "OK" out of cased words with 2+ letters
  // (hey, im, here, lol, OK, See, you, soon, dont, worry, What, time) = 1/12
  assert.equal(f.allCapsWordRate, 1 / 12);
  assert.equal(f.endPunctRate, 2 / 4, 'the link is ignored, so "What time?" ends in punctuation');
});

test('fingerprint finds signature phrases, openers and closers', () => {
  const recs = [
    'no worries at all mate', 'honestly no worries at all', 'ok no worries at all', 'cheers mate', 'see you later mate',
    'honestly cannot wait', 'honestly the best', 'love it mate',
  ].map((text, i) => ({ id: `m${i}`, text, source: 's' }));
  const phrases = signaturePhrases(recs);
  assert.equal(phrases[0].phrase, 'no worries at all');
  assert.equal(phrases[0].messages, 3);
  const { openers, closers } = openersClosers(recs);
  assert.equal(openers[0].token, 'honestly');
  assert.equal(closers[0].token, 'mate');
  const fp = fingerprint(recs);
  assert.equal(fp.messages, 8);
  assert.ok(fp.topFunctionWords.length > 0);
});

test('fingerprint and features do not crash on non-English text', () => {
  const recs = ['Привет, как дела?', 'これはテストです。', 'مرحبا بك!', '你好，我们明天见吧', 'Γεια σου φίλε 😀'].map((text, i) => ({ id: `n${i}`, text, source: 's' }));
  const fp = fingerprint(recs);
  assert.equal(fp.messages, 5);
  assert.ok(fp.englishShare < 0.05);
  assert.ok(fp.features.msgChars > 0);
  assert.ok(fp.features.questionMsgRate > 0);
  assert.ok(englishShare(recs.map((r) => r.text)) < 0.05);
});

test('a reply that is the context of another message is never sealed (self-threads, own Slack threads, quoted mail)', () => {
  // 40 threads of 3: each message after the first answers the user's own previous one,
  // so its context is the user's own words, as in an X self-thread.
  const recs = [];
  let n = 0;
  for (let th = 0; th < 40; th++) {
    let prev = null;
    for (let j = 0; j < 3; j++) {
      const text = `thread ${th} part ${j} with enough words in it #${n}`;
      recs.push({ id: `x-${n}`, ts: new Date(Date.UTC(2026, 0, 1) + n * 3600e3).toISOString(), source: 'x', author: 'me', text, context: prev, turn: `t-${n}`, thread: 'x' });
      prev = text;
      n++;
    }
  }
  const { train, sealed } = split(recs, { seed: 'self-thread' });
  assert.ok(sealed.length > 0);
  const fp = fingerprint(train);
  const { markdown } = buildPack({ train, sealed, fp, name: 'Me' });
  for (const s of sealed) {
    const tag = s.reply.match(/#\d+/)[0];
    const re = new RegExp(`${tag}(?![0-9])`);
    assert.ok(!re.test(markdown), `sealed reply ${tag} is shown in the pack`);
    for (const o of sealed) assert.ok(!re.test(o.context), `sealed reply ${tag} is shown in another test prompt`);
  }
});

test('writers of Japanese or Chinese, and emoji-heavy writers, still get a sealed test set', () => {
  const mk = (texts) => texts.map((t, i) => ({ id: `r-${i}`, ts: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(), source: 'wa', author: 'me', text: t, context: `question ${i}?`, turn: `t-${i}`, thread: 'x' }));
  const ja = ['了解です！', 'ありがとう〜', '明日は無理かも', 'いいね！行こう', 'ごめん、遅れる', 'また連絡するね'];
  const emoji = ['😂😂😂', '🙌🙌', '😭😭😭', '❤️🔥🙏', '👀'];
  assert.ok(split(mk(Array.from({ length: 60 }, (_, i) => ja[i % ja.length])), { seed: 'ja' }).sealed.length >= 15);
  assert.ok(split(mk(Array.from({ length: 60 }, (_, i) => emoji[i % emoji.length])), { seed: 'em' }).sealed.length >= 15);
  assert.equal(split(mk(Array.from({ length: 60 }, () => 'ok')), { seed: 'ok' }).sealed.length, 0, 'one-word replies are still not test items');
});

test('fingerprint reports bursts, how messages end, opener casing and laughter in other languages', () => {
  const recs = [];
  const add = (turn, text) => recs.push({ id: `r-${recs.length}`, ts: null, source: 'wa', author: 'me', text, context: null, turn, thread: 'x' });
  add('t1', 'I can do Saturday - bring the boat ahah');
  add('t1', 'And snacks!');
  add('t2', 'I think so ahah');
  add('t3', 'I am not sure?');
  add('t3', 'jajaja ok');
  add('t4', 'I will be there. See you');
  const fp = fingerprint(recs);
  assert.deepEqual(fp.bursts, { turns: 4, one: 0.5, two: 0.5, threePlus: 0, mean: 1.5 });
  assert.equal(fp.endings.exclamation, round3(1 / 6));
  assert.equal(fp.endings.question, round3(1 / 6));
  assert.equal(fp.endings.period, 0);
  assert.equal(fp.openers[0].token, 'I', 'shown in the casing the writer uses');
  assert.ok(fp.shorthand.some((s) => s.word === 'ahah'));
  assert.ok(!fp.topicWords.some((t) => t.word === 'ahah'), 'laughter is not a topic');
  assert.equal(features(['jajaja ok']).laughMsgRate, 1);
  function round3(x) {
    return Math.round(x * 1000) / 1000;
  }
});
