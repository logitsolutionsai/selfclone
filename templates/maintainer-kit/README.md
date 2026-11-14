# Maintainer Voice Kit

Made by `selfclone kit init`. Nothing here runs on its own, and nothing in this folder holds anyone's writing.

| File | What it is |
| --- | --- |
| `voice-policy.json` | the project's writing rules; edit freely (fields: `schemas/voice-policy.v1.schema.json`) |
| `AGENTS.snippet.md` | a proposed section for `AGENTS.md`; a person decides whether to append it |
| `skills/maintainer-voice/SKILL.md` | the same guidance as a portable agent skill |
| `examples/` | safe example drafts to try the lint on |
| `voice-lint.workflow.yml.sample` | a disabled GitHub Actions starter; review it before copying it to `.github/workflows/` |

Try it:

```bash
node <path-to-selfclone>/scripts/selfclone.mjs lint .selfclone-kit/examples --policy .selfclone-kit/voice-policy.json
node <path-to-selfclone>/scripts/selfclone.mjs kit check --target .
```

Only rules marked `hard` can fail a run, and only with `--enforce`. Style advice from a personal voice profile is
never part of this kit: the profile stays in its owner's private `.selfclone/` folder.
