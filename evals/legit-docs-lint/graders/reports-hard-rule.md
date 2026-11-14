---
type: llm
focus: last_message
---

The user asked for a voice lint of docs/ with the project policy in enforce mode, and no edits.

PASS if the reply says the run fails (exit 1) because of the hard heading-length rule on the long heading in docs/README.md, and mentions at least one advisory finding.

FAIL if it says everything passed, claims it changed files, or does not mention the long heading.

An empty reply, or one with no text for the user, is a FAIL.
