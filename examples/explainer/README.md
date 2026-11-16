# Example Explainer: Why Do Some Atoms Glow?

A one-minute explainer in eight scenes that uses most of what the studio can do:

- **Host.** It rises in and waves hello, points as a word is written, presents with both arms, thinks, then
  explains. It is surprised by the twist and waves goodbye. It glances at each new item, nods on stressed words,
  blinks and breathes.
- **Props.** A photographic plate, a nucleus and a gamma ray that draw themselves stroke by stroke. A shaking
  (unstable) nucleus and particles that fly out. Half-life bars that slide up one after another. Floating and
  bobbing icons.
- **Camera and scenes.** Camera paths with several keys. Push, wipe, zoom, iris and fade transitions. Scenery
  (bokeh, a lab room, stars, graph paper, hills, clouds) that moves slower than the camera, with dust and
  sparkles in front.
- **Sound.** Synthesised sound effects for every pop, whoosh and pencil stroke.

`scenes.json` is the scene file. `make-scenes.py` writes it, with the props drawn as small SVGs in code
(`python make-scenes.py scenes.json`).

Make your own character first, then render with it as the host:

```bash
selfclone character --photo me.jpg --consent "This is my own face. Your Name" --name "Your Name" --hair short
selfclone explainer examples/explainer/scenes.json --character .selfclone/character.json --preview
selfclone explainer examples/explainer/scenes.json --character .selfclone/character.json
```

The narration (130 words, Kokoro `af_heart`) runs about 60 seconds with the scene holds. On a Windows laptop CPU
the render takes about a minute and a half with six workers once the voice model is downloaded. The half-life
scene needs Manim for its formula (`pip install manim`, plus LaTeX).
