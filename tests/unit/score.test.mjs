import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, scoreTexts, score, matchPercent, parseReplies, reportMarkdown, pairwiseDelta } from '../../src/score.mjs';
import { synthTexts, synthRecords } from './synth.mjs';

const trainA = synthTexts('casual', 400, 'trainA');
const trainB = synthTexts('formal', 400, 'trainB');

test('match mapping: 100 at or below baseline, 50 at one unit above, monotone', () => {
  assert.equal(matchPercent(0.5, 0.8), 100);
  assert.equal(matchPercent(0.8, 0.8), 100);
  assert.ok(Math.abs(matchPercent(1.8, 0.8) - 50) < 1e-9);
  assert.ok(matchPercent(1.2, 0.8) > matchPercent(1.6, 0.8));
  assert.ok(matchPercent(3.8, 0.8) < 1);
});

test('same author held-out text scores near the top; a different author scores low', () => {
  for (const n of [10, 20, 40]) {
    const model = buildModel(trainA, { n, seed: 't' });
    const sameA = scoreTexts(model, synthTexts('casual', n, `heldA-${n}`));
    const otherB = scoreTexts(model, synthTexts('formal', n, `heldB-${n}`));
    assert.ok(sameA.match >= 85, `n=${n}: same author ${sameA.match.toFixed(1)} should be >= 85`);
    assert.ok(otherB.match <= 30, `n=${n}: different author ${otherB.match.toFixed(1)} should be <= 30`);
    assert.ok(sameA.delta < otherB.delta, 'Burrows Delta ranks the same author closer');
    assert.ok(sameA.D < otherB.D);
  }
});

test('works in both directions (formal author model)', () => {
  const model = buildModel(trainB, { n: 20, seed: 't' });
  const sameB = scoreTexts(model, synthTexts('formal', 20, 'heldB2'));
  const otherA = scoreTexts(model, synthTexts('casual', 20, 'heldA2'));
  assert.ok(sameB.match >= 85, `same ${sameB.match}`);
  assert.ok(otherA.match <= 30, `other ${otherA.match}`);
});

test('a near miss (right words, wrong casing and punctuation) lands between', () => {
  const model = buildModel(trainA, { n: 20, seed: 't' });
  const same = scoreTexts(model, synthTexts('casual', 20, 'nm-same'));
  const near = scoreTexts(model, synthTexts('casual', 20, 'nm-near').map((t) => t[0].toUpperCase() + t.slice(1) + '.'));
  const other = scoreTexts(model, synthTexts('formal', 20, 'nm-other'));
  assert.ok(same.match > near.match && near.match > other.match, `${same.match} > ${near.match} > ${other.match}`);
  const fzLower = near.fz.lowercaseStartRate;
  assert.ok(fzLower < -2, 'the drift shows up on the lowercase-start feature');
});

test('score() ranks real > clone-like > bare-like and builds a report', () => {
  const train = synthRecords('casual', 300, 'score-train');
  const heldReal = synthRecords('casual', 24, 'score-real');
  const sealed = heldReal.map((r, i) => ({ id: `s-${i}`, context: r.context || 'hey?', reply: r.text, ids: [r.id] }));
  const cloneTexts = synthTexts('casual', 24, 'score-clone').map((t, i) => (i % 4 === 0 ? t[0].toUpperCase() + t.slice(1) : t));
  const bareTexts = synthTexts('formal', 24, 'score-bare');
  const clone = new Map(sealed.map((s, i) => [s.id, cloneTexts[i]]));
  const bare = new Map(sealed.map((s, i) => [s.id, bareTexts[i]]));
  const r = score({ train, sealed, clone, bare, seed: 'x' });
  assert.equal(r.answered, 24);
  assert.ok(r.sets.real.styleMatch >= r.sets.clone.styleMatch - 5);
  assert.ok(r.sets.clone.styleMatch > r.sets.bare.styleMatch + 30, `${r.sets.clone.styleMatch} vs ${r.sets.bare.styleMatch}`);
  assert.equal(r.features.length, 26);
  assert.ok(r.wordDrift.length > 0);
  const md = reportMarkdown(r, { name: 'Test' });
  assert.match(md, /Style match \d+% \(bare model \d+%\)/);
  assert.match(md, /What This Measures And What It Does Not/);
  // Determinism
  const r2 = score({ train, sealed, clone, bare, seed: 'x' });
  assert.deepEqual(r2, r);
});

test('score() flags verbatim copies of sealed replies', () => {
  const train = synthRecords('casual', 200, 'copy-train');
  const held = synthRecords('casual', 20, 'copy-held').filter((r) => r.text.split(' ').length >= 4);
  const sealed = held.map((r, i) => ({ id: `s-${i}`, context: 'x?', reply: r.text, ids: [r.id] }));
  const clone = new Map(sealed.map((s) => [s.id, s.reply]));
  const r = score({ train, sealed, clone, bare: new Map() });
  assert.ok(r.warnings.some((w) => /verbatim copies/.test(w)));
});

test('pairwise Delta is zero for identical sets', () => {
  const model = buildModel(trainA, { n: 20, seed: 't' });
  const a = scoreTexts(model, trainA.slice(0, 20));
  assert.equal(pairwiseDelta(model, a, a), 0);
});

test('parseReplies accepts arrays, maps, wrapped arrays and JSONL', () => {
  assert.deepEqual([...parseReplies('[{"id":"a","reply":"x"},{"id":"b","text":"y"}]')], [['a', 'x'], ['b', 'y']]);
  assert.deepEqual([...parseReplies('{"a":"x","b":"  "}')], [['a', 'x']]);
  assert.deepEqual([...parseReplies('{"replies":[{"id":"a","reply":"x"}]}')], [['a', 'x']]);
  assert.deepEqual([...parseReplies('{"id":"a","reply":"x"}\n{"id":"b","reply":"y"}\n')], [['a', 'x'], ['b', 'y']]);
});

test('non-English corpora fall back to most-frequent-word Delta without crashing', () => {
  const ru = ['привет как дела', 'я уже дома', 'ну и что дальше', 'давай завтра', 'всё хорошо спасибо', 'не знаю пока', 'это очень смешно', 'жду тебя у входа'];
  const train = Array.from({ length: 120 }, (_, i) => ru[i % ru.length] + (i % 3 ? '' : ' 🙂'));
  const model = buildModel(train, { n: 10, seed: 'ru' });
  assert.equal(model.vocabKind, 'most-frequent-words');
  const s = scoreTexts(model, ru.slice(0, 8));
  assert.ok(Number.isFinite(s.match));
});

test('parseReplies accepts a code fence or a sentence around the JSON, and explains junk', () => {
  const want = [['s-1', 'hi there']];
  assert.deepEqual([...parseReplies('```json\n[{"id":"s-1","reply":"hi there"}]\n```')], want);
  assert.deepEqual([...parseReplies('Here are the replies:\n[{"id":"s-1","reply":"hi there"}]\nDone.')], want);
  assert.throws(() => parseReplies('no json here'), /not JSON/);
});

test('score() warns when your own held-out replies score low, because the clone number is then rough', () => {
  const mk = (texts, ctx) => texts.map((t, i) => ({ id: `r-${i}`, ts: null, source: 'wa', author: 'me', text: t, context: ctx ? 'q?' : null, turn: `t-${i}`, thread: 'x' }));
  const train = mk(synthTexts('casual', 200, 'low-ceiling'), true);
  // The sealed replies were written in a very different register from the training messages.
  const sealed = synthTexts('formal', 20, 'low-ceiling-sealed').map((reply, i) => ({ id: `s-${i}`, turn: `st-${i}`, source: 'wa', ts: null, context: 'q?', reply, ids: [`x-${i}`] }));
  const clone = new Map(sealed.map((s) => [s.id, s.reply]));
  const r = score({ train, sealed, clone, bare: new Map() });
  assert.ok(r.sets.real.styleMatch < 80);
  assert.ok(r.warnings.some((w) => /held-out replies score only/.test(w)));
});
