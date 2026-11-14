---
name: maintainer-voice
description: Keep a project's release notes, changelogs, README edits, issue and pull request replies and review comments consistent with its writing policy. Use when drafting or rewriting such text in this repository. Lints drafts with the project's voice policy, preserves technical facts, and leaves every change for human review.
---

# Maintainer Voice

Use the rules in `.selfclone-kit/voice-policy.json` to keep tone consistent across the project's writing.

## Steps

1. Draft the text in a local file. Keep every technical fact exactly: code, commands, file paths, versions,
   issue numbers, links and test results.
2. Lint the draft and fix what it reports:
   `node <path-to-selfclone>/scripts/selfclone.mjs lint draft.md --policy .selfclone-kit/voice-policy.json`
3. If you rewrote existing text, check the rewrite kept every technical token:
   `node <path-to-selfclone>/scripts/selfclone.mjs delta before.md after.md`
   If it reports E_FACT_PRESERVATION, do not propose the rewrite; restore the tokens first.
4. Show the draft and the lint result to a person. Do not post, send, commit or edit project docs unless they ask.

## Limits

- The policy checks surface style and simple rules. It does not check that claims are true.
- Never present a draft as written by a specific person without saying it was drafted with an AI.
- The voice delta protects tokens, not every claim: read the edited lines too.
