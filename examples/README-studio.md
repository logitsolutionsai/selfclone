# Studio Examples

Eleven explainers. Render any of them with `selfclone explainer <file> --preview` (stills and storyboard
warnings) and then without `--preview` (the video and its captions).

## Showcase

The ten videos at the top of the [README](../README.md), one per field. `showcase/make.py` writes the scene files
(`python examples/showcase/make.py`); the three `_*.base.json` files are the hand-written scenes it starts from for
medicine, maths and physics. Every film ends on a "Made with selfclone" card and has a generated ambient music bed.

| File | Field | Host | What it shows |
| --- | --- | --- | --- |
| [`neural-networks.json`](showcase/neural-networks.json) | AI | one random host | neurons that weigh their inputs, a wrong first guess, a loss curve that falls, backpropagation |
| [`aerospace.json`](showcase/aerospace.json) | aerospace | a captain and a passenger who walks in | the four forces, a wing bending the air down, a lift-against-speed chart |
| [`finance.json`](showcase/finance.json) | finance | one random host | compound interest in coins, a thirty-year bar chart, the rule of 72 in Manim |
| [`medicine.json`](showcase/medicine.json) | medicine | a nurse and a full-body guest | a dialogue in two voices, a wanted poster drawn stroke by stroke, an antibody chart, bubbles |
| [`maths.json`](showcase/maths.json) | maths | nobody, a narrator | a visual proof of a² + b² = c² in Manim, then a builders' 3-4-5 corner |
| [`english.json`](showcase/english.json) | English | a teacher and a student | who or whom at a chalkboard, solved with the he-or-him test |
| [`neurology.json`](showcase/neurology.json) | neurology | one random host | a counter to 86 billion, a pulse racing down the axon, a synapse |
| [`philosophy.json`](showcase/philosophy.json) | philosophy | a guide and a sailor | the Ship of Theseus, plank by plank, then a second ship from the old planks |
| [`physics.json`](showcase/physics.json) | physics | one random host | why the sky is blue, as a vertical short: render with `--aspect 9:16` |
| [`astronomy.json`](showcase/astronomy.json) | astronomy | nobody, a narrator | the 23.5° tilt in Manim, direct and spread-out sunlight, London and Sydney |

All the hosts are random fictional people (`random:<seed>`), each with a stock Kokoro voice. Finance, maths and
astronomy need Manim (`pip install manim`, plus LaTeX for the equations).

## Your Own Character

[`explainer/`](explainer/) is a one-minute explainer about why some atoms glow, hosted by you. It needs your
character first (`selfclone character --photo me.jpg --consent "..."`) or `--character` pointing at one; see its
[README](explainer/README.md). Its half-life scene needs Manim.
