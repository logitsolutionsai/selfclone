// Prints the calibration table in docs/SCORING.md from the synthetic authors
// used by the unit tests. Run: node tools/calibration.mjs
import { buildModel, scoreTexts } from '../src/score.mjs';
import { synthTexts } from '../tests/unit/synth.mjs';

const trainA = synthTexts('casual', 400, 'trainA');
const fmt = (s) => `${s.match.toFixed(1)}% (D ${s.D.toFixed(2)})`;
console.log('| Sealed prompts n | Baseline m0 | Same author, held out | Near miss (capitals and full stops added) | Different author |');
console.log('| --- | --- | --- | --- | --- |');
for (const n of [10, 20, 30, 60]) {
  const model = buildModel(trainA, { n, seed: 's' });
  const same = scoreTexts(model, synthTexts('casual', n, 'heldA' + n));
  const near = scoreTexts(model, synthTexts('casual', n, 'p' + n).map((t) => t[0].toUpperCase() + t.slice(1) + '.'));
  const other = scoreTexts(model, synthTexts('formal', n, 'heldB' + n));
  console.log(`| ${n} | ${model.m0.toFixed(2)} | ${fmt(same)} | ${fmt(near)} | ${fmt(other)} |`);
}
