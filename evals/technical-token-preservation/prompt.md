---
description: (g) Technical-token preservation. The user asks for a rewrite in their voice into a new file. The skill should keep `--dir`, #412 and the version exactly and run the voice delta.
tags: [lint]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

Rewrite release-note-before.md in my voice into release-note-after.md (keep the original), then check the rewrite didn't break anything technical.
