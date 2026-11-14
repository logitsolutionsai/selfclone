# Contributing

Thank you for helping. selfclone is small on purpose: plain Node with no runtime dependencies except
`playwright-core` for the photo bake and the browser tests.

## Set Up

```bash
git clone https://github.com/logitsolutionsai/selfclone
cd selfclone
npm install          # installs playwright-core only; it does not download a browser
npm test             # unit tests, no browser needed
npm run test:e2e     # needs Chrome, Edge or Chromium installed (set SELFCLONE_CHROME if not found)
```

The browser tests download the pinned MediaPipe files once into `~/.cache/selfclone/` and need ffmpeg for the
webcam enrolment test (it is skipped without ffmpeg).

The CLI runs on Node 20. The tests need Node 22 or newer: `node --test` expands the test file patterns only from
Node 21, and the ZIP writer the tests use calls `zlib.crc32`.

The fictional exports in `tests/fixtures/rosa/exports/` are written by `node tests/fixtures/rosa/make-exports.mjs`.
Change the generator, not the files, and run it again.

## Ground Rules

- **No real people's messages** in fixtures, tests or examples. Write synthetic data or use the fictional
  personas in `examples/`.
- **No photos or video of living people.** Face tests use the public domain painting in `tests/fixtures/`, and the
  enrol clip there is synthetic (the painting's avatar reading the phrase; see `tests/fixtures/SOURCE.md`).
- **Keep the CLI dependency-free.** If you need a parser, write a small one with tests.
- **Deterministic by default.** Anything that samples takes a seed.
- **Do not weaken the safeguards** listed in `ETHICS.md` (consent gates, scrubber default, badge, no export).

## Adding An Export Format

1. Add a parser in `src/ingest/` that returns messages `{ts, author, text, thread, msgId?, replyTo?, contextOverride?}`.
2. Hook detection into `src/ingest/index.mjs`.
3. Add synthetic fixtures and tests in `tests/unit/parsers.test.mjs`.
4. Document how to export and what is parsed in `docs/FORMATS.md`.

## Changing The Scorer

Scores must stay deterministic and the mapping must stay documented. Update `docs/SCORING.md` and keep the
calibration tests in `tests/unit/score.test.mjs` passing (same author near the top, a different author low).

## Writing Style For Docs

Title Case headings, no contractions, no exclamation marks, no invented numbers, no testimonials, and no
compliance claims. Say "privacy-first" rather than promising more than the code does.
