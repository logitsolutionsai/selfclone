# Changelog

## 0.1.0 (2026-11-14)

First release.

### Added

- `selfclone ingest` for WhatsApp (Android and iOS, `.txt` or `.zip`), Telegram Desktop JSON, Slack exports
  (folder or `.zip`), the X archive, mbox and eml email, plain text and Markdown notes, and generic JSONL and CSV.
  Several exports can sit in one folder.
- Secrets scrubber on by default, also available as `selfclone scrub`.
- Seeded train and sealed split by reply turn, with a SHA-256 integrity check of the sealed set.
- `selfclone fingerprint`: length, punctuation, casing, emoji, contractions, laughter, shorthand, function words,
  signature phrases, openers and closers, topic words.
- `selfclone pack`: a stratified, size-capped distill pack of training turns.
- `selfclone test prompts` and `selfclone test score`: deterministic Style match from function-word and feature
  z-scores, calibrated with a bootstrap baseline, with a per-feature drift table.
- `selfclone game`: the offline Can You Tell page.
- `selfclone face` (webcam enrolment with live checks and a consent step) and `selfclone bake --photo`
  (headless Chrome with the installed browser), producing a standalone offline `avatar.html` with lip sync,
  blink, idle head motion, a drawn mouth interior, a WebGL renderer and a Canvas2D fallback.
- `selfclone serve` and `selfclone say` to make the open avatar speak text or audio.
- `SKILL.md` workflow, clone templates, and Claude Code plugin and marketplace manifests.
- A worked example with two fictional people in `examples/maya/`.
- Clip enrolment, the better way to make the face: `selfclone face` offers "Record a short clip (better)",
  shows the enrol phrase ("Ah, I see. Oh, why would you move a big cheap boat? Five fast vans."), counts down
  and records about 10 seconds in memory only (no file, no `MediaRecorder`). The face landmarker runs on every
  frame; keyframe selection picks a still rest frame and the clearest frame for AA, E, O, U, M B P and F V and a
  closed-eyes frame, refusing blurred, turned and moving frames. Each is aligned to the rest frame with a
  similarity transform on stable points and cut into a small mouth or eye patch (about 30 KB in all on the
  test clip). The avatar warps the patches onto the mesh, which takes the measured shapes, cross-fades between
  them, colour matches them to the base frame, and falls back to the drawn mouth for shapes the clip missed.
  Works in WebGL and Canvas2D.
- `selfclone bake --video <file> --consent "<statement>"`: the same clip bake from an MP4 or WebM file, decoded
  in headless Chrome. Refuses without consent, like `--photo`.
- The consent record and the "About this clone" panel say whether the face came from a photo, a webcam frame,
  a webcam clip or a video file and what was kept; the badge carries the source too.
- An "Enough light" live check at enrolment.
- `say(text, {rate})` in the avatar, and `?patches=0` to compare a clip avatar with the drawn mouth.
- A synthetic enrol clip of the test painting (`tests/fixtures/mona-lisa-clip.webm`), a recording of the
  landmarker's output on it, unit and browser tests for the clip path, and `docs/make-contact-sheet.mjs`.
- SHA-256 pinning of every MediaPipe file, checked on download and on every read from the cache.
- `style.md` reports messages per reply (bursts) and the last character of messages, shows openers in the
  writer's casing, and recognises laughter written as ahah, jaja, kkkk, rsrs and mdr.
- Fictional test exports with real-app quirks in `tests/fixtures/rosa/`, and regression tests for every fix.

### Fixed Before Release

- `ingest.json` and `report.json` stored absolute input paths, which recorded the user's drive and home folder
  in the workspace; they now store paths relative to the working folder.
- A folder of exports skipped every `.zip` inside it; they are now opened (WhatsApp, Slack and X zips).
- WhatsApp: iOS system notes, locations and media placeholders (marked with an invisible left-to-right mark)
  became messages and context; Android group notices quoting a subject or name with a colon became messages;
  contact names with a colon were cut; day-first 12-hour files where every day is 12 or less were read
  month-first; a caption under an Android attachment line kept the file name.
- Telegram: forwarded messages were learned as the user's own writing.
- Slack: bot users, app messages and huddles became context; emoji shortcodes stayed as `:joy:` text; large
  exports with many threads took quadratic time.
- X: a self-thread's context kept `t.co` links and media URLs.
- Email: attributions in other languages ("Em ... escreveu:") and phone footers stayed in the user's text,
  signatures without `-- ` were learned as style, a body line starting with "From " split the mail, mboxrd
  `>From ` lines were dropped as quotes, and HTML mail kept numeric entities and source line breaks.
- A reply that is itself the context of another message (X self-thread, own Slack thread, quoted mail) could
  be sealed and then appear in the distill pack or another test prompt. It is no longer sealed.
- Writers of Chinese or Japanese and emoji-heavy writers got no sealed test set at all.
- Scrubber: many password phrasings, PINs, door codes, card security codes, national phone formats, webhook
  and share links, database URLs, spelled-out emails and US social security numbers got through; ordinary
  URLs with a long path were turned into `[SECRET]`.
- `selfclone face`: any web page open in the browser could post a bake with a fake consent (a `text/plain`
  POST needs no CORS preflight). Writes from another origin are refused and the bake accepts only JSON.
- The camera stayed on when the face model failed to load.
- `selfclone bake` waited out a two minute timer before exiting.
- The README Quick Start failed at `selfclone game`; `game` now reuses the clone replies of the last score.
- `selfclone say` after a closed server said only "fetch failed"; numeric options such as `--max-chars abc`
  turned into NaN; an empty test set wrote an empty prompts file; replies wrapped in a code fence could not be
  scored.
