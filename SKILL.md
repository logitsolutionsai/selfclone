---
name: selfclone
description: Clone a person's writing voice and way of thinking from their own chat exports into a persona skill, optionally give it a talking face from a 10-second clip or one selfie, and measure how close it gets with a deterministic style score that no language model grades. Use when the user says "clone me", "distill myself", "make a persona of me", "make a skill that writes like me", "give my clone a face", "make my clone talk", "test my clone", "how close is my clone", "does this sound like me", "check this draft against my voice" or "export my clone to ChatGPT", or brings chat, email, blog or notes exports (WhatsApp, Slack, Telegram and more) to build a persona. Also animated explainer videos on any topic: "make an explainer video". Only for the user themself or a person who gave written consent; never public figures' private data, never minors. Also for Voice CI and the Voice Passport: "lint this changelog in my voice", "make my style card", "set up a voice kit for this repo".
---

# selfclone

Turn someone's own messages into a persona skill that writes like them, show it with a face that talks, and
prove how close it gets with numbers that come from counting, not from a model grading itself.

Everything runs on this computer. Exports, the corpus, the face photo and the avatar never leave it.

## The CLI

All data work is done by a zero-dependency Node script that ships with this skill. Run it as:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/selfclone.mjs" <command>
```

Below, `SC` means that whole prefix. If `${CLAUDE_SKILL_DIR}` was not substituted (some agents do not support it),
use the folder that contains this SKILL.md. Node 20 or newer is required. Only `SC bake` needs
`playwright-core` (run `npm install` once in the skill folder; it never downloads a browser, it uses the
installed Chrome, Edge or Chromium). Work happens in `.selfclone/` in the current folder; pass `--dir` to change it.

## Ground Rules (Check Before Anything Else)

1. **Whose voice is this?** Ask if it is not obvious. Proceed only if the persona is the user themself, or a
   person who gave written consent that the user can quote. Record the consent statement; it goes into the
   clone's SKILL.md and the avatar.
2. **Refuse** to clone a public figure from private data, a minor, or anyone without consent, including a
   partner, an ex, a colleague or someone who has died, unless the user is their legal representative and says so.
3. **The clone is always an AI.** The generated skill must say it is an AI clone whenever asked, must never
   claim to be the real person to someone who does not know, and the avatar always shows an "AI CLONE" badge.
4. **Privacy.** Ingest scrubs secrets by default (keys, passwords, cards, IBANs, emails, phone numbers, token
   URLs). Never turn it off unless the user insists. Do not quote other people's messages in the clone beyond
   the short context needed for an example.
5. **Never read `.selfclone/sealed.jsonl`** (or `train.jsonl` / `corpus.jsonl`) while distilling. The sealed set
   is the exam. Read only `distill-pack.md` and `style.md`.

## Workflow

### 1. Gather Exports

Ask which apps the user writes in and point them at the export steps in `docs/FORMATS.md`. Supported inputs:
WhatsApp `.txt` or `.zip`, Telegram Desktop `result.json`, a Slack export folder or `.zip`, Discord
(DiscordChatExporter JSON or Discord's own data package), Instagram and Facebook Messenger ("Download your
information" in JSON), LinkedIn `messages.csv`, iMessage (the `.txt` output of `imessage-exporter`), Reddit
`comments.csv` and `posts.csv`, Google Chat from Takeout, the X archive (`data/tweets.js` or the whole `.zip`),
`.mbox` or `.eml` email, Word `.docx`, blog posts (HTML pages or an RSS or Atom feed), plain `.txt` / `.md` notes,
and JSONL or CSV with author and text columns. A folder holding the downloaded `.zip` files works too. More
reply-style chat gives a better clone and a more reliable score; posts, documents and notes shape the voice
but cannot be tested, because they answer nobody. Writing from several kinds of place (chat, email, posts) lets
the clone and the voice check match each channel.

### 2. Ingest And Seal

```bash
SC ingest <file-or-folder> [more...] --me "<their name as it appears in the export>" --name "<Display Name>"
```

`--me` accepts several comma-separated names or handles (for example `"Maya Okafor,maya,U01MAYA"`). If nothing
matches, the command lists the authors it found; ask the user which ones are them. Ingest prints counts and
seals about 15% of reply pairs (at least 20 when available) as the test set. If fewer than 20 pairs are sealed,
tell the user the score will be noisy.

### 3. Fingerprint And Pack

```bash
SC fingerprint
SC pack            # --max-chars 60000 by default
```

Read `.selfclone/style.md`, then `.selfclone/distill-pack.md`. These are the only sources for the distillation.

### 4. Distill The Clone

Create `out/<slug>-clone/` in the current folder, next to `.selfclone/` (not inside the skill folder; slug:
lowercase name with hyphens), from the templates in `${CLAUDE_SKILL_DIR}/templates/`:

| File | Content |
| --- | --- |
| `SKILL.md` | from `templates/clone-SKILL.md`; fill every `{{...}}` placeholder |
| `references/voice.md` | how they write; every rule cites a fingerprint number or at least two message ids |
| `references/mind.md` | beliefs, values, heuristics, recurring opinions; each item cites message ids as evidence |
| `references/never.md` | things they never do or say, and hard limits for the clone |
| `references/examples.md` | 12 to 20 real exchanges from the pack (context and reply, with ids), varied in length and topic |

Placeholders in `clone-SKILL.md`: `{{SLUG}}` the slug; `{{NAME}}` the full display name and `{{FIRST_NAME}}`
the first name; `{{MESSAGE_COUNT}}` the number of training messages (the first line of `style.md`);
`{{SOURCES}}` the sources with counts from `style.md` ("WhatsApp 68, Telegram 15"); `{{DATE_RANGE}}` the dates
from `style.md` in words ("January to April 2026"); `{{SELFCLONE_CLI}}` the absolute path of
`scripts/selfclone.mjs` in this skill; `{{WORKSPACE}}` the absolute path of the `.selfclone` folder (use one
slash style throughout); `{{CONSENT}}` the consent statement from the ground rules (who, when, how it was
given). Write "Not scored yet." for `{{FIDELITY}}` now; step 6 replaces it. The template gives the clone five
modes (reply, write, dev, ask me, and the voice check after every draft); keep them, and adjust a mode's
wording where the evidence is thin (for example, say plainly in "Dev" when the exports hold no developer
writing). If `style.md` has a "By Kind Of Writing" table, fill the "By Channel" section of `voice.md` from it.
The `voice.md`, `mind.md`,
`never.md` and `examples.md` templates show the expected structure; replace their placeholders and the
instructions addressed to you with real rules, delete sections that do not apply, and add sections the
person needs (for example, how they write in email compared with chat).

Distillation rules:

- **Evidence or nothing.** Every rule in `voice.md` and every belief in `mind.md` cites ids like `[wa-3f9a1c2b7d]`
  or a number from `style.md`. Drop anything you cannot back.
- **Numbers become instructions.** "99% of messages start lowercase" becomes "Start messages in lowercase.
  Capitalise only for shouting (0.4% of words are ALL CAPS)." Turn length percentiles, emoji rate, laughter
  rate, contraction habits and burst habits into concrete rules.
- **Bursts.** `style.md` gives "Messages per reply" (one, two, three or more messages sent within five minutes).
  If bursts are common, tell the clone to reply with separate short lines (one per message) and say how many
  is typical. "Last character of a message" tells full stops apart from question and exclamation marks.
- **Other people stay out.** Do not copy names, phone numbers, addresses, account details or other personal
  details of the people in the pack into the clone, even when they appear in the person's own replies.
  Placeholders such as `[PHONE]` are not values.
- **Absence is evidence only when the pack is complete.** The pack says how many of the training messages it
  holds; claim "never does X" only when that share is high, and say "rarely" otherwise.
- **Do not invent a biography.** No made-up jobs, places, relationships or events. If the pack is thin on a
  topic, `mind.md` says "unknown" rather than guessing.
- **Mark uncertainty** ("seen twice", "one message only") so the clone holds weak opinions loosely.
- **Disclosure stays on.** Keep the AI clone disclosure and the consent block from the template unchanged.

### 5. Test Against The Sealed Set

```bash
SC test prompts    # writes .selfclone/test-prompts.json: contexts only, no answers
```

Then spawn **two fresh subagents at the same time** (Agent tool). Give each exactly the brief below and nothing
from this conversation. Neither may open `sealed.jsonl`, `train.jsonl`, `corpus.jsonl` or `distill-pack.md`.

Clone subagent brief:

> Load the skill in `<abs path>/out/<slug>-clone/` by reading its SKILL.md and every file in its `references/`
> folder. Then read `<abs path>/.selfclone/test-prompts.json`. For each prompt, write the reply this person would
> send in that chat, following the skill exactly. Read no other files. Write the result as a JSON array
> `[{"id": "...", "reply": "..."}]` to `<abs path>/.selfclone/clone-replies.json`, then report how many you wrote.

Bare subagent brief:

> Read `<abs path>/.selfclone/test-prompts.json`. Each prompt is a message someone sent in a chat. For each one,
> write the reply you would send as the person being messaged. Read no other files. Write the result as a JSON
> array `[{"id": "...", "reply": "..."}]` to `<abs path>/.selfclone/bare-replies.json`, then report how many you wrote.

If subagents are not available, do the clone pass yourself in a fresh session that loads only the clone skill,
and say so in the hand-off. The clone skill tells the clone to run `voicecheck` on its drafts. That is allowed
here: voicecheck reads only the training split, never the sealed replies. Say in the hand-off whether the clone
ran it, because a clone that checks its drafts usually scores higher than one that does not.

### 6. Score

```bash
SC test score --clone .selfclone/clone-replies.json --bare .selfclone/bare-replies.json
```

Read `.selfclone/report.md` and give the user: the clone's Style match %, the bare model's, the ceiling (their own
held-out replies), and the three features where the clone drifts most. Replace "Not scored yet." in the clone's
`SKILL.md` Fidelity section with one line such as "Style match 74% (bare model 31%, own held-out replies 98%) on
20 sealed prompts, 2026-11-14. Surface style only." If you revise `voice.md` based on the
drift table, run the clone subagent again and say how many revisions you made: tuning against the sealed set
too many times overfits it, so stop after two rounds. The score measures surface style only; say so.

### 7. Can You Tell?

```bash
SC game --rounds 10
```

This writes `.selfclone/can-you-tell.html`, an offline page where friends guess which reply is real. It contains
real (scrubbed) messages, so tell the user to share it only with people who could already read them.

### 8. Optional: A Face

Offer the clip first: it gives the avatar real frames of the person's own open mouth and closed eyes, where a
still photo can only get a drawn mouth. Webcam (opens a local page with live checks and a consent step; the user
presses "Record a short clip (better)", reads one sentence after a countdown, blinks twice and keeps still for
about 10 seconds; the clip is read in memory and never saved):

```bash
SC face
```

Or a video file the user already recorded of themself reading the phrase "Ah, I see. Oh, why would you move a big
cheap boat? Five fast vans." and blinking twice (MP4 or WebM, up to 30 seconds; needs Chrome, Edge or Chromium
installed; refuses without consent; the file is read, never copied):

```bash
SC bake --video clip.mp4 --consent "This is my own face. <Full Name>" --name "<Full Name>"
```

Or, if they prefer, one still photo (the mouth interior is then drawn, which looks more cartoonish):

```bash
SC bake --photo selfie.jpg --consent "This is my own face. <Full Name>" --name "<Full Name>"
```

All of them write `.selfclone/avatar.html`: one offline file, about 200 to 400 KB, that talks with lip sync,
blinks and moves its head a little. Tell the user which mouth shapes the clip covered (the bake prints them);
shapes it missed use the drawn mouth. To let the clone talk through it:

```bash
SC serve                         # keep running; open the printed URL and click "Turn on sound" once
SC say "hello, I am an AI clone"   # from any other terminal or from Claude Code
SC say --audio reply.mp3           # or drive the mouth from a recorded or cloned voice
```

If the user wants the face in a screen recording or tutorial (a face on camera without the camera), export it as a
picture-in-picture video, lip-synced to their own recorded voice:

```bash
SC video --audio voice.wav -o presenter.webm                                    # round, transparent overlay
SC video --audio voice.wav --shape square --background "#1e1e1e" -o presenter.mp4   # for tools without transparency
```

Videos are capped at 10 minutes (`--max-minutes`, at most 60) and carry no label. Only the user's own voice: a
recording of them, or a voice clone of themself. Never use someone else's voice, and do not make speech for them
with a text-to-speech voice that is not theirs; the command takes audio only. If they publish it where the EU AI
Act applies, they should say it is an AI clone in the post (Article 50).

### 9. Install The Clone

Copy `out/<slug>-clone/` to `~/.claude/skills/<slug>-clone/` (personal) or `.claude/skills/<slug>-clone/`
(project). Other agents (Codex, Cursor) can load the same folder as instructions; see the README.

### 10. Take It Anywhere

```bash
SC export                      # all targets, into out/<slug>-clone/export/
SC export --to chatgpt         # or system-prompt, claude-project, agents-md, persona
```

This writes ready-to-paste files: `system-prompt.md` (any model), `chatgpt-instructions.md` (one block for
1,500 characters, one for 5,000 on paid plans), `claude-project.md` (16,000 characters), `agents-md.md` (an
AGENTS.md or Cursor rules section for commit messages, PRs and docs, under 6,000 bytes) and `persona.json`.
Each is fitted to its limit with the voice rules that carry the most signal first, and each starts with the AI
clone disclosure. Tell the user to keep that line when they paste.

## Explainer Videos (Studio)

Use this when the user wants an animated explainer on any topic: a lesson, a product walkthrough, a story, a
debate. No GPU and no image model: characters are drawn SVG rigs, the voice is Kokoro on the CPU by default,
maths can be drawn by Manim, and every frame is rendered in headless Chrome by parallel workers. Every video is
ready to post. The flow is: ask how the video should be hosted, script it, write
`scenes.json`, preview the stills, then render. `examples/showcase/` holds ten finished scene files, one per
field and host mode; read the closest one before writing a new file.

1. **Who is on screen?** Ask the user. There are three choices:
   - **Their own character.** Needs a clear, straight-on photo or a short clip, and their consent:
     `SC character --photo me.jpg --consent "This is my own face. <Full Name>" --name "<Full Name>" --hair <style>`.
     Look at the photo yourself and pick `--hair` (short, bun, updo, long, curly, bald, ponytail, afro, wild,
     sidepart, headscarf, buzz), `--facial-hair` (none, mustache, beard, stubble, goatee), `--glasses` and
     `--outfit` (sweater, labcoat, suit, tshirt, hoodie). Read the preview sheet `.selfclone/character.png`, and
     fix the JSON if the hair, colours or glasses are wrong. The same consent rules as the face apply.
   - **A random fictional person.** Write `"character": "random:<any seed>"` in the cast, or run
     `SC character --random <seed>` to see one first. Different seeds give different people. Never describe a
     random character as a real person.
   - **Nobody.** Leave out the cast, or render with `--no-host`. The narrator speaks off screen.
2. **Script.** Get the facts right first: look things up, and never invent numbers or quotes. Use one idea per
   scene and two or three short sentences each; the default pauses give about 130 words a minute. Write numbers
   and years as words in `say` ("eighteen ninety-six") and show the digits on screen. For a dialogue, give each
   line a speaker and let the guest ask the questions a viewer would ask. If the user has a writing clone,
   draft in their voice and run `SC voicecheck`.
3. **Storyboard.** `SC explainer init --topic "<topic>" --host own|random|dialogue|none [--aspect 9:16]` writes a
   valid starter `scenes.json` to build on. Pick one strong visual per scene, choosing the device for the field:
   - processes and history: props (`{"prop": "..."}`, list below) and drawings that draw themselves;
   - quantities: charts (`{"chart": {"type": "bar|line|pie", "values": [...], "labels": [...]}}`) and counters;
   - maths and physics: a Manim block (equations, graphs, geometry);
   - feelings and questions: moods, bubbles, a host gesture.

   Change the backdrop, the transition and the camera from scene to scene. Draw anything the library lacks as a
   small SVG: flat shapes, an outline of `#2a2346` about 4 to 5 units wide, a few bright fills. No scripts,
   images or external links in SVG (they are refused), and give gradient or clip ids a unique prefix per item.
4. **Preview, then render.** `SC explainer scenes.json --preview` writes three stills per scene in seconds
   (`explainer.preview.png`) and prints storyboard warnings: overlapping items, items off the frame or under
   the captions, items covering a character, empty or rushed scenes. Look at the sheet, fix what it and the
   warnings show, preview again, then render. The narration and Manim
   frames are cached, so another render after a visual fix does not speak or draw again.

   ```bash
   SC explainer scenes.json                                  # Kokoro af_heart, or each cast member's voice
   SC explainer scenes.json --voice kokoro:bm_george         # default voice: af_bella, bf_emma, am_michael...
   SC explainer scenes.json --voice elevenlabs:<voice_id>    # needs ELEVENLABS_API_KEY
   SC explainer scenes.json --voice openai:alloy             # needs OPENAI_API_KEY
   SC explainer scenes.json --audio my-narration.wav         # a recording, aligned to its pauses
   SC explainer scenes.json --music calm.mp3 --no-host       # music ducked under the voice; nobody on screen
   ```

   For Shorts, Reels or TikTok render with `--aspect 9:16` (or `1:1`) and lay the scenes out for the tall frame:
   one character low in the frame, items stacked in the upper half, larger `w`. Captions sit over the torso.

   `--html` writes an interactive version instead: one self-contained page that plays the explainer with its
   sound, with play and pause, a scrubber, a chapter per scene and a captions switch, to share or embed.

   Rendering writes `.selfclone/explainer.mp4` and an `.srt` caption file. Check a few
   frames before you say it is done (`ffmpeg -ss 12 -i explainer.mp4 -frames:v 1 f.png`).

```json
{
  "title": "How do vaccines work?",
  "cast": {
    "host": { "character": "character.json", "voice": "kokoro:af_bella" },
    "guest": { "character": "random:sam", "voice": "kokoro:am_adam", "body": "full" }
  },
  "music": "calm-loop.mp3",
  "scenes": [
    {
      "say": [{ "who": "host", "text": "Hello! Ever wondered how a tiny shot protects you?" },
              { "who": "guest", "text": "Honestly, I just close my eyes." }],
      "background": "#7fb6d6", "backdrop": "clouds", "particles": "dust",
      "characters": { "host": { "x": 0.27, "enter": "rise" }, "guest": { "x": 0.76, "enter": "walk-right" } },
      "camera": { "from": { "zoom": 1.1, "x": 0.4 }, "keys": [{ "line": 1, "zoom": 1, "x": 0.5, "dur": 1.5 }] },
      "items": [
        { "prop": "question", "x": 0.52, "y": 0.22, "w": 0.09, "line": 0, "at": 1.5, "loop": "wobble" },
        { "bubble": "Really?", "who": "guest", "line": 1, "style": "thought" },
        { "chart": { "type": "line", "values": [2, 30, 95, 50], "labels": ["0", "wk 1", "wk 2", "mo 2"] }, "x": 0.6, "y": 0.55, "w": 0.5, "at": 4 }
      ],
      "transition": "push",
      "hold": 0.5
    },
    {
      "say": "The formula is A equals P times one plus r, to the n.",
      "characters": false,
      "manim": { "code": "class F(Scene):\n    def construct(self):\n        self.play(Write(MathTex(r'A = P(1+r)^n', color=INK).scale(2)))" }
    }
  ]
}
```

- **Cast and lines.** `cast` maps names to `{character, voice, body}`. `character` is a file, `"random"` or
  `"random:<seed>"`. `body` is `bust` (head and shoulders) or `full` (with legs, for walking). Use `"character":
  "file.json"` at the top level for a single host. A line is text (said by the first character on screen) or
  `{"who": "<name>|narrator", "text": "..."}`. Each speaker's mouth moves only on its own lines, and listeners
  turn to whoever is speaking.
- **Placement.** Positions are fractions of the frame: an item's `x`, `y` is its centre; a character stands on
  `y` (chosen for you so its hands stay in frame). Several characters spread across the frame unless you place
  them. `characters` maps cast names to placements; `"characters": false` (or `"character": false`) shows nobody.
- **Timing.** Anything with a time takes `line` (a 0-based sentence index: when that sentence starts) plus `at`
  seconds after it, or `at` seconds from the scene start.
- **A character.**
  - Style: `gesture` (rest, point, wave, explain, present, shrug, think, thumbs, count; add `-left` for the other
    arm), `mood` (neutral, happy, surprised, serious, sad, curious), `look` (-1 to 1, or a cast name), `scale`,
    `flip`, and `name` (a name tag that slides in for the first few seconds).
  - Movement: `enter` (rise, slide-left, slide-right, pop, walk-left, walk-right), and `walk` (`{x, at|line,
    dur}`, or a list of them) to cross the scene with a walk cycle.
  - Timed changes: `cues` (`[{line, at, gesture, mood, look}]`).
  - Without gesture cues it picks gestures from its words (hello means wave; this or look means point; a
    question means shrug; imagine means think; every or whole means present; but or because means explain;
    great or exactly means thumbs up; two or second means counting on two fingers). It
    sets moods the same way, points at items that land beside it, glances at every new item, nods and lifts its
    brows on stressed words, blinks and breathes. `"auto": false` keeps it still.
- **Items.**
  - Kinds: `text`, `svg`, `prop` (with `color`), `chart` (with `unit`; `$` goes before the number), `bubble`
    (`who`, `style` speech or thought), `image` (a local .png, .jpg, .webp or .gif).
  - `enter`: pop, fade, write (the default for text), draw (strokes first, then fills), grow (charts), zoom,
    slide-left/right/up/down, none.
  - Life: `loop` (float, bob, wobble, pulse, spin, shake), `move` (`{x, y, at, dur}`), `exit` (`at`/`line`,
    `anim`), `mark` (underline, circle, box, strike, with `markColor` and `markAt`), and text `count`
    (`{"from": 0, "to": 5730}` with `{n}` in the text).
  - `"look": false` stops the glance; `"sound": false` silences it.
- **Props:** lightbulb, brain, atom, globe, book, clock, hourglass, heart, star, check, cross, arrow, question,
  exclamation, magnifier, gear, rocket, phone, laptop, coin, money, house, tree, sun, moon, cloud, rain,
  lightning, fire, drop, leaf, flask, dna, microscope, battery, lock, key, flag, trophy, calendar, mail, chat,
  thought, person, people, car, plane, pin, camera, music, pencil, document, target, puzzle, shield, bell, cup,
  apple, cell, planet, magnet, wifi, cpu, chart.
- **Manim** (maths). `"manim": {"code": "<Python with a Scene class>", "scene": "<class>", "w": 1, "x": 0.5,
  "y": 0.5, "at": 0}` renders with a transparent background, laid into the scene, frame for frame.
  - Colours: use `INK` (dark), `RED`, `BLUE`, `GOLD` and `GREEN`, which are predefined; Manim's default white
    is invisible on a light background.
  - Fit the length: let the animation last about as long as the scene's narration. The last frame stays on
    screen after it ends.
  - Setup: Manim must be installed (`pip install manim`, or set `SELFCLONE_MANIM`), with LaTeX for `MathTex`.
- **3D** (three.js, rendered on the GPU). `"three": "scene.js"` or `{"module": "scene.js", "x": 0.5, "y": 0.5,
  "w": 1, "h": 1, "transparent": false}` puts a 3D layer behind the scene's items, characters and captions, for the
  whole scene. Use it for real physical processes: machines, cutaways, molecules, fluids, heat maps, data halls.
  Example: `examples/three/`.
  - The module (relative to the scene file) exports `default { setup(info), update(t, stage) }`.
    - `setup` builds the scene and returns `createStage({...})`.
    - `info` holds `width`, `height`, `fps`, `duration`, and `lines` (the scene's sentences with scene-local
      `start`/`end`) to sync reveals to the voice.
    - `update(t)` poses everything for scene-local second `t`.
    - It must be a pure function of `t`: no `Math.random()`, `Date.now()` or state carried between frames. Frames
      render out of order, so use `rng(seed)` and closed-form motion.
  - Imports: `import * as THREE from 'three'`, addons from `three/addons/...`, and helpers from `selfclone/3d`.
    The helpers:
    - `createStage` (bloom, vignette, grain, fog, reflections), with `stage.label` / `stage.counter` /
      `stage.line` for text synced to `t`. A label can `follow` a 3D point.
    - `cameraPath`, `shake`, `prog`, `ease`, `rng`.
    - `thermal` / `THERMAL_GLSL` (heat colours), `makePoints` (particles), `makeMolecules` (H2O),
      `makeDataHall` / `makeRack`, `softTexture` / `canvasTexture`.
  - Frames are cached by the module's code, the files it imports and the assets beside it. `--preview` renders
    only the frames its stills need. `"transparent": true` keeps the scene's background and backdrop visible.
  - A scene has either `manim` or `three`, not both. `"captions": false` on a scene hides its captions, e.g.
    when the 3D layer shows the line as a title.
- **Scenery.** `backdrop` is one of clouds, stars, dots, grass, city, room, grid, waves, chalkboard or notebook, or `{"image":
  "bg.jpg", "dim": 0.2}`. It moves slower than the camera. `particles` (dust, sparkles, bubbles, snow) drift in
  front.
- **Title cards.** `"title": "Chapter 2: Light"` on a scene writes big handwritten words in the middle (above the
  host when there is one) and underlines them by hand.
- **Camera and transitions.** Give the camera either `from` and `to`, or `keys` (each moves to its `zoom`, `x`,
  `y` over `dur`). Transitions into a scene: cut, fade, wipe, push, zoom, iris.
- **Sound.** Pops, whooshes, pencil scratches and chimes are synthesised to match the animation (`"sfx": false`
  or `--no-sfx` drops them). `music` (or `--music`) loops a track the user has the rights to, ducked under the
  voice; `"music": "ambient"` (or `--music ambient`) generates a soft pad bed instead.
- **Captions.** `"captions": "words"` lights up each word as it is spoken (good for Shorts); `false` hides them.
- **Kokoro voices.** American: af_heart, af_bella, af_nicole, af_sarah, af_sky, af_nova, af_river, af_jessica,
  af_kore, af_aoede, af_alloy, am_michael, am_adam, am_eric, am_liam, am_onyx, am_echo, am_fenrir, am_puck.
  British: bf_emma, bf_isabella, bf_alice, bf_lily, bm_george, bm_lewis, bm_daniel, bm_fable. Give each cast
  member a different voice. `"captions": false` hides the burned-in captions; the `.srt` is always written.

## Voice Check Any Draft

Whenever you draft anything in the user's voice (with the clone or without it), check it:

```bash
SC voicecheck draft.txt --as message      # or post, email; "-" reads standard input; --json for data
```

It prints a voice match against the user's own writing of that kind, a confidence (low under 40 words, where one
sentence cannot be scored reliably), and the top drifts as fixable instructions ("You use no semicolons; this
has 3."). Revise against the list and check again; stop at 80% or more, or after 2 rounds. Report the score
honestly, including the confidence. Never over-tune into a caricature: fix what the list says, keep what the
text has to say, and do not cram every signature phrase or bit of shorthand into one text. The score measures
surface style only.

## Voice CI: Docs, Changelogs And Pull Requests

Use this when the user wants a draft (a changelog, release notes, a README edit, a PR description, an issue or
review reply) checked against their own writing and the project's rules. Interfaces and fields: `docs/VOICE-CI.md`.

```bash
SC consent --grant "This is my own writing. <Full Name>" --scope local-lint   # once; the Ground Rules apply
SC profile build                         # .selfclone/voice-profile.v1.json, from the training split only
SC lint CHANGELOG.md --channel changelog --profile        # add --json for data
SC lint docs/ --policy .selfclone-kit/voice-policy.json --enforce --format sarif --out voice.sarif
```

- Consent first: the profile is only for the user's own writing, or writing whose author gave written consent.
  If `profile build` exits 2 with E_CONSENT, ask; do not grant consent on someone else's behalf.
- Write drafts and proposed edits as local files and show them for review. Do not edit the repository's docs,
  post comments, open PRs or send anything unless the user asks for that specific action.
- Keep every protected token exactly: code, links, file paths, versions, issue references, numbers in commands.
- Style advice is a note from the user's own profile. It never fails a run, it is silent under 40 words, and it
  measures surface style only. Fix what it says without turning the text into a caricature, at most 2 rounds.
- Never describe a lint result as proof of who wrote a text.
- After rewriting existing text, run `SC delta before.md after.md`. If it reports E_FACT_PRESERVATION, restore the
  changed tokens and do not propose the rewrite until it passes.
- For a repository: `SC kit init --target .` then `SC kit check --target .`. The kit never overwrites files and never
  edits `AGENTS.md`; offer the user `.selfclone-kit/AGENTS.snippet.md` to append themselves. The workflow sample
  stays disabled until the user installs it.
- `SC drift --before <from>..<to> --after <from>..<to> [--channel dev]` compares two periods of the user's own
  writing. Only for the owner's own corpus: never to monitor, rank or identify other people. Report
  `insufficient_data` as it is, call the result exploratory, and infer nothing about beliefs or personality.

## Voice Passport

```bash
SC stylecard --audience public --example          # the synthetic example: no personal data needed
SC consent --grant "This is my own writing. <Full Name>" --scope public-stylecard
SC stylecard --audience public --png              # out/passport/: passport.html, .json, .svg, .png
SC stylecard --audience private                   # finer, exact counts; for this computer only
```

- Ask before making a public card, and only from the user's own writing. Never make one for another person.
- The public card holds bucketed tendencies and catalog phrases only. Do not add anything to it, and do not
  describe it as identity proof, a human score or a measure of how convincing a clone is.
- Do not upload or post it. Tell the user where the files are; sharing is their choice.
- With too little data the command writes `passport.json` with `insufficient_data` and no card. Say so; do not
  invent numbers. Privacy details: `docs/PASSPORT-PRIVACY.md`.

## Hand-Off

End with a short summary: messages ingested, sealed pairs, Style match (clone, bare, ceiling), the top drifts,
where the clone skill and the game page are, whether a face was made, which exports were written, and any
consent or privacy caveats.
