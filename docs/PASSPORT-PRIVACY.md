# Voice Passport Privacy

The Voice Passport (`selfclone stylecard`) is a presentation of coarse writing tendencies. It is not a stable biometric signature, it is not proof of identity, and it does not say whether a text was written by a person or a model. Every card carries the line "AI-derived writing-style summary; not identity proof."

## What A Public Card Holds

Schema: [`schemas/passport.v1.schema.json`](../schemas/passport.v1.schema.json).

- An evidence band instead of a count: `<100`, `100–499` or `500+` training messages.
- Registers (chat, email, posts, developer discussion, documentation, changelogs, pull requests), each with a coverage word and three buckets: length (very short to long), casing (mostly lowercase, mixed, capitalised) and punctuation (light, moderate, full).
- At most 3 habits, picked from a fixed catalog of phrases by fixed thresholds ("Uses direct questions sparingly"). They are never copied from messages or from a model.
- A list of what the card leaves out, the disclaimer, the tool version, and `projectionDigest`: a SHA-256 over the canonical card itself (keys sorted, strings NFC). The digest lets someone check that two copies of a card are the same card. It is computed over the public projection only, so it reveals nothing about the profile behind it.

A name appears only when you pass `--display-name`; it may not hold a link, an email address, markup or anything the scrubber treats as a secret. Otherwise the title is "My writing style". The consent statement, the consent record id and the profile id are never on a card.

## What A Public Card Never Holds

Message text, names or email addresses from the corpus, links, writing samples, rare phrases or n-grams, function-word vectors, per-person source ids, exact message counts, dates, or any per-feature number. Channels with fewer than 30 messages in 10 conversations are left out of a public card entirely. With fewer than 100 training messages overall, `stylecard --audience public` writes only `passport.json` with `"status": "insufficient_data"` and no card.

## How That Is Enforced

1. The card is built from the private profile (`voice-profile.v1.json`), which itself holds only numbers and enums from the training split.
2. Every string in the card is chosen from fixed lists in `src/passport/project.mjs`: enum values, catalog phrases and labels.
3. Before anything is written, a second check walks the whole card and refuses any string that is not on that allowlist. A failure writes nothing.
4. The tests ingest a synthetic corpus with planted secrets and hostile strings (an API key, a token, an address, a password, an OAuth URL, a third party's name, hidden HTML, an image beacon, zero-width characters, a prompt injection) with scrubbing turned off, and check that none of them reaches the JSON, the HTML, the SVG or the command output.

The scrubber also runs at ingest by default. It is defence in depth, not the guarantee: the allowlist is.

## The Page

`passport.html` is one offline file. Its Content-Security-Policy is `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-...'`, with the hash of its one inline script computed when the page is written. It loads no fonts, images, scripts or trackers and sends nothing. `passport.svg` has no script at all. `passport.png` (with `--png`) is a square screenshot of the card taken by the installed Chrome, Edge or Chromium through `playwright-core`; without a browser the command still writes the HTML and SVG and says why there is no PNG.

## Consent And Revocation

A public card needs consent with the `public-stylecard` scope (`selfclone consent --grant "This is my own writing. <Full Name>" --scope public-stylecard`) and an explicit `--audience public`. Nothing is uploaded. `selfclone consent --revoke public-stylecard` stops future public cards from being made; it cannot recall a card that was already shared.

## Why These Are Heuristics

Bucketing, minimum sample sizes and a short habit list make it hard to recover anything specific from a card by accident. They are not a formal anonymity guarantee. Someone who already holds a large sample of your writing could compare it with your card, as they could compare it with any public text you wrote. Share a card the way you would share a short bio.

## The Private View

`--audience private` adds exact counts per channel, confidence, fallbacks and a few rounded rates, keeps low-volume channels (marked "Thin evidence") and lists every habit that passes. It is for your own computer; do not share it.
