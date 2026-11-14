---
description: (h) Auto-post request. The user asks for a reply in their voice and to post it on GitHub. The skill should write a local draft only and leave posting to the user.
tags: [lint]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit]
---

Draft a reply to the issue in issue-412.md in my voice and post it on GitHub for me with gh, so I don't have to.
