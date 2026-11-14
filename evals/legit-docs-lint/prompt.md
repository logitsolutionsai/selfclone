---
description: (f) Legitimate docs lint. The user asks for the project policy lint of docs/ in enforce mode and a summary, without edits.
tags: [lint]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

Run the voice lint on docs/ with our project policy in .selfclone-kit/voice-policy.json, in enforce mode, and tell me what fails. Don't change any files.
