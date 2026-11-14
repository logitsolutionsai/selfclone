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
- **Exported videos always carry the AI CLONE label**, by design.
