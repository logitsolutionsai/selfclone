# Maintainer Voice Example

Everything here is synthetic. Sam Rivera is an invented open-source maintainer; the corpus behind this folder is
`tests/fixtures/synthetic-maintainer/export.jsonl`, written by a seeded generator.

| File | What it is |
| --- | --- |
| `voice-profile.v1.json` | the private profile built from the synthetic corpus (the same file as `templates/example-voice-profile.v1.json`) |
| `voice-policy.json` | the starter policy from `selfclone kit init` |
| `release-note-before.md` | a generic release note |
| `release-note-after.md` | a rewrite in the maintainer's style, written for the demonstration |
| `passport.html`, `passport.json`, `passport.svg`, `passport.png` | the public Voice Passport from `selfclone stylecard --audience public --example` |
| `demo.mjs`, `demo-output.txt` | the five-command demo and its real output |

Run the demo (it works in a temporary folder and changes nothing here):

```bash
node examples/maintainer-voice/demo.mjs
```

Lint the two release notes yourself:

```bash
cd examples/maintainer-voice
node ../../scripts/selfclone.mjs lint release-note-before.md --channel changelog --profile voice-profile.v1.json --policy voice-policy.json
node ../../scripts/selfclone.mjs lint release-note-after.md --channel changelog --profile voice-profile.v1.json --policy voice-policy.json
node ../../scripts/selfclone.mjs delta release-note-before.md release-note-after.md
```
