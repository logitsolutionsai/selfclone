---
name: selfclone
description: Clone a person's writing voice and way of thinking from their own chat exports into a persona skill, optionally give it a talking face from a 10-second clip or one selfie, and measure how close it gets with a deterministic style score that no language model grades. Use when the user says "clone me", "distill myself", "make a persona of me", "make a skill that writes like me", "give my clone a face", "make my clone talk", "test my clone" or "how close is my clone", or brings WhatsApp, Telegram, Slack, X, email or notes exports to build a persona. Only for the user themself or a person who gave written consent; never public figures' private data, never minors.
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
WhatsApp `.txt` or `.zip`, Telegram Desktop `result.json`, a Slack export folder or `.zip`, the X archive
(`data/tweets.js` or the whole `.zip`), `.mbox` or `.eml` email, plain `.txt` / `.md` notes, and JSONL or CSV with
author and text columns. A folder holding the downloaded `.zip` files works too. More reply-style chat gives a
better clone and a more reliable score; X posts and notes shape the voice but cannot be tested, because they
answer nobody.

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
given). Write "Not scored yet." for `{{FIDELITY}}` now; step 6 replaces it. The `voice.md`, `mind.md`,
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
and say so in the hand-off.

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

### 9. Install The Clone

Copy `out/<slug>-clone/` to `~/.claude/skills/<slug>-clone/` (personal) or `.claude/skills/<slug>-clone/`
(project). Other agents (Codex, Cursor) can load the same folder as instructions; see the README.

## Hand-Off

End with a short summary: messages ingested, sealed pairs, Style match (clone, bare, ceiling), the top drifts,
where the clone skill and the game page are, whether a face was made, and any consent or privacy caveats.
