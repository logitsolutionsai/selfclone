# Reference

The commands, the export files, the workspace, the project layout and the roadmap. The README covers what selfclone does and why: [README.md](../README.md).

## Commands

Node 20 or newer. No runtime dependencies apart from `playwright-core` for `selfclone bake`. Run the commands as `node scripts/selfclone.mjs <command>`, or run `npm link` in the repository to use `selfclone <command>`. `selfclone help` prints the same list with every flag.

```bash
node scripts/selfclone.mjs ingest "WhatsApp Chat with Sam.zip" slack-export.zip --me "Your Name"
node scripts/selfclone.mjs fingerprint
node scripts/selfclone.mjs pack
node scripts/selfclone.mjs test prompts
# ...answer .selfclone/test-prompts.json with your clone and with a bare model, saving
# [{"id": "...", "reply": "..."}] as .selfclone/clone-replies.json and .selfclone/bare-replies.json...
node scripts/selfclone.mjs test score --clone .selfclone/clone-replies.json --bare .selfclone/bare-replies.json
node scripts/selfclone.mjs game            # uses the clone replies you just scored
node scripts/selfclone.mjs voicecheck draft.txt --as email   # does this draft sound like me? (- reads stdin)
node scripts/selfclone.mjs export          # ready-to-paste files in out/<slug>-clone/export/
node scripts/selfclone.mjs face            # webcam enrolment: a 10-second clip (better) or one frame, or:
node scripts/selfclone.mjs bake --video me.mp4 --consent "This is my own face. Your Name" --name "Your Name"
node scripts/selfclone.mjs bake --photo me.jpg --consent "This is my own face. Your Name" --name "Your Name"
node scripts/selfclone.mjs serve           # then, from another terminal:
node scripts/selfclone.mjs say "hello, I am an AI clone"
node scripts/selfclone.mjs video --audio my-voice.wav -o presenter.webm   # labelled picture-in-picture clip
```

| Command | What it does |
| --- | --- |
| `ingest <paths...> --me "<name or handle>"` | Parses exports into `.selfclone/` and seals a test set. Options: `--format`, `--no-scrub`, `--seed`, `--name "Display Name"` |
| `scrub <file> [--out file]` | Prints a file with secrets replaced by placeholders |
| `fingerprint` | Measures style on the training split (`style.json`, `style.md`) |
| `pack [--max-chars 60000]` | Writes `distill-pack.md` for Claude to read |
| `test prompts` | Writes `test-prompts.json`: the sealed contexts, without the answers |
| `test score --clone <file> --bare <file>` | Scores both reply sets against the sealed real replies (`report.md`, `report.json`) |
| `game [--clone file] [--rounds 10]` | Writes `can-you-tell.html` |
| `voicecheck <file\|-> [--as message\|post\|email] [--json] [--min 80]` | Scores any draft against your style; a replies JSON file is checked as a set |
| `export [--to all\|system-prompt\|chatgpt\|claude-project\|agents-md\|persona] [--clone out/<slug>-clone]` | Ready-to-paste files for other tools, in `<clone>/export/` |
| `face [--port 7319] [--no-open]` | Webcam enrolment in a local page |
| `bake --photo <img>` or `bake --video <clip>`, with `--consent "<statement>"` | Bakes `avatar.html` in headless Chrome. Options: `--name "Full Name"`, `--glasses auto\|yes\|no`, `--out file` |
| `serve [--port 7320] [--no-open]` | Serves the avatar so other commands can make it speak |
| `say "text"` or `say --audio <file>` | Makes the open avatar speak |
| `video --audio <file> [-o out.webm\|out.mp4] [--avatar file] [--size 480] [--shape circle\|square] [--background transparent\|#hex] [--max-minutes 10]` | Renders the avatar lip-synced to your own recorded voice as a video, with an "AI CLONE" label burned into every frame, provenance tags and a `.provenance.json` sidecar. Refuses without a valid consent record or without audio |
| `status` | Shows what is in `.selfclone/` |

Every command takes `--dir <folder>` for the workspace (default `.selfclone`, or `SELFCLONE_DIR`).

## Export Files

`selfclone export` writes the clone into `out/<slug>-clone/export/`, in the working folder next to `.selfclone/`. Each file is fitted to its target's limit, with the rules that carry the most voice first.

| File | Paste into | Limit |
| --- | --- | --- |
| `system-prompt.md` | any model's system prompt | 12,000 characters (a default; `--max-chars` changes it) |
| `chatgpt-instructions.md` | ChatGPT, Settings, Personalization, Custom instructions | 1,500 characters (Free and Go) or 5,000 (paid plans); both blocks are in the file |
| `claude-project.md` | Claude Project instructions | 16,000 characters |
| `agents-md.md` | `AGENTS.md` (Codex and others) or a Cursor rule, for commit messages, PRs and docs | 6,000 bytes, inside Codex's 32 KiB default for the whole file |
| `persona.json` | your own tools | none |

Every export starts with the rule that it is an AI clone and says so when asked, and cutting to a limit never removes it. Pasting an export into another service sends that service the clone's rules and its examples (scrubbed excerpts of your messages).

## Workspace

Everything a run writes stays in the folder you run it from: the workspace `.selfclone/` (corpus, training and sealed splits, fingerprint, distill pack, test prompts, replies, report and game) and the distilled clone in `out/<slug>-clone/`. Clone output never goes inside the skill folder. The worked example's workspace is in [`examples/maya/workspace/`](../examples/maya/workspace) and its clone in [`examples/maya/out/`](../examples/maya/out).

## Project Layout

| Path | What it holds |
| --- | --- |
| `scripts/selfclone.mjs` | the command line |
| `src/` | ingest, scrubber, split, fingerprint, pack, scorer, voicecheck, export, game, face servers |
| `face/` | enrolment page, clip keyframe selection, avatar template and runtime |
| `templates/` | clone skill templates |
| `examples/maya/` | the worked example |
| `tests/` | unit and browser tests |
| `tools/` | developer scripts: the README media, the clip contact sheet, and the scorer and voicecheck calibration runs |
| `docs/` | [architecture](ARCHITECTURE.md), [formats](FORMATS.md), [scoring](SCORING.md) and this reference |

Tests: `npm test` (unit, no browser) and `npm run test:e2e` (headless Chrome with the installed browser).

## Roadmap

- More export formats: Signal, and Meta's HTML download.
- A second scorer pass on character n-grams for languages other than English. (Tested for English as a third part of Style match and not kept: see [SCORING.md](SCORING.md).)
- Per-contact voice variants (how you write to your boss and to your sister).
- More shapes from the clip: a smile at rest, raised eyebrows, a half blink.
- A "drift fixer" step that turns the drift table into suggested `voice.md` edits.
