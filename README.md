<h1 align="center">selfclone</h1>

<p align="center"><b>Claude Code skill: your writing clone, with a talking face, scored on your real messages.</b></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0065FD?style=flat-square" alt="License: MIT"></a>
  <a href="SKILL.md"><img src="https://img.shields.io/badge/Claude%20Code-skill-0065FD?style=flat-square" alt="Claude Code skill"></a>
  <a href="SKILL.md"><img src="https://img.shields.io/badge/Agent%20Skills-compatible-0065FD?style=flat-square" alt="Agent Skills compatible"></a>
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#before-and-after">Before And After</a> · <a href="#where-to-use-your-clone">Where To Use It</a> · <a href="#how-it-works">How It Works</a> · <a href="#proof">Proof</a> · <a href="#limits">Limits</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/hero-dark.webp">
    <source media="(prefers-color-scheme: light)" srcset="docs/media/hero-light.webp">
    <img src="docs/media/hero-light.webp" width="100%" alt="Chat exports from WhatsApp, Slack, Telegram and more beside the Can You Tell page selfclone built from its fictional Maya example, where the clone fooled the player, with the Mona Lisa test painting speaking as the avatar and a style match of 89% for the clone against 41% for the bare model.">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/app-dark.webp">
    <source media="(prefers-color-scheme: light)" srcset="docs/media/app-light.webp">
    <img src="docs/media/app-light.webp" width="100%" alt="The Can You Tell page from the Maya example after the first pick, with the chosen reply outlined, the real one tagged Real, the clone's tagged AI clone, and the verdict that the clone fooled the player.">
  </picture>
</p>

selfclone is a Claude Code skill, and an agent skill that also runs in Codex and Cursor. Give it your own chat exports. It distills them into a persona skill that writes the way you write, gives that persona an offline talking face made from a 10-second clip (or one selfie), and measures how close the clone gets with a score computed by counting, not by asking a model to grade itself. Privacy-first: the tool runs on your computer, and Claude reads only the scrubbed distill pack it writes.

The face in these images is the Mona Lisa, a public domain painting used as the test face. selfclone never ships or tests with photos or video of living people.

## Install

```
/plugin marketplace add logitsolutionsai/selfclone
/plugin install selfclone@selfclone
```

Then say "clone me" and point Claude at your exports. The skill walks through consent, ingest, distillation, testing and the optional face. Or paste this into Claude Code:

```
Clone https://github.com/logitsolutionsai/selfclone into ~/.claude/skills/selfclone, then clone me from my chat exports in ~/Downloads.
```

You need Node 20 or newer. The only dependency is `playwright-core`, for `selfclone bake`; it uses the Chrome, Edge or Chromium you have and downloads no browser. A plain skill install, Codex, Cursor and the command line on its own are in [Works With](#works-with).

## Before And After

Take the fictional example in [`examples/maya/`](examples/maya): Maya Okafor, an invented ceramicist, with 221 messages across a WhatsApp chat and a Slack workspace (all synthetic). Here is a message from her sealed test set, which the clone never saw, answered by her clone and by a bare model:

```text
them:   I am thinking of quitting social media for a month.
clone:  honestly yes do it
        fill the gap with stuff with no screens, bikes, trains, the coast
        report back on day 3 lol
bare:   Do it! I did two weeks last year and felt so much calmer. Just warn people so they know where to find you.
```

`selfclone test score` compares both with the replies Maya actually sent:

```text
Style match 89% (bare model 41%); your real held-out replies: 99%
```

| Step | What runs | What you get |
| --- | --- | --- |
| 1 | `selfclone ingest` | her 221 messages, with a wifi password, an email and a phone number scrubbed, and 20 of her replies sealed away as a test set |
| 2 | `selfclone fingerprint` | her habits: 98.9% of messages start lowercase, 6.6% end in punctuation, every contraction drops its apostrophe, median 9 words, and "u", "lol" and "ur" are her top shorthand |
| 3 | Claude reads the distill pack | [`maya-okafor-clone`](examples/maya/out/maya-okafor-clone), a skill whose every voice rule and opinion cites the message ids it came from |
| 4 | Two fresh subagents answer the 20 sealed prompts | one loads the clone skill, one has nothing |
| 5 | `selfclone test score` | the score above, and where the clone drifts: it laughs too often (60% of replies against her 27%) and always splits replies into several lines ([full report](examples/maya/workspace/report.md)) |
| 6 | `selfclone game` | a Can You Tell page where friends guess which reply is real |
| 7 | `selfclone voicecheck` | a voice match for any draft, and what to fix |
| 8 | `selfclone export` | [ready-to-paste files](examples/maya/out/maya-okafor-clone/export) for ChatGPT, a Claude Project, any system prompt and `AGENTS.md` |

`selfclone voicecheck` on a formal paragraph someone else wrote:

```text
Voice match 25% against Maya Okafor: Does not sound like you yet.
  Medium confidence: 53 words.
To sound more like you:
  - You start 100% of messages lowercase; this draft starts 1 of 1 line with a capital. Start in lowercase.
  - You use no semicolons; this has 1. Take it out.
  - Your typical reply is 17 words (9 in 10 are 30 or fewer); this draft is 53. Cut it down.
```

On voicecheck, her own 20 held-out replies score 100%, the clone's 86% and the bare model's 7%.

## Where To Use Your Clone

A voice clone is used wherever audio is needed; this one is for wherever you write. The clone skill has a mode for each job, and checks its own drafts against your voice.

| Mode | Ask it | What you get |
| --- | --- | --- |
| Reply | "Reply as Maya to this Slack message: can you cover my Thursday class?" | the answer in her voice, matched to the channel (chat, email or a comment), with gaps such as `[time?]` instead of invented plans |
| Write | "Write a post as Maya for her market regulars: the stall moves to Sundays." | a post, newsletter, bio or announcement in her voice; a bio holds only facts you give or the clone can cite |
| Dev | "Write the PR description for this branch in my voice." | commit messages, PR descriptions, review comments and docs in your voice, with code, commands and test results left exact |
| Ask me | "What would Maya say about dropping prices to get into a shop?" | an answer that cites the message ids it rests on, or "I do not know what Maya would say about this" when the evidence is thin |
| Voice check | `selfclone voicecheck draft.txt --as email` | a voice match, a confidence, and the top drifts as fixes; the clone runs it after every draft, at most 2 rounds |

**Outside Claude Code.** `selfclone export` writes the clone into `out/<slug>-clone/export/` in your working folder: a system prompt for any model, ChatGPT custom instructions, Claude Project instructions, an `AGENTS.md` section (for Codex, or as a Cursor rule) and `persona.json`. Each file is fitted to its target's limit with the rules that carry the most voice first; the limits are in [docs/REFERENCE.md](docs/REFERENCE.md#export-files). Every export starts with the rule that it is an AI clone and says so when asked, and cutting to a limit never removes it. Pasting an export into another service sends that service the clone's rules and its examples (scrubbed excerpts of your messages).

## See It Work

<p align="center">
  <img src="docs/media/avatar-talking.gif" width="320" alt="A public domain painting animated by selfclone: it talks, blinks and moves its head, with an AI CLONE badge in the corner">
  <img src="docs/media/game.png" width="300" alt="The Can You Tell page in dark mode, showing a message, a real reply and a clone reply">
</p>

*Left: the Mona Lisa test painting in `avatar.html`, speaking a typed sentence, with the AI CLONE badge that cannot be switched off. How the face is made, and where it falls short, is in [The Face](#the-face). Right: the Can You Tell page from the Maya example after a wrong guess, when the clone's reply was taken for hers. It is one offline file, to share only with people who could already read those messages.*

## How It Works

The skill and a Node command-line tool share one workspace folder, `.selfclone/`, in your working folder.

1. **Ingest and scrub.** `selfclone ingest` detects the format of each export, keeps the messages written by the person named with `--me`, keeps the message someone sent just before each one as its context, and replaces secrets with placeholders.
2. **Seal a test set.** A seeded split sets about 15% of your replies (at least 20 when you have them) aside before anything is distilled. The clone never sees them.
3. **Fingerprint.** `selfclone fingerprint` measures your habits on the training messages: length, casing, punctuation, emoji, laughter, shorthand and function words.
4. **Distill.** `selfclone pack` writes a distill pack. Claude reads it and writes `out/<slug>-clone/`, a skill whose voice rules and opinions each cite the message ids they rest on.
5. **Test.** Two fresh subagents answer the sealed messages, one with the clone skill and one with nothing, and `selfclone test score` compares both with what you actually sent.
6. **Use.** The clone replies, writes and answers in your voice and checks its drafts with `selfclone voicecheck`; `selfclone game` and `selfclone export` take it further.
7. **Face, if you want one.** `selfclone face` turns a 10-second clip or one photo into `avatar.html`, an offline page that speaks typed text or an audio file.

Every command and flag, and the project layout: [docs/REFERENCE.md](docs/REFERENCE.md). How the parts fit together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Proof

Each sealed pair is a message someone sent you and what you sent back. The clone and a bare model each answer the sealed messages without seeing your replies. Then the scorer builds a model of your style from 200 seeded samples of your own training replies:

- how often you use each word from a fixed list of 188 English function words and contractions ("the", "i", "just", "with"), the basis of Burrows' Delta, a standard authorship measure;
- 26 surface features: length, punctuation per 1,000 characters, lowercase starts, ALL CAPS, emoji, contractions and dropped apostrophes, laughter, questions, links, multi-line replies.

Each reply set gets a distance from your own typical sample (root mean square of capped z-scores), and the distance becomes a percentage: 100% at your own baseline, 50% one unit above it. Your real held-out replies are scored the same way, so you always see the ceiling next to the clone and the floor next to it. No language model grades anything.

The Maya example, from its [report](examples/maya/workspace/report.md) on 20 sealed prompts:

| Reply set | Style match | Starts lowercase | Ends in punctuation | Has laughter | Several lines |
| --- | --- | --- | --- | --- | --- |
| Maya's training messages (average) | reference | 98.1% | 5.9% | 26.7% | 69.3% |
| Her real held-out replies (the ceiling) | 98.6% | 95% | 5% | 30% | 80% |
| Clone | 88.5% | 95% | 5% | 60% | 100% |
| Bare model | 41.4% | 0% | 100% | 5% | 0% |

In this example the word distance did not separate the clone from the bare model at all; the surface features did. The formulas, the calibration evidence and the tests that keep the scorer honest (the same author scores near the top, a different author low) are in [docs/SCORING.md](docs/SCORING.md).

## The Face

**Better: record a 10-second clip.** `selfclone face` opens a local page. Press "Record a short clip (better)",
read one sentence aloud after the 3-2-1 countdown ("Ah, I see. Oh, why would you move a big cheap boat? Five
fast vans."), blink twice and keep still. The clip is read in memory, frame by frame, and never saved.
selfclone keeps the best still frame as the face, plus small patches of your own mouth for the shapes it saw
(AA, E, O, U, M/B/P, F/V) and of your closed eyes, and bakes them into `avatar.html`: one offline file of about
250 KB that talks, blinks and moves its head. A video you already have works too:
`selfclone bake --video clip.mp4 --consent "This is my own face. Your Name"` (MP4 or WebM, up to 30 seconds).

**Or one photo.** One webcam frame or one photo (`selfclone bake --photo`) also works, but a closed mouth cannot
show what is inside it, so the open mouth is drawn, shaded from the photo's own lip and skin colours (a dark
interior, a hint of tongue, dim upper teeth under the lip's shadow), with small, rounded O and U openings where
the lips push forward, and lids that slide down over the eyes to blink. The GIF above is a photo bake. It is a painted guess, not your mouth.

The test suite proves the clip pipeline end to end on a synthetic clip of the test painting
([`docs/media/photo-vs-clip.png`](docs/media/photo-vs-clip.png)). A painting cannot read a sentence, so that
clip is the photo avatar itself reading the phrase with the drawn mouth. The landmarker reads its O and U
clearly and its drawn AA and E as nearly closed, so that clip yields O, U and closed-eye patches only. It shows
the pipeline works, not how a clip of a real face compares.

<p align="center">
  <img src="docs/media/avatar-page.png" width="360" alt="The avatar page with its text box, audio button and the consent record panel open">
</p>

**How it works.** MediaPipe Face Landmarker (pinned `@mediapipe/tasks-vision` 1.2.0) runs in your browser at
enrolment only; its files are downloaded once and cached. It finds 478 points on the face and, for a clip, 52
expression scores (jaw open, lips funnelled, puckered, pressed, eyes closed) on every frame. selfclone picks the
clearest frame for each mouth shape and the closed-eyes frame, refusing blurred frames (low Laplacian variance
around the mouth) and frames where the head moved or turned. Each chosen frame is aligned onto the still frame
with a similarity transform fitted on points that do not move when you talk (eye corners, nose bridge, upper
face contour), and only the mouth and eye regions are cut out. The page crops the still frame, builds a
triangle mesh over the face with a hole for the mouth, and embeds the frame, the patches, the points, the mesh
and your consent record in the HTML. At run time the page moves the mesh points (jaw, lips, eyelids, a small
head turn, breathing) and draws the frame across the mesh with WebGL, or with Canvas2D where WebGL is not
available. For a shape it has a patch for, the mesh takes the shape measured in your clip and the patch is
warped onto it triangle by triangle, feathered at the edge, colour matched to the still frame, and cross-faded
with the next shape. Shapes the clip did not show use the drawn mouth. No model weights are needed after
enrolment.

**Speech.** Type text and the page maps it to mouth shapes, using the browser's voice for timing when one is
available. Or play an audio file (your own recording, or a voice clone you already have) and the mouth follows
its loudness and brightness. From Claude Code: `selfclone serve`, then `selfclone say "..."` or
`selfclone say --audio reply.mp3`.

**Limits, plainly.** It is not photoreal, with a clip or without. It is one frame warped in 2D, with flat
patches on top: turns are capped at 6 degrees, the patches turn with the head as flat images, a shape between
two recorded ones is a cross-fade, and a shape the clip missed falls back to the drawn mouth (the photo bake
uses the drawn mouth for every shape). The page itself records nothing; a video comes only from
`selfclone video` (below), labelled. Glasses switch blinking off so the frames do not warp. A straight-on face in even light with a still head works best; the enrolment page checks for it.

The webcam enrolment page shows live checks (one face, facing the camera, enough light, close enough, and for
a still frame mouth closed and eyes open, glasses) and will not bake without a ticked consent box and a typed
name:

<p align="center">
  <img src="docs/media/enrol.png" width="360" alt="The enrolment page recording a clip: a camera view with a face guide, the sentence to read, a progress bar and the live checks">
</p>

### Use The Face In Videos

A face on camera without the camera. `selfclone video` turns the avatar into a picture-in-picture presenter for
screen recordings and tutorials, lip-synced to your own recorded voice, or to a voice clone of yourself that you
already have:

```bash
# A round, transparent overlay (WebM, VP9 with alpha), for an editor track above your screen recording
selfclone video --audio voice.wav -o presenter.webm

# Square, on a solid colour (MP4, H.264), for tools that cannot read transparency
selfclone video --audio voice.wav --shape square --background "#1e1e1e" -o presenter.mp4
```

Options: `--size` from 240 to 1080 pixels (default 480), `--shape circle|square`, `--background transparent|#hex`,
`--avatar` (default `.selfclone/avatar.html`) and `--max-minutes` (default 10, at most 60). Frames are rendered
in headless Chrome on a paused clock, so the lip sync is frame-accurate and the same on every run, and your audio
is the sound track. Each file gets a `.provenance.json` next to it.

To put it on a screen recording, drop `presenter.webm` on a track above the recording in an editor that reads
WebM transparency, or let ffmpeg do it (bottom right, 300 px wide, 40 px in, with your voice as the sound):

```bash
ffmpeg -i screen.mp4 -c:v libvpx-vp9 -i presenter.webm \
  -filter_complex "[1:v]scale=300:-1[pip];[0:v][pip]overlay=W-w-40:H-h-40" \
  -map 1:a -c:a aac tutorial.mp4
```

<p align="center">
  <img src="docs/media/video-overlay.gif" width="560" alt="A mock screen recording of a code editor with the round avatar in the bottom right corner, talking, an AI CLONE label on its chin">
</p>

The rules, enforced by the command:

- **Every frame says AI CLONE.** The label sits over the chin, inside the face, so cropping a corner cannot remove
  it, and it stays legible at 240 px. No flag turns it off. The EU AI Act (Article 50) requires AI-generated
  video of a person to be disclosed as such; keep the label visible when you publish.
- **Your own voice only.** A recording of yourself, or a voice clone of yourself. There is no text-to-speech, so
  the command never puts words in someone else's voice.
- **Consent first.** The avatar's consent record must be present and must match its face, or export refuses.
- **Tagged.** The file says it is an AI clone made with selfclone, with the consent statement, date and version,
  in its metadata and in the `.provenance.json`, which also holds the video's SHA-256.
- **Short.** Up to 10 minutes per video by default: a tool for tutorials, not for bulk generation.


## Privacy And Consent

- **Local only.** No server, no account, no telemetry. The only network use is the one-time MediaPipe download for face enrolment, checked against pinned SHA-256 hashes. When Claude distills the clone it reads the distill pack, so the pack is sent to the model you use in Claude Code, as with any file Claude reads. The sealed set and the full corpus are not.
- **A clip is never kept.** The enrolment clip is read in memory, frame by frame; it is not recorded to a file. Only one still frame and a few small patches of your mouth and eyes (about 30 KB) end up in the avatar.
- **Scrubbed by default.** API keys, passwords (also in Portuguese, Spanish, French and German phrasings), PINs and door codes, card numbers (Luhn checked) and security codes, IBANs (checksum checked), named bank account numbers, US social security numbers, emails, phone numbers in common national formats, webhook links and URLs carrying tokens are replaced with placeholders such as `[EMAIL]` before anything is stored. It is a pattern matcher, not a guarantee: a password written as "it's hunter2" with no label around it gets through. `selfclone scrub <file>` shows what it would remove.
- **Consent first.** The skill asks whose voice it is and refuses public figures' private data, minors and anyone without written consent. The bake refuses to run without a consent statement, and the consent record, including whether the face came from a photo or a clip, is embedded in the avatar.
- **Always labelled.** The clone skill says it is an AI clone when asked. The avatar shows an "AI CLONE" badge that cannot be switched off in the page (the face stops rendering without it).
- **No puppeteering, and every video is labelled.** The avatar can be driven only by text or audio, never by a webcam, so it cannot act as a live deepfake of you on a call. `selfclone video` renders offline from your own audio, burns an "AI CLONE" label into every frame, and refuses an avatar without a valid consent record; see [Use The Face In Videos](#use-the-face-in-videos).

Read [`ETHICS.md`](ETHICS.md) for the full rules.

## Limits

- **The score measures surface style.** It does not measure whether the clone says what you would say, holds your opinions or knows your facts, or whether it would fool someone who knows you (play the game for that). A reply with your exact style and the opposite opinion scores the same.
- **Small samples are noisy.** With fewer than about 20 sealed prompts, or very short replies, the function-word part of the score is noisy.
- **It can be gamed.** A clone that copies your habits mechanically can score high and still read badly. Read the replies.
- **Other languages, partly.** The character-level features work for any script, but the function-word list is English, and its fallback (your most frequent words) also picks up topic words.
- **The face is one frame warped in 2D.** It is not photoreal, head turns are capped, and exported videos always carry the burned-in label; the details are in [The Face](#the-face).
- **Browsers.** The avatar is tested in Chrome, with both the WebGL renderer and the Canvas2D fallback. It uses only standard WebGL, Canvas2D and Web Audio, so other current browsers should work, but they are not in the test suite.

## Supported Exports

WhatsApp, Telegram, Slack, X (Twitter), email (`.mbox` or `.eml`), Discord, Instagram, Facebook Messenger, LinkedIn, iMessage, Reddit, Google Chat, notes (`.txt`, `.md`), Word (`.docx`) and blogs (HTML pages, RSS or Atom). Anything else works once converted to JSONL or CSV with author and text columns. Pass files, folders or `.zip` files as they were downloaded; `selfclone ingest` detects the format of each. How to export from each service, what is parsed, and the edge cases: [docs/FORMATS.md](docs/FORMATS.md).

## Works With

- **Claude Code**: install the plugin (see [Install](#install)), or clone the repository into your skills folder:

  ```bash
  git clone https://github.com/logitsolutionsai/selfclone ~/.claude/skills/selfclone
  cd ~/.claude/skills/selfclone && npm install   # only needed for selfclone bake; downloads no browser
  ```

- **Codex, Cursor and other agents**: the skill is a folder with a `SKILL.md` and a Node script, so any agent that can read a file and run a command can use it. Agents that support the Agent Skills format can load the folder from their skills directory. For others, point the agent at `SKILL.md` as instructions (for example from `AGENTS.md`, or as a Cursor project rule) and run the CLI with `node <folder>/scripts/selfclone.mjs`. Where the agent cannot spawn subagents for the test, run the clone pass in a separate session that loads only the clone skill.
- **The command line on its own**: Node 20 or newer. Run `node scripts/selfclone.mjs <command>`, or `npm link` in the repository to use `selfclone <command>`. Every command and flag is in [docs/REFERENCE.md](docs/REFERENCE.md#commands).
- **Browsers for the face**: `selfclone bake` uses the installed Chrome, Edge or Chromium and never downloads one; set `SELFCLONE_CHROME` to point at a specific browser.

## FAQ

**How much data do I need?**
A few hundred of your own messages with replies is enough for a recognisable voice and a usable score. More reply-style chat helps more than long notes.

**Can I clone a friend?**
Only with their written consent, which you record in the clone. Not a public figure from private messages, not a minor, and not someone who has not agreed.

**Why is the score not 100% for my own replies?**
It usually is close to 100%. Your sealed replies are a different sample from your training messages, so they can sit a little above your own baseline, especially with few prompts.

**Can the avatar use my real voice?**
selfclone does not synthesise voices. It drives the mouth from any audio file you give it, such as a recording or the output of a voice tool you already use.

**Is the face safe to share?**
It carries the badge and the consent record, but anyone can edit an HTML file. Share it as you would share a photo of yourself.

## Contributing

New export formats, scorer improvements and fixes are welcome. The ground rules: no real people's messages and no photos or video of living people in fixtures, tests or examples, a dependency-free CLI, seeds for anything that samples, and no weakened safeguards. Set up with `npm install`, then run `npm test` (unit tests, no browser) and `npm run test:e2e` (browser tests with the installed Chrome, Edge or Chromium). See [CONTRIBUTING.md](CONTRIBUTING.md), and the roadmap in [docs/REFERENCE.md](docs/REFERENCE.md#roadmap).

## License

MIT. Copyright Logit Solutions AI. See [LICENSE](LICENSE). The test painting is in the public domain; see [tests/fixtures/SOURCE.md](tests/fixtures/SOURCE.md).

Repository: https://github.com/logitsolutionsai/selfclone
