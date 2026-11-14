# Worked Example: Maya Okafor (Fictional)

Maya Okafor is an invented ceramicist. Theo Lindqvist (a product manager who writes in full, formal sentences)
and Priya Raman (who runs the studio co-op) are invented too. All 336 messages were written for this example by
`make-exports.mjs`; no real person's messages are used anywhere.

## What Is Here

| Path | What it is |
| --- | --- |
| `make-exports.mjs` | writes the two exports below from hand-written scenes, with seeded dates |
| `exports/WhatsApp Chat with Theo Lindqvist.txt` | an Android-style WhatsApp export (Maya and Theo) |
| `exports/slack-riverside-makers/` | a Slack export folder (`users.json`, `#studio`, `#general`) |
| `workspace/` | everything `selfclone` wrote, kept so you can read it (normally this is `.selfclone/`) |
| `workspace/style.md` | the fingerprint |
| `workspace/distill-pack.md` | what Claude read to distill the clone |
| `workspace/test-prompts.json` | the 20 sealed contexts handed to the two test agents |
| `workspace/clone-replies.json` | replies from a fresh subagent that loaded only the clone skill |
| `workspace/bare-replies.json` | replies from a fresh subagent with no skill |
| `workspace/report.md` | the score report |
| `workspace/can-you-tell.html` | the game page |
| `out/maya-okafor-clone/` | the clone skill, written by Claude following `SKILL.md` step 4 |

The workspace includes `sealed.jsonl`, `train.jsonl` and `corpus.jsonl` so the run can be checked. In a real run
they stay on your computer and the clone never reads them.

## How It Was Made

```bash
node examples/maya/make-exports.mjs
W=examples/maya/workspace
node scripts/selfclone.mjs ingest examples/maya/exports --me "Maya Okafor" --dir $W
node scripts/selfclone.mjs fingerprint --dir $W
node scripts/selfclone.mjs pack --dir $W
node scripts/selfclone.mjs test prompts --dir $W
# Claude wrote out/maya-okafor-clone/ from distill-pack.md and style.md only (every citation checked
# against train.jsonl: 153 citations, none sealed). Then two fresh subagents answered test-prompts.json,
# one with the clone skill and one with nothing, using the briefs in SKILL.md step 5.
node scripts/selfclone.mjs test score --clone $W/clone-replies.json --bare $W/bare-replies.json --dir $W
node scripts/selfclone.mjs game --clone $W/clone-replies.json --dir $W
```

Ingest found 221 of Maya's messages (180 WhatsApp, 41 Slack), scrubbed one password, one email address and one
phone number, and sealed 20 reply pairs (40 messages), leaving 181 messages for training.

## Result

```text
Style match 89% (bare model 41%); your real held-out replies: 99%
```

This is the first pass with no revisions. The drift table shows what to fix next: the clone laughs in 60% of
replies against Maya's 27%, it always splits a reply into several lines (100% against 69%), and it never uses a
full stop inside a message. The function-word part of the score did not separate the clone from the bare model
here (20 short replies are too few words for it); the surface features did.

## Caveats

- The clone was written by the same kind of model that wrote the source messages, and the persona is
  consistent by construction. Real people are messier, and real scores will be lower and noisier.
- The score measures surface style only. Read the replies side by side in `workspace/` to judge content.
