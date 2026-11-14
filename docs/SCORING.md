# How The Score Works

The Style match score answers one question: **does this set of replies look, statistically, like a sample of
your own replies?** It is computed by counting words and characters. No language model grades anything, and
the same inputs always give the same number.

## The Test Set

`selfclone ingest` seals about 15% of your reply turns (at least 20 when you have them) before anything else
happens. A sealed turn is a message someone sent you plus everything you sent back. The clone is distilled
only from the training turns and never sees the sealed replies; `selfclone test prompts` hands out only the
messages you were replying to. A reply that is itself the context of another message (an X self-thread, a mail
quoting your earlier mail) is never sealed, because the pack or another prompt would show it. A SHA-256 of the
sealed file is stored at split time and checked at scoring time.

With few messages the sealed share is larger: the count is `max(min(20, 0.4 x turns), round(0.15 x turns))`,
so 25 turns seal 10 and 50 turns seal 20.

Three reply sets are scored against the same model of your style:

| Set | What it is | Why |
| --- | --- | --- |
| Real | your own sealed replies | the ceiling: what a perfect clone would score |
| Clone | replies from a fresh agent that loaded only the clone skill | the result |
| Bare | replies from a fresh agent with no skill | the floor: what a model does without your data |

## The Style Model

Let `n` be the number of sealed prompts answered. From your training turns (replies with context when there
are at least `max(3n, 60)` of them, otherwise all turns) the scorer draws `B = 200` seeded samples of `n` turns
without replacement (with replacement when there are no more than `n` training turns). For each sample it computes:

- **Function-word frequencies** `f(w)`: the share of word tokens that are `w`, for the fixed list of English
  function words in `src/functionwords.mjs` that you actually use. If fewer than 15% of your words are English
  function words, the 100 most frequent words of your own corpus are used instead.
- **Feature vector** `x(k)`: 26 features from `src/text.mjs`: characters, words and sentence length per message,
  letters per word; periods, commas, exclamation marks, question marks, ellipses, dashes, semicolons, colons,
  emoji and digits per 1,000 characters; and the shares of messages that start lowercase, contain a question
  mark, an exclamation mark, emoji, a link, laughter, several lines, or end in punctuation; plus the shares of
  ALL-CAPS words, uppercase letters, contractions and contractions written without an apostrophe.

The means `mu` and standard deviations `sigma` over the 200 samples describe a genuine n-reply sample from you.
Each `sigma` has a floor (0.0005 for word frequencies; 0.01 for rates, 0.25 per 1,000 characters, 0.5 words, 2
characters, 0.05 letters) so a habit you never vary does not make the score explode.

## The Distance

For a reply set `X`:

```
z_w = (f_X(w) - mu_w) / sigma_w              for each function word w
z_k = (x_X(k) - mu_k) / sigma_k              for each feature k
each |z| is capped at 5

Delta(X) = mean over w of |z_w|              Burrows' Delta against your centroid (reported)
W(X)     = sqrt(mean over w of z_w^2)        word distance
F(X)     = sqrt(mean over k of z_k^2)        feature distance
D(X)     = (W(X) + F(X)) / 2                 (D = F when fewer than 20 function words are in use)
```

Burrows' Delta is the mean absolute z-score difference over frequent function words. Here the comparison
point is the centroid of your own samples rather than another single text, and `sigma` is your own natural
spread at the same sample size. The score itself uses the root mean square instead of the mean so that a few
large drifts, such as capitalising every message when you never do, are not averaged away by twenty features
that match.

The report also gives "Delta to your real replies", the classic pairwise Delta between a set and your sealed
replies, using the same z-scaling.

## From Distance To Percent

The same distance computed for each of the 200 bootstrap samples gives the baseline `m0`: how far a genuine
sample of your replies typically sits from your centroid. Then:

```
Style match % = 100 * 2^( -( max(0, D - m0) / H )^2 ),   H = 1.0
```

- At or below your own baseline the score is 100%.
- At one unit of distance above the baseline it is 50%.
- At two units it is about 6%.

`H = 1.0` was chosen so that, on the synthetic authors below, held-out text from the same author lands near the
top, text from a very different author lands low, and a near miss lands in between.

## Calibration Evidence

The unit tests generate two synthetic authors from phrase banks (`tests/unit/synth.mjs`): a casual one
(lowercase, no full stops, emoji, "lol", dropped apostrophes, short) and a formal one (capitals, full sentences,
semicolons, long, no emoji). The model is built from 400 casual messages. Reproduce with
`node docs/calibration.mjs`:

| Sealed prompts n | Baseline m0 | Same author, held out | Near miss (capitals and full stops added) | Different author |
| --- | --- | --- | --- | --- |
| 10 | 0.81 | 100.0% (D 0.70) | 75.5% (D 1.45) | 22.0% (D 2.29) |
| 20 | 0.80 | 96.1% (D 1.04) | 64.9% (D 1.59) | 11.5% (D 2.56) |
| 30 | 0.79 | 100.0% (D 0.69) | 65.4% (D 1.58) | 8.4% (D 2.68) |
| 60 | 0.77 | 98.3% (D 0.93) | 74.8% (D 1.42) | 2.2% (D 3.12) |

The tests assert: for n = 10, 20 and 40 on the casual model, same author at least 85%, different author at
most 30%, and Burrows' Delta lower for the same author; the same thresholds at n = 20 on the formal model; and
at n = 20 the near miss strictly between the two. These are synthetic authors with very different styles; two real people who text alike will be much
closer, and the score will separate them less.

In the worked example (`examples/maya/`, a fictional persona, 20 sealed prompts) the first-pass clone scored
89%, the bare model 41%, and the persona's own held-out replies 99%.

## Tried And Not Kept: Character N-grams

In both examples the word distance W did not separate the clone from the bare model; the features did all the
work. A character n-gram component was tested as a fix: the profile of your 100 most frequent character 3- and
4-grams, the cosine distance of a reply set's profile from yours, z-scored against the 200 bootstrap samples of
your own replies (capped at 5), averaged in as a third part, `D' = (W + F + C) / 3`. Reproduce with
`node docs/ngram-experiment.mjs`. Each cell is today's score / with C at `H = 1.0` / with C at `H = 1.5`:

| Synthetic authors, n | Same author | Near miss | Different author |
| --- | --- | --- | --- |
| 10 | 100.0% / 94.6% / 97.5% (C 1.83) | 75.5% / 97.6% / 98.9% (C 0.06) | 22.0% / 1.9% / 17.1% (C 5.00) |
| 20 | 96.1% / 97.9% / 99.1% (C 0.81) | 64.9% / 48.1% / 72.2% (C 2.27) | 11.5% / 1.0% / 12.6% (C 5.00) |
| 30 | 100.0% / 100.0% / 100.0% (C 0.10) | 65.4% / 57.1% / 78.0% (C 1.88) | 8.4% / 0.7% / 11.0% (C 5.00) |
| 60 | 98.3% / 98.5% / 99.3% (C 0.90) | 74.8% / 9.6% / 35.2% (C 5.00) | 2.2% / 0.2% / 6.6% (C 5.00) |

| Maya example (20 sealed prompts) | Own held-out replies | Clone | Bare model |
| --- | --- | --- | --- |
| Style match | 98.6% / 92.0% / 96.4% | 88.5% / 46.4% / 71.1% | 41.4% / 3.8% / 23.3% |
| Word distance W | 1.33 | 1.37 | 1.28 |
| Feature distance F | 0.77 | 1.29 | 2.79 |
| Character n-gram C | 1.49 | 3.05 | 5.00 |

On its own, C orders the Maya sets correctly where W does not (1.49, 3.05, 5.00 against 1.33, 1.37, 1.28), and
it pins the different synthetic author at the cap. Averaged into the score it did not earn its place:

- At `H = 1.0` it lowers the same-author ceiling (Maya's own held-out replies 98.6% to 92.0%, the synthetic
  author at n = 10 100% to 94.6%) and makes the near miss at n = 10 look like the same author (97.6%).
- Recalibrated to `H = 1.5`, the ceiling mostly recovers (96.4%), but the different author scores about what it
  scores today (11% to 17% against 8% to 22%), and the near miss at n = 10 still sits at 98.9%.
- The clone against the bare model on Maya: 47 points apart today, 43 points at `H = 1.0`, 48 at `H = 1.5`. No
  real gain. The clone drops 17 to 42 points, partly because character n-grams also carry topic: Maya's own
  held-out replies, on other subjects than her training sample, sit at C = 1.49.

So Style match stays `D = (W + F) / 2`. Two synthetic authors and one fictional persona are too little evidence
to tune a third component on, and a score that docks a person's own replies is worse than one that cannot
tell a clone from a bare model by words alone.

## The Drift Table

For every feature the report lists your mean, your real sealed replies, the clone and the bare model, with
the clone's and the bare model's z. Rows beyond `|z| > 2` are flagged as drift. The function-word table lists
the words whose frequency moved most. Use them to fix `voice.md`, then test again with a fresh subagent; stop
after two rounds, because tuning against the same sealed prompts overfits them.

## What It Does Not Measure

- **Content.** A reply with your exact style and the opposite opinion scores the same. The score does not know
  what you think, what you know, or what you would actually say.
- **Whether people would be fooled.** That is what the Can You Tell game is for.
- **Small samples well.** With fewer than about 20 sealed prompts, or very short replies, the function-word
  part is noisy. In the worked example the word distance did not separate the clone from the bare model at all;
  the features did. The report warns when `n < 10`.
- **Other languages fully.** Character-level features work for any script; the function-word list is English,
  and the fallback (your most frequent words) also picks up topic words.
- **Gaming.** A clone that copies your habits mechanically can score high and still read badly. Read the replies.

## Integrity Checks

- `sealed.jsonl` is hashed at split time; `test prompts` and `test score` refuse to run if it changed.
- The pack builder refuses to write a pack that cites a sealed id.
- The report warns when clone replies are verbatim copies of sealed replies (four words or more), which
  means the clone saw the test set.
