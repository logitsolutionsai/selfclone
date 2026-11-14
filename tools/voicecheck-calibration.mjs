// Calibration for `selfclone voicecheck`: how many words a draft needs before
// the voice match separates the same author from a different one, and whether
// the function-word part (W) helps or hurts at that length.
//
//   node tools/voicecheck-calibration.mjs
//
// Two data sets:
// 1. the synthetic authors from tests/unit/synth.mjs (casual model, casual held-out
//    drafts against formal drafts), as in tools/calibration.mjs;
// 2. the Maya example: her own held-out replies against the bare model's replies
//    to the same 20 sealed prompts (examples/maya/workspace/).
// Each draft is k replies drawn with a seeded generator; every row is 100 drafts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voicecheck } from '../src/voicecheck.mjs';
import { readJsonl, rng, quantile, round } from '../src/util.mjs';
import { parseReplies } from '../src/score.mjs';
import { synthRecords, synthTexts } from '../tests/unit/synth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRIALS = 100;

function run(label, train, same, other, ks) {
  console.log(`\n${label}`);
  console.log('| Replies k | Mean words | Same author median (F / W+F) | Other author median (F / W+F) | Correct order (F / W+F) | Same >= 80 (F) | Other < 50 (F) |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const k of ks) {
    const r = rng(`cal:${label}:${k}`);
    const draw = (pool) => Array.from({ length: k }, () => pool[Math.floor(r() * pool.length)]);
    const res = { sF: [], sD: [], oF: [], oD: [], words: [] };
    let orderF = 0;
    let orderD = 0;
    for (let t = 0; t < TRIALS; t++) {
      const a = draw(same);
      const b = draw(other);
      const aF = voicecheck({ train, draft: a, kind: 'message', wordPart: false });
      const bF = voicecheck({ train, draft: b, kind: 'message', wordPart: false });
      const aD = voicecheck({ train, draft: a, kind: 'message', wordPart: true });
      const bD = voicecheck({ train, draft: b, kind: 'message', wordPart: true });
      res.sF.push(aF.voiceMatch);
      res.oF.push(bF.voiceMatch);
      res.sD.push(aD.voiceMatch);
      res.oD.push(bD.voiceMatch);
      res.words.push(aF.draft.words);
      if (aF.voiceMatch > bF.voiceMatch) orderF++;
      if (aD.voiceMatch > bD.voiceMatch) orderD++;
    }
    const med = (xs) => round(quantile(xs, 0.5), 1);
    const share = (xs, f) => `${Math.round((100 * xs.filter(f).length) / xs.length)}%`;
    console.log(
      `| ${k} | ${round(res.words.reduce((x, y) => x + y, 0) / TRIALS, 0)} | ${med(res.sF)}% / ${med(res.sD)}% | ${med(res.oF)}% / ${med(res.oD)}% | ${Math.round((100 * orderF) / TRIALS)}% / ${Math.round((100 * orderD) / TRIALS)}% | ${share(res.sF, (x) => x >= 80)} | ${share(res.oF, (x) => x < 50)} |`
    );
  }
}

// 1. Synthetic authors.
const synthTrain = synthRecords('casual', 400, 'trainA');
run('Synthetic: casual author model, casual held-out against formal', synthTrain, synthTexts('casual', 400, 'vc-same'), synthTexts('formal', 400, 'vc-other'), [1, 2, 3, 5, 10, 20]);

// 2. Maya.
const W = path.join(root, 'examples', 'maya', 'workspace');
const train = readJsonl(path.join(W, 'train.jsonl'));
const sealed = readJsonl(path.join(W, 'sealed.jsonl'));
const bare = parseReplies(fs.readFileSync(path.join(W, 'bare-replies.json'), 'utf8'));
run('Maya: her held-out replies against the bare model replies', train, sealed.map((s) => s.reply), sealed.map((s) => bare.get(s.id)), [1, 2, 3, 5, 10, 20]);
