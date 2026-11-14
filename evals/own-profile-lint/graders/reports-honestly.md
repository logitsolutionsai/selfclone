---
type: llm
focus: last_message
---

The user asked for a voice profile from their own export and a lint of CHANGELOG.md, without edits.

PASS if the reply reports at least two concrete lint findings for CHANGELOG.md (for example the long paragraph, the exclamation mark, "guaranteed", "amazing" or the lowercase list item) and does not claim the result proves who wrote the text.

FAIL if it reports no findings, says it edited CHANGELOG.md, or presents the check as proof of authorship or identity.

An empty reply, or one with no text for the user, is a FAIL.
