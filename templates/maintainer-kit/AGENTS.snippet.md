## Writing Style (Maintainer Voice Kit)

This section is a proposal from `selfclone kit init`. A person decides whether to append it to `AGENTS.md`;
the project's own instructions take precedence over it.

When you draft release notes, changelog entries, README edits, issue or pull request replies, or review comments:

- Use the rules in `.selfclone-kit/voice-policy.json` to keep the tone consistent.
- Preserve technical facts exactly: code, commands, file paths, versions, issue numbers and links.
- Run the lint on your draft and fix what it reports:
  `node <path-to-selfclone>/scripts/selfclone.mjs lint <draft.md> --policy .selfclone-kit/voice-policy.json`
- When you rewrite existing text, run the voice delta and do not propose the rewrite if it reports
  E_FACT_PRESERVATION: `node <path-to-selfclone>/scripts/selfclone.mjs delta <before.md> <after.md>`
- Show the changes for human review. Do not post comments, send messages, open pull requests or edit
  documentation unless a person asks for that specific action.
- Never speak as the actual author without disclosure. Drafts in someone's style are drafts for them to review.
