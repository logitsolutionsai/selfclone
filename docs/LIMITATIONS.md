# Limitations

## Style Scoring

- **Surface style only.** Every number selfclone produces (the fidelity score, voicecheck, lint advice, the passport, drift) counts surface habits: length, punctuation, casing, emoji, contractions, function words. None of them checks facts, opinions or meaning, and none is evidence of who wrote a text.
- **Not an AI-text detector and not an authorship verifier.** A model can match your habits and a person can drift from them.
- **Short text is unreliable.** Voicecheck reports low confidence under 40 words; lint gives no style advice under 40 words of prose.
- **Thin channels are blended.** A channel with fewer than 30 messages in 10 conversations is blended with its parent; the profile and the private card say so.
- **English bias.** The function-word list is English; character-level features work for any script.
- **The segmenter is not a full Markdown parser.** Nested constructs it does not support (some MDX, multi-line JSX, unusual HTML blocks) are protected and reported as warnings rather than checked.
- **Technical tokens are found by patterns.** A token the patterns miss is checked like prose; a word that looks like a path or an identifier is protected even when it is prose.
- **The voice delta protects tokens, not claims.** A rewrite can keep every token and still change what a sentence says.
- **Drift is exploratory.** Twelve features are tested at once; intervals come from a bootstrap over conversations, which assumes conversations are roughly independent.
- **Performance.** Measured on one Windows 11 development machine (see [VOICE-CI.md](VOICE-CI.md#performance)); a slower CI runner will take longer.

## Media Interpolation

- **The face is one frame warped in 2D.** Head turns are capped, the drawn mouth (from a photo) looks cartoonish, and a clip only covers the mouth shapes it caught; see [The Face](../README.md#the-face).

## Explainer Videos

- **2D, not hand animation.** Arms and legs rotate flat; a head turn is a shift of the features with the nose,
  ears and hair following, not a redrawn profile; walking is a procedural cycle facing the camera. There is no full-body acting beyond the seven gestures.
- **Likeness is a caricature.** Proportions and colours come from the photo; hair is one of twelve styles and the
  outfit one of five, chosen by hand or by Claude.
- **Gestures follow words, not meaning.** Without cues a character picks gestures and moods from keywords in its
  own lines; it does not understand them.
- **Lip sync is English-first.** The mouth shapes come from phonemes (the espeak-based phonemizer that comes with
  kokoro-js), or from an English letter table without it, aligned to the voice's pauses and opened by its
  loudness. Phonemes are timed by typical lengths within each clause, not measured from the audio.
- **Recorded narration** is split into sentences at its longest pauses near where the text expects them; a
  recording that runs sentences together without pauses falls back to timing by text length.
- **Manim is optional and runs your Python.** A scene's Manim code runs as a normal Python program on your
  machine, so only render scene files you trust. LaTeX cannot read paths with spaces, so on Windows profiles with a
  space in the name the frames are rendered under `%ProgramData%\selfclone\manim`.
- **Storyboard warnings are estimates.** Item sizes are guessed from the viewBox and font size, so a warning can
  be a false alarm, and two items on the same centre are assumed to be layered on purpose.
- **Painted backdrops need an OpenAI key** and send the prompt to OpenAI; everything else runs locally.
- **Speed.** About 15 to 25 frames a second at 1280 x 720 with six workers on one laptop CPU.
