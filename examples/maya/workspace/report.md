# Clone Fidelity Report: Maya Okafor

**Style match 89% (bare model 41%).** Your own held-out replies score 99% on the same scale.

Scored 20 sealed prompts. The sealed replies were set aside before distillation and never shown to the clone. No language model graded anything; every number below comes from counting words and characters.

## Scores

| Reply set | Style match | Distance D | Word distance W | Feature distance F | Burrows Delta | Delta to your real replies | Mean words |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Your real held-out replies (ceiling) | 98.6% | 1.049 | 1.327 | 0.77 | 1.04 | 0 | 16.1 |
| Clone | 88.5% | 1.328 | 1.368 | 1.288 | 1.058 | 1.1 | 17.3 |
| Bare model | 41.4% | 2.035 | 1.279 | 2.79 | 1.013 | 1.097 | 19.1 |

Baseline: random samples of 20 of your own training replies sit at D = 0.907 (spread 0.113). Style match is 100% at or below that baseline and halves for every 1 of extra distance. Reference: 89 train replies with context, 200 bootstrap samples, 105 english-function-words.

## Where The Clone Drifts

z is how many of your natural spreads the clone sits from your average. Rows marked "drift" are beyond 2.

| Feature | You (mean) | Your real replies | Clone | Clone z | Bare | Bare z | Flag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Messages with laughter (lol, haha, ahah, jaja, kkkk) | 26.7% | 30% | 60% | 4.09 | 5% | -2.67 | drift |
| Multi-line messages | 69.3% | 80% | 100% | 3.47 | 0% | -7.82 | drift |
| Periods per 1k chars | 1.72 | 2.56 | 0 | -2.23 | 18.01 | 21.19 | drift |
| Words per sentence | 7.4 | 6.85 | 6.41 | -1.73 | 7.47 | 0.12 |  |
| Messages starting lowercase | 98.1% | 95% | 95% | -1.19 | 0% | -37.37 |  |
| Commas per 1k chars | 7.49 | 8.33 | 9.22 | 1.01 | 10.01 | 1.47 |  |
| Digits per 1k chars | 6.86 | 12.18 | 4.61 | -0.93 | 2.5 | -1.79 |  |
| Letters per word | 3.87 | 3.75 | 3.95 | 0.82 | 4.03 | 1.69 |  |
| Messages with emoji | 21.2% | 15% | 15% | -0.71 | 0% | -2.45 |  |
| Emoji per 1k chars | 2.43 | 1.92 | 1.73 | -0.67 | 0 | -2.35 |  |
| Question marks per 1k chars | 1.13 | 1.28 | 0.58 | -0.64 | 3 | 2.14 |  |
| Messages with a question mark | 8.7% | 10% | 5% | -0.6 | 25% | 2.62 |  |
| Messages with an exclamation mark | 24.4% | 20% | 20% | -0.57 | 40% | 2.03 |  |
| Colons per 1k chars | 0.12 | 0 | 0 | -0.48 | 1 | 3.52 |  |
| Words per message | 17.77 | 16.05 | 17.3 | -0.26 | 19.05 | 0.7 |  |
| Messages ending in punctuation | 5.9% | 5% | 5% | -0.18 | 100% | 18.8 |  |
| Characters per message | 88.39 | 78 | 86.8 | -0.17 | 99.95 | 1.24 |  |
| Contractions per word | 1.9% | 1.9% | 2% | 0.14 | 3.9% | 2.06 |  |
| Exclamation marks per 1k chars | 4.45 | 3.85 | 4.61 | 0.09 | 5 | 0.33 |  |
| ALL-CAPS words | 0.4% | 0.7% | 0.3% | -0.09 | 0% | -0.4 |  |
| Uppercase share of letters | 0.4% | 0.4% | 0.3% | -0.09 | 3.8% | 3.46 |  |
| Ellipses per 1k chars | 0 | 0 | 0 | 0 | 0.5 | 2 |  |
| Dashes ( - , –, —) per 1k chars | 0 | 0 | 0 | 0 | 0 | 0 |  |
| Semicolons per 1k chars | 0 | 0 | 0 | 0 | 0 | 0 |  |
| Contractions without apostrophe | 100% | 100% | 100% | 0 | 0% | -100 |  |
| Messages with a link | 0% | 0% | 0% | 0 | 0% | 0 |  |

## Function Words With The Largest Drift

| Word | You per 1k words | Clone per 1k words | z |
| --- | --- | --- | --- |
| are | 1.42 | 11.56 | 5.96 |
| just | 1.75 | 11.56 | 5.25 |
| with | 3.9 | 14.45 | 3.7 |
| what | 3.14 | 11.56 | 3.26 |
| at | 5.32 | 14.45 | 2.59 |
| i | 32.56 | 11.56 | -2.56 |
| no | 4.22 | 11.56 | 2.42 |
| my | 7.31 | 0 | -2.25 |
| about | 9.01 | 0 | -2.09 |
| off | 0.55 | 2.89 | 2.07 |
| our | 0.57 | 2.89 | 2.05 |
| has | 0.6 | 2.89 | 1.98 |

## What This Measures And What It Does Not

- It measures surface style: length, punctuation, casing, emoji, contractions, laughter, links and how often you use common function words.
- It does not measure whether the clone says what you would say, holds your opinions, knows your facts, or would fool someone who knows you. Use the Can You Tell game for that.
- A high score can be gamed by copying your habits mechanically. Read the replies too.
