# Agent Guide (Codex, Cursor, Claude Code And Others)

selfclone is an agent skill. [`SKILL.md`](SKILL.md) is the full guide; read it before using the CLI. The CLI
is `node scripts/selfclone.mjs <command>` (Node 20 or newer; run `npm install` once).

## Explainer Videos

To make an animated explainer on any topic, follow
[SKILL.md, Explainer Videos (Studio)](SKILL.md#explainer-videos-studio). In short:

1. **Ask who is on screen:**
   - the user's own drawn character (`selfclone character --photo ... --consent "..."`);
   - random fictional people (`"random:<seed>"`);
   - nobody (`--no-host`).
2. **Write the script.** Check the facts first, keep sentences short and put one idea in each scene.
3. **Start from a template.** `selfclone explainer init --topic "<topic>" --host own|random|dialogue|none` writes a
   starter `scenes.json`; replace every TODO. The format is in SKILL.md, and
   [`schemas/studio-scenes.v1.schema.json`](schemas/studio-scenes.v1.schema.json) gives editor completion (add
   `"$schema"` with its path).
4. **Preview and fix.** `selfclone explainer scenes.json --preview` writes stills and prints storyboard warnings.
   Fix them, then render with `selfclone explainer scenes.json` (add `--html` for an interactive player, or
   `--aspect 9:16` for a vertical video).

## Rules

- **Consent.** Use a real person's face only with their consent, recorded with `--consent`. Never present a
  random character as a real person.
- **Photo avatar.** Animate only your own face or one whose owner gave written consent; the export refuses without a
  consent record.
- **Voices.** A cloned voice must be the user's own, or used with its owner's written consent.
- **Manim.** Manim blocks run as Python on this machine: render only scene files you wrote or trust.

The rest is in [ETHICS.md](ETHICS.md).
