// Synthetic authors for scorer tests. Two clearly different styles built from
// phrase banks with a seeded random generator. Not real people.
import { rng } from '../../src/util.mjs';

const pick = (r, a) => a[Math.floor(r() * a.length)];

const CASUAL = {
  open: ['lol', 'omg', 'ok so', 'yeah', 'haha', 'wait', 'ugh', 'nah', 'ya', 'hmm'],
  core: [
    'im so tired of this week', 'u coming tonight or nah', 'dont even ask about the bus', 'that was so funny',
    'i literally just woke up', 'cant believe she said that', 'we should get tacos after', 'my phone is dying again',
    'thats wild', 'idk maybe later', 'send me the pic', 'i love that song so much', 'ok see u there',
    'no way thats true', 'its fine its fine', 'gonna be late sorry', 'im down', 'who even does that',
    'the cat knocked my coffee over', 'brb getting food', 'we need a beach day fr', 'that movie was mid tbh',
  ],
  close: ['', '', '', ' lol', ' 😂', ' 😭', ' !!', ' haha', ' 💀', ' fr'],
};

const FORMAL = {
  open: ['Thank you for the update.', 'Good morning.', 'I have reviewed the document.', 'Understood.', 'To be clear,', 'In my view,'],
  core: [
    'However, I think we should revisit the timeline before we commit to anything further.',
    'The proposal is sound; nevertheless, the budget section requires a more careful analysis.',
    'I would recommend that we schedule a meeting with the whole team on Thursday afternoon.',
    'Please note that the figures in the second table do not match the summary on the first page.',
    'It is important that we document every decision, so that the rationale remains clear later.',
    'Therefore, I propose that we postpone the launch until the remaining issues have been resolved.',
    'The committee has asked for a revised draft, which I will circulate by the end of the week.',
    'In addition, the report should include a section on risks, mitigation and responsibilities.',
    'I appreciate your patience; the delay was caused by a dependency outside of our control.',
    'Furthermore, the analysis suggests that the current approach will not scale beyond next year.',
  ],
  close: ['', ' Kind regards.', ' Thank you.', ' Best wishes.', ''],
};

function casualMessage(r) {
  let s = '';
  if (r() < 0.5) s += pick(r, CASUAL.open) + ' ';
  s += pick(r, CASUAL.core);
  if (r() < 0.35) s += ' ' + pick(r, CASUAL.core);
  s += pick(r, CASUAL.close);
  return s;
}

function formalMessage(r) {
  let s = '';
  if (r() < 0.6) s += pick(r, FORMAL.open) + ' ';
  s += pick(r, FORMAL.core);
  if (r() < 0.5) s += ' ' + pick(r, FORMAL.core);
  s += pick(r, FORMAL.close);
  return s.trim();
}

const PROMPTS = ['are you free later?', 'did you see the news', 'what do you think?', 'can you send the file', 'how was the weekend', 'thoughts on the plan?'];

export function synthRecords(style, n, seed) {
  const r = rng(seed);
  const gen = style === 'casual' ? casualMessage : formalMessage;
  const out = [];
  for (let i = 0; i < n; i++) {
    const ctx = r() < 0.7 ? pick(r, PROMPTS) : null;
    out.push({
      id: `${style}-${seed}-${i}`,
      ts: new Date(Date.UTC(2024, 0, 1) + i * 3600e3).toISOString(),
      source: 'synthetic',
      author: style,
      text: gen(r),
      context: ctx,
      turn: `t-${style}-${seed}-${i}`,
    });
  }
  return out;
}

export function synthTexts(style, n, seed) {
  return synthRecords(style, n, seed).map((x) => x.text);
}
