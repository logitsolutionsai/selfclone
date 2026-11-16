# Changelog

## 0.2.0 (2026-11-16)

### Added: Studio, any topic, any cast

- Videos carry no label: neither studio videos nor `selfclone video` burn one in, put AI tags in the file's
  metadata (only "Made with selfclone" and the version) or write a sidecar file. The avatar page keeps its
  AI CLONE badge, and `selfclone video` still refuses an avatar without a matching consent record.
- Ten showcase explainers in `examples/showcase/`, one per field (AI, aerospace, finance, medicine, maths,
  English, neurology, philosophy, physics as a 9:16 short, astronomy), each ending on a "Made with selfclone"
  card; the README opens with their showreel.
- Items can be timed from the end of a line (`lineEnd`) and drawn over the characters (`over`).
- Captions have a dark outline, so they read over light backdrops and white clothes.
- Three ways to host: your own drawn character, random fictional people (`selfclone character --random <seed>`
  or `"random:<seed>"` in the cast), or nobody (`--no-host`).
- Dialogue: a `cast` of named characters, each with its own voice and body. Lines name their speaker, only the
  speaker's mouth moves, listeners turn to the speaker, and there are speech and thought bubbles.
- Full-body characters with legs and a walk cycle (`walk`, `enter: walk-left|walk-right`).
- Twelve hair styles, five facial hair options and five outfits (sweater, lab coat, suit with tie, t-shirt,
  hoodie).
- A hand-to-chin thinking pose.
- Lip sync read from the text's phonemes (the phonemizer that comes with kokoro-js, or a letter table): closed
  lips, F/V teeth, rounding, aligned to the voice's pauses.
- Gestures and moods chosen from the words when there are no cues.
- Hands kept in frame by default placement.
- 60 props, animated bar, line and pie charts, image items and image backdrops.
- Manim blocks for maths (LaTeX included), rendered with a transparent background and laid in frame by frame.
- Recorded narration aligned to its pauses.
- Kokoro pinned to a revision and hash-checked.
- Parallel render workers (`--workers`, about twice as fast) and `--preview` stills with storyboard warnings
  (overlaps, off-frame, under the captions, covering a character, empty or rushed scenes).
- Painted backdrops from a prompt (`"backdrop": {"prompt": "..."}`, with OPENAI_API_KEY), cached.
- `--aspect 9:16` and `1:1` frames; characters and text are sized to fit tall frames.
- `"music": "ambient"`: a generated pad bed, ducked under the voice.
- Head turns: the nose points the way the character looks, the far ear tucks behind the head and the back hair
  shifts. Walking rocks the body. Chalkboard and notebook backdrops. Word-by-word captions (`"captions": "words"`).
- `selfclone explainer init`: a starter scene file for any topic and host mode (own, random, dialogue, none).
- Thumbs-up and counting gestures (also chosen from the words), name tags for characters (`name`), title cards
  (`title` on a scene), and random characters whose clothes and hair always stand apart from their skin.
- `--html`: an interactive, self-contained player page (sound, chapters per scene, scrubber, captions switch, Manim
  as synced clips).

### Added: Studio, explainer videos with a drawn host

- `selfclone character --photo <img> | --video <clip> --consent "<statement>"`: a drawn SVG character from a face.
  Proportions come from the MediaPipe landmarks found at enrolment, colours from small samples of the photo (a black
  and white photo keeps its lightness and gets a skin tone from a ramp). Six hair styles, mustache or beard,
  glasses. Writes `character.json` (with the consent record) and a preview sheet of every mouth shape, a blink and
  the pointing pose.
- `selfclone speak`: narration with Kokoro (local, CPU, the default; `kokoro-js` is an optional dependency, the
  model is downloaded once), ElevenLabs (`ELEVENLABS_API_KEY`) or OpenAI (`OPENAI_API_KEY`).
- `selfclone explainer <scenes.json>`: an MP4 explainer from a scene file (narration, background, character
  placement and pose, camera move, SVG and handwritten items timed to sentences, cut or fade). Lip sync from the
  narration's loudness and spectral centroid, on twos; blinks; line boil and paper grain from SVG noise. Rendered
  in headless Chrome with the network blocked, about 15 frames a second on a laptop CPU. An `.srt` caption file
  is written. Narration is cached by voice and text. `--audio` uses a recording (captions timed by text length).
- The host is a rig: jointed arms with seven gestures (rest, point, wave, explain, present, shrug, think, each
  mirrorable) blended over 0.45 s, three hand shapes, six moods (brows and a smile), a half-shut blink frame,
  glances at new items with the features shifting like a head turn, small saccades, nods, brow lifts and hand
  beats on stressed syllables, raised brows on questions, breathing, and entrances (rise, slide, pop). Without
  cues it gestures on its own and points toward items that land beside it.
- Items can draw themselves stroke by stroke (`draw`), zoom in, slide from any side, loop (float, bob, wobble,
  pulse, spin, shake), move and exit. Times can be a sentence plus an offset. Camera paths with several keys.
  Transitions: cut, fade, wipe, push, zoom, iris. Counters (`count`, a number that ticks up into the text) and
  hand-drawn marks (`mark`: underline, circle, box, strike) that draw themselves onto an item.
- Scenery drawn in code in each scene's colours: backdrops (clouds, stars, dots, grass, city, room, grid, waves)
  with parallax and their own motion, and particles in front (dust, sparkles, bubbles, snow).
- Synthesised sound effects (pop, whoosh, pencil scratch, chime) matched to the animation, and `--music` with
  ducking under the voice.
- The preview sheet shows mouths, blinks, moods, every gesture and the head turned.
- Scene SVG with scripts, event handlers, images or external links is refused.
- ETHICS.md: the rules for synthetic speech with a drawn host.

### Added: Voice CI

- `selfclone consent`: a local consent ledger (`.selfclone/consent.json`) for the writing features, with the scopes
  persona, local-lint, public-stylecard and avatar. `--revoke <scope>` blocks future runs that need it; it does not
  claim to delete files already shared.
- `selfclone profile build`: a private, versioned `voice-profile.v1.json` from the training split only (sealed.jsonl
  is never opened), with 24 features per channel (message, email, post, dev, docs, changelog, pr), evidence
  thresholds, shrinkage toward a parent channel when a channel is thin, a training digest and a profile id. Numbers
  and enums only; validated against `schemas/voice-profile.v1.schema.json`.
- `selfclone lint`: Markdown, MDX and text drafts checked against a project `voice-policy.json` (six rule types:
  phrase, heading-length, max-paragraph-words, case-at-start, terminal-punctuation, min-context) and, with
  `--profile`, against the user's own profile. A Markdown segmenter protects code, links, images, comments, MDX and
  technical tokens. Advisory mode by default; `--enforce` fails only on hard policy rules. Text, `--json` and
  SARIF 2.1.0 output; UTF-16 offsets; folders skip node_modules, .git, .selfclone, dist, binaries and symbolic links;
  a 10 MiB file limit (`--max-bytes`, at most 50 MiB).
- JSONL and CSV exports may carry a `register` column (dev, docs, changelog, pr and the others) that sets a
  message's channel. Exports without it ingest exactly as before.
- `--help` works after every command. The new commands use exit codes 0, 1, 2 and 3 and print structured errors
  with `--json`; the original commands keep their exit codes.
- `tests/fixtures/synthetic-maintainer/`: a seeded, 700-message corpus by an invented maintainer, with planted
  secrets and hostile strings that the privacy tests check never reach any output.

### Added: Voice Passport

- `selfclone stylecard --audience public|private`: a Voice Passport in `out/passport/` as one offline HTML file
  (Ink palette, one accent, status by ink weight, springs from `face/lib/fluid.js`, a CSP with the inline script's
  hash), `passport.json` (`schemas/passport.v1.schema.json`), a script-free `passport.svg` and, with `--png`, a
  square PNG through the installed browser. The public card is a bucketed projection with at most 3 habits from a
  fixed catalog, an evidence band instead of counts, no low-volume channels and an allowlist check before writing;
  fewer than 100 training messages gives `insufficient_data` and no card. Needs consent with the public-stylecard
  scope. `--example` shows the synthetic example card with no personal data.
- `docs/PASSPORT-PRIVACY.md`, `examples/maintainer-voice/` (synthetic profile, policy, release notes and card) and
  `docs/media/passport.png`.

### Added: Voice Drift

- `selfclone drift --before a..b --after c..d [--channel dev]`: changes in 12 surface features of the owner's own
  training split between two non-overlapping windows, with 95% percentile intervals from 1,000 seeded bootstrap
  resamples of whole conversations and practical thresholds. Fewer than 100 messages, 20 conversations or 4 weeks
  in a window gives `insufficient_data` (exit 0) and no numbers. Markdown or `--json`.
- `tools/perf-voice-ci.mjs` and `tests/unit/perf.test.mjs`: 10,000 messages and 100 Markdown files profile and lint
  within 15 s, and drift runs within 30 s.

### Added: Evals, Docs And Tests

- Eight behaviour eval cases in `evals/` for `claude plugin eval` (own profile, a coworker without consent, a public
  figure's private messages, a third party's chat export, printing the sealed replies, a legitimate docs lint,
  technical-token preservation, a request to auto-post a reply), generated from `evals/_shared/make-cases.mjs`.
  Not run yet: native Windows refuses shell tools in evals. `tests/unit/evals.test.mjs` checks them without a model.
- `docs/VOICE-CI.md`, `docs/PASSPORT-PRIVACY.md`, `docs/THREAT-MODEL.md`, `docs/LIMITATIONS.md`,
  `docs/SCHEMA-MIGRATIONS.md`; SKILL.md sections for Voice CI and the Voice Passport; README sections.
- Tests for the profile, lint, the passport (unit and a browser smoke test at 390, 768 and 1440 px in both
  schemes), the kit and delta, drift, privacy with planted secrets and a stubbed network, an end-to-end run on
  the synthetic corpus, golden checks that the Maya score (89%, 41%, 99%), game page, voicecheck and export are
  unchanged, the Agent Skills frontmatter, and the performance budget.

### Added: Maintainer Voice Kit

- `selfclone kit init --target <repo>`: a `.selfclone-kit/` folder with the starter policy and its schema, an
  `AGENTS.snippet.md` to append by hand, a portable `maintainer-voice` agent skill, example drafts and a disabled
  GitHub Actions sample (`pull_request`, `contents: read`, no secrets, no code run from the pull request). It
  never overwrites a file and never edits `AGENTS.md`. `--profile` sets only a rounded paragraph limit.
- `selfclone kit check --target <repo>`: validates the policy, hard rules, portability (Agent Skills frontmatter)
  and the workflow, and scans the kit for private data (profile fields, digests, emails, local paths, unknown links,
  scrubber hits, and lines from the training split when the workspace is present). Exit 1 on a failed check.
- `selfclone delta <before> <after>`: the edited lines of a proposed rewrite and a byte-for-byte check of every
  protected technical span; a difference is `E_FACT_PRESERVATION` (exit 1) and the rewrite is not recommended.

### Changed

- The avatar page, the Can You Tell page and the enrolment page use one neutral palette (warm greys) with a
  single blue accent for buttons, links, focus and selection; no status is shown by colour. A passing check shows
  a check mark, a failing one a cross in a solid chip. The page's AI CLONE badge is a near-black chip with white
  letters and a faint white ring in both themes.
- Motion: buttons and reply cards react on pointer-down; game rounds slide out and in on springs that a second
  press retargets; the game's progress bar is a scaleX spring; About opens as a sheet anchored to its button and,
  under 600 px, as a bottom sheet you drag down to close; a thin line under the face tracks the speech. The
  springs come from `face/lib/fluid.js`, inlined into each page, and every motion has a reduced-motion fallback.

### Added

- `selfclone voicecheck <file|->`: "Does this sound like me?" Scores any draft against your training messages
  with the existing scorer, prints a voice match, a confidence (low under 40 words, calibrated in
  `docs/voicecheck-calibration.mjs`), and the top drifts as plain fixes built from the per-feature z-scores
  ("You use no semicolons; this has 3."). `--as message|post|email` compares against your writing of that kind
  (chat, posts and notes, or email), falling back to everything when a kind has fewer than 30 units. `--json`
  for data, `--min <pct>` for an exit code, and a replies JSON file is checked as a set. Short drafts use the
  feature distance only, because function-word frequencies in a short text are noise (`docs/SCORING.md`).
- `selfclone fingerprint` adds a "By Kind Of Writing" table when the exports hold two or more kinds of writing.
- Clone skill modes in `templates/clone-SKILL.md`: reply, write, dev (commit messages, PRs, review comments,
  docs), ask me (answers cite message ids, or say "I do not know what they would say"), and a voice check after
  every draft, at most 2 rounds, without cramming habits into a caricature. `templates/voice.md` gains a
  "By Channel" section. The Maya example clone shows the modes.
- `selfclone export [--to ...]`: the clone as `system-prompt.md`, `chatgpt-instructions.md` (1,500 and 5,000
  character blocks), `claude-project.md` (16,000 characters), `agents-md.md` (under 6,000 bytes) and
  `persona.json`, in `out/<slug>-clone/export/`. Rules are ranked by voice signal from the fingerprint and the
  bare model's drift, and every export starts with the AI clone disclosure, which truncation never removes.
- New input formats, each detected inside folders and zips: Discord (DiscordChatExporter JSON and Discord's
  data package), Instagram and Facebook Messenger (Meta JSON, with the Latin-1 mojibake decoded), LinkedIn
  `messages.csv`, iMessage (`imessage-exporter` text), Reddit `comments.csv` and `posts.csv`, Google Chat from
  Takeout, Word `.docx`, and blog posts (HTML pages and RSS or Atom feeds).
- `selfclone video --audio voice.wav [-o out.webm|out.mp4]`: a face on camera without the camera. The avatar as a
  picture-in-picture presenter for screen recordings and tutorials, lip-synced to your own recorded voice (or a
  voice clone of yourself), rendered frame by frame in headless Chrome on a paused clock and encoded with
  ffmpeg: a round or square WebM (VP9 with alpha) or MP4 (H.264), 240 to 1080 px, with your audio. This reverses
  the earlier "no video export" rule, with safeguards built first: a consent check bound to the face's photo
  hash, audio input only (no text-to-speech), and a 10-minute cap (`--max-minutes`, at most 60). `ETHICS.md`
  explains the change and the publisher's duty to disclose (EU AI Act, Article 50).
  `tools/make-video-overlay.mjs` makes `docs/media/video-overlay.gif`.

### Changed

- The README follows the layout of the other Logit skill repos: a hero image, Install near the top, Before And
  After, Proof and Limits. The full command list, the export file limits, the project layout and the roadmap moved
  to `docs/REFERENCE.md`. The hero images and the social preview are in `docs/media/`.
- The developer scripts (`calibration.mjs`, `make-contact-sheet.mjs`, `make-media.mjs`, `ngram-experiment.mjs`
  and `voicecheck-calibration.mjs`) moved from `docs/` to `tools/`, so `docs/` holds only documentation. Earlier
  entries below still name their old paths.
- The empty `out/` folder at the repository root is gone, and `.gitignore` ignores `/out/`. Clone output goes to
  `out/` in your working folder, never inside the skill.
- The package and plugin descriptions and keywords follow the other Logit skill repos.

- The photo bake's O and U are small, upright, rounded openings with the lips pushed forward around them (the
  inner lip ring is laid on an ellipse, taller than wide for O and smaller for U, and the lip rings outside it
  follow), with a lighter, warmer rim inside the lips, a softer, less saturated dark centre and a feathered edge,
  instead of dark boxy holes. AA, E, rest, M B P and the blink are unchanged.
- The synthetic test clip was recorded again with the current drawn mouth, under a paused clock (it used to run
  on real time as well, so the phrase sped up with slow screenshots) and read more slowly. The landmarker reads
  its drawn AA and E as nearly closed, so it now yields O, U and blink patches only; the clip tests check the
  patch path with O instead of AA (see `tests/fixtures/SOURCE.md`). `docs/media/photo-vs-clip.png` shows O, U and
  the blink.

### Fixed

- Two browser tests depended on machine speed. The blink test sampled a 170 ms blink with real-time
  screenshots and could miss it entirely; it now pauses the page clock and steps to exact moments (closed at
  60 ms, reopened at 560 ms). The bottom-sheet test required a fractional `translateY`, so exact 1:1 tracking
  (`translateY(40px)`) failed it; it now accepts whole and fractional values in the same 30 to 49 px range.
- The scrubber missed "password is: x" and "password was = x" (a label word followed by a colon or equals sign).
  A labelled password that was already scrubbed is no longer scrubbed a second time, which dropped the label.

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
- A more lifelike drawn mouth and blink for photo bakes: the interior, tongue glow and dim upper teeth are
  shaded from the photo's own colours with soft edges, the lips close onto the photo's own pixels at rest and
  on M, B, P, O and U are round, openings are capped, shapes ease and blend into each other, and the blink is a
  lid of the photo's skin sliding down with a soft lash line (about 170 ms).
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
