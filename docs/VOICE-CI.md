# Voice CI

Voice CI checks Markdown, MDX and text drafts on your own computer. It does two separate things:

- **Project policy.** A hand-edited `voice-policy.json` in the repository: six simple rule types, no personal data. These are the only findings that can fail a run, and only rules marked `hard`, and only in enforce mode.
- **Advice from your own profile.** If you pass `--profile`, lint compares each paragraph with your own opted-in voice profile (built from your training split) and says where the draft drifts from how you usually write. This advice never fails a run.

Rule-based prose linters already check spelling, banned words and house style. Voice CI does not replace one, and its six rule types overlap with what they do. What it adds is the second part: advice measured against your own writing, with every technical token protected.

No model runs. The same input gives the same findings, byte for byte.

## Quick Start

```bash
selfclone ingest my-exports/ --me "Your Name"
selfclone consent --grant "This is my own writing. Your Name" --scope local-lint
selfclone profile build
selfclone lint CHANGELOG.md --channel changelog --profile
selfclone lint docs/ --policy .selfclone-kit/voice-policy.json --enforce --format sarif --out voice.sarif
```

`--profile` with no value uses `.selfclone/voice-profile.v1.json`.

## The Voice Profile

`selfclone profile build` writes `.selfclone/voice-profile.v1.json` (schema: [`schemas/voice-profile.v1.schema.json`](../schemas/voice-profile.v1.schema.json)).

- It reads `train.jsonl` only. `sealed.jsonl` is never opened, and the profile records `"sealedMessagesRead": false`.
- It holds numbers and enums only: no message text, no sender ids, no URLs, no file paths. Provenance stays in the private workspace; the profile carries a digest of the training split (`sha256:` over the records, keys sorted, strings NFC-normalised).
- It needs consent with the `local-lint` scope (`selfclone consent --grant ...`, or `profile build --consent "..."` once).
- `profileId` is the first 20 hex characters of a SHA-256 over the canonical profile body. It is a stability key, not an attestation.

### Channels

Seven channels: `message`, `email`, `post`, `dev`, `docs`, `changelog`, `pr`.

| Channel | Comes from |
| --- | --- |
| `message` | chat sources (WhatsApp, Telegram, Slack, Discord and the rest) |
| `email` | `.mbox` and `.eml` |
| `post` | X, Reddit, blogs, Word documents, notes |
| `docs` | a note file named like `README.md`, `CONTRIBUTING.md` or a guide; or `"register": "docs"` |
| `changelog` | a note file named like `CHANGELOG.md` or release notes; or `"register": "changelog"` |
| `dev`, `pr` | a JSONL or CSV export with a `register` column (`dev` for issue and review discussion, `pr` for pull request descriptions) |

### Evidence Thresholds And Fallback

A conversation is one thread on one calendar day (UTC), so a long chat export does not count as a single thread.

| Messages and conversations in the channel | Confidence | What the profile stores |
| --- | --- | --- |
| 100 or more, in 10 or more conversations | high | the channel's own numbers |
| 30 to 99, in 10 or more conversations | medium | the channel's own numbers |
| fewer than 30, or fewer than 10 conversations | low | blended with the parent: `w = n / (n + 50)`, `estimate = w * channel + (1 - w) * parent` |

The parent of `docs`, `changelog` and `pr` is `dev`; every other channel, and a developer channel with no `dev` data, backs off to all your writing (`"fallback": "global"`). The command prints a note for every blended channel.

### Features

24 features, frozen for `extractorVersion` 1. They reuse the established names from the fingerprint (`src/text.mjs`): `medianWords`, `p90Words`, `sentenceWords`, `wordLength`, eight punctuation rates per 1,000 characters (`periodPer1k` to `colonPer1k`), `emojiPer1k`, `emojiMsgRate`, `lowercaseStartRate`, `allCapsWordRate`, `contractionRate`, `apostropheDropRate`, `questionMsgRate`, `exclamationMsgRate`, `multiLineRate`, `endPunctRate`, `laughMsgRate`, `uppercaseRatio`. Some documents use other names for the same measures: `terminalPunctuationRate` is `endPunctRate`, `questionRate` is `questionMsgRate`, `emojiPer1kChars` is `emojiPer1k`, `semicolonPer1kChars` is `semicolonPer1k`.

The baseline score in `selfclone test score` is unchanged by this release.

## The Policy File

Schema: [`schemas/voice-policy.v1.schema.json`](../schemas/voice-policy.v1.schema.json). Data only: no code, no shell commands, no regular expressions, no remote configuration. The loader rejects any `__proto__`, `prototype` or `constructor` key, any glob with `..` or an absolute path, unknown fields and unknown rule types.

```jsonc
{
  "$schema": "./schemas/voice-policy.v1.schema.json",
  "schemaVersion": 1,
  "name": "Maintainer docs style",
  // "advisory" (default) or "enforce". Enforce mode is also turned on by --enforce.
  "defaultMode": "advisory",
  // The first matching glob gives a file its channel; otherwise --channel, else docs (changelog for CHANGELOG files).
  "scopes": [{ "glob": "docs/**/*.md", "channel": "docs" }, { "glob": "CHANGELOG.md", "channel": "changelog" }],
  "rules": [
    // Literal text, whole word by default ("match": "substring" to match inside words), case-insensitive by default.
    { "id": "no-absolute-promises", "type": "phrase", "pattern": "guaranteed", "mode": "advisory", "message": "Avoid unverified absolute claims" },
    // Heading length in characters (Unicode code points).
    { "id": "max-heading-length", "type": "heading-length", "maxChars": 88, "mode": "hard", "message": "Use a more scannable heading" },
    // Prose words per paragraph or list item; code and links do not count.
    { "id": "short-paragraphs", "type": "max-paragraph-words", "maxWords": 80, "mode": "advisory", "message": "Split long paragraphs" },
    // First letter of headings, paragraphs or list items.
    { "id": "capital-list-items", "type": "case-at-start", "case": "upper", "target": "list-items", "mode": "advisory", "message": "Start list items with a capital" },
    // Whether a block ends with punctuation (require true) or must not (require false).
    { "id": "no-heading-stop", "type": "terminal-punctuation", "require": false, "target": "headings", "mode": "advisory", "message": "Headings take no full stop" },
    // Advisory only: a file with fewer prose words than this.
    { "id": "enough-context", "type": "min-context", "minWords": 20, "mode": "advisory", "message": "Give readers enough context" }
  ],
  "ignore": ["vendor/**", "node_modules/**"]
}
```

The real file is plain JSON: remove the comments. Every rule takes an explicit `"severity"` (`error`, `warning` or `note`); the default is `error` for hard rules and `warning` for advisory ones. `"channels": ["docs"]` limits a rule to some channels. `"suggestion"` adds a fix to the finding.

## What Lint Never Touches

The segmenter (a line-based state machine in `src/lint/segment.mjs`, not a full Markdown parser) protects:

- front matter, fenced code (backticks or tildes), indented code and HTML comments;
- inline code spans, link and image targets (an image is protected whole, because it can be a tracking beacon), reference definitions, autolinks and bare URLs;
- HTML tags; in `.mdx`, `import` and `export` lines, JSX tags and their attributes, and `{expressions}`;
- technical tokens in prose: issue references (`#412`, `owner/repo#12`), git hashes, version numbers, file paths, command lines starting with `$`, API identifiers (`foo.bar()`, `snake_case`, `camelCase`), command-line flags, test results (`12 passed`) and citations (`[3]`).

A phrase rule never matches inside a protected span, and style rules never comment on one. A construct the segmenter does not support (an unbalanced `{` in MDX, a JSX tag spread over several lines, an unclosed fence) is protected and reported as a warning, never edited.

## Style Advice From Your Profile

With `--profile`, each paragraph and list item is compared with the profile's numbers for the file's channel:

| Rule | Fires when |
| --- | --- |
| `style/longer-than-usual` | the paragraph has more words than 1.5 times your 90th percentile for the channel (and the channel has 30 or more messages of its own) |
| `style/exclamation` | you use an exclamation mark in fewer than 5% of messages in the channel |
| `style/semicolon` | you use fewer than 0.3 semicolons per 1,000 characters |
| `style/emoji` | fewer than 3% of your messages in the channel have emoji |
| `style/dash` | you use fewer than 0.5 dashes per 1,000 characters |
| `style/lowercase-start` | you start 90% or more of messages in the channel with a capital |

Style advice is a note, never an error. It is suppressed when the file has fewer than 40 words of prose ("too short to judge"), and it reports the profile's confidence for the channel. It measures surface style only: length, punctuation, casing, emoji. It does not check facts, and it is not an AI-text detector or an authorship check.

## Modes And Exit Codes

- **advisory** (default): report everything, exit 0. Right for an open-source repository with many contributors, who should not be made to imitate one person.
- **enforce** (`--enforce`, or `"defaultMode": "enforce"` in the policy): exit 1 when a `hard` policy rule is broken. Style advice and advisory rules still never fail.

| Exit code | Meaning |
| --- | --- |
| 0 | clean or advisory |
| 1 | a hard rule broken in enforce mode |
| 2 | invalid arguments, an invalid policy or profile, missing consent, a named file over the size limit |
| 3 | an IO or environment error |

With `--json`, an error is printed as `{"schemaVersion": 1, "error": {"code", "message", "remedy"}, "exitCode"}` on standard output.

## Files And Limits

- Folders are scanned for `.md`, `.mdx`, `.markdown` and `.txt`, in sorted order.
- Always skipped: `node_modules`, `.git`, `.selfclone`, `dist`, binary files (a NUL byte in the first 8,000 bytes), symbolic links (never followed) and the policy's `ignore` globs.
- A file over 10 MiB is skipped in a folder scan and rejected when named directly. `--max-bytes` raises the limit to at most 50 MiB. At most 10,000 files per run.
- Globs support `*`, `?` and whole-segment `**` only, matched against the path relative to `--root` (default: the current folder). The matcher is dynamic programming with no backtracking.

## Output Formats

`--format text` (default), `--format json` (or `--json`) and `--format sarif`. Schema for JSON: [`schemas/lint-report.v1.schema.json`](../schemas/lint-report.v1.schema.json).

- Findings are sorted by POSIX path, then `startOffset`, then `ruleId`.
- **Offsets are UTF-16 code units** into the decoded file, after a byte order mark is removed (the index a JavaScript string uses). `endOffset` is exclusive. `line` and `column` are 1-based; `column` also counts UTF-16 code units, so an emoji before a match counts as two. Line breaks may be `\n`, `\r\n` or `\r`.
- Findings never quote the source text: a report carries the rule's message, the location and the suggestion.

SARIF 2.1.0 output has `version`, `runs[].tool.driver.rules` (every rule id used, sorted), `results[].ruleIndex`, `results[].locations[].physicalLocation.region` (`startLine`, `startColumn`, `charOffset`, `charLength`) and `columnKind: "utf16CodeUnits"`. Upload it with GitHub's code scanning upload action if you want results in the Security tab; that step needs `security-events: write`, so the kit's sample workflow leaves it commented out.

Real output on the synthetic fixture in `tests/fixtures/synthetic-maintainer/repo/` (`selfclone lint . --policy ../voice-policy.json`, two findings shown):

```text
docs/README.md:3:57  warning  Avoid unverified absolute claims  [no-absolute-promises]
    Suggestion: Say what was tested instead
docs/README.md:10:4  error (hard)  Heading is too long (102 characters, limit 88)  [max-heading-length]
    Suggestion: Shorten heading without changing its meaning
```

The word "guaranteed" also appears in that file inside a code fence, a link target, an HTML comment and an MDX attribute; none of those is reported.

## Maintainer Voice Kit

`selfclone kit init --target .` writes `.selfclone-kit/` into a repository. It never overwrites a file that exists (existing files are listed as left alone) and never edits `AGENTS.md` or any other file outside the kit.

| File | What it is |
| --- | --- |
| `voice-policy.json` | the starter policy above; with `--profile`, the paragraph limit is suggested from your profile, rounded up to a multiple of 25 words (the only value taken from the profile) |
| `schemas/voice-policy.v1.schema.json` | the schema, so `"$schema"` resolves offline |
| `AGENTS.snippet.md` | a proposed `AGENTS.md` section for coding agents; a person decides whether to append it, and the project's own instructions take precedence |
| `skills/maintainer-voice/SKILL.md` | the same guidance as a portable agent skill (Agent Skills frontmatter) |
| `examples/` | two safe example drafts |
| `voice-lint.workflow.yml.sample` | a disabled GitHub Actions starter |
| `README.md` | what each file is |

The agent guidance in the snippet and the skill: use the rules to keep tone consistent; preserve technical facts; run lint; show changes for human review; never speak as the actual author without disclosure; do not post, send or edit project docs unless a person asks.

The workflow sample runs on `pull_request` (never `pull_request_target`), with `permissions: contents: read` and no secrets. It checks out the pull request only as data for the lint and runs selfclone from a separate checkout at a commit you pin. It is a `.sample` file, so it does nothing until you review it and copy it to `.github/workflows/voice-lint.yml`. Uploading SARIF to code scanning needs `security-events: write`, so that step is left as a comment.

`selfclone kit check --target .` prints a JSON report (with `--json`) and exits 1 when a check fails:

| Check | Passes when |
| --- | --- |
| `kit-present` | `.selfclone-kit/` exists |
| `policy-schema` | the policy is valid |
| `hard-rules` | every hard rule has a message and an allowed type |
| `no-private-data` | no profile fields, consent ids, digests, email addresses, local absolute paths, links outside a short allowlist, scrubber hits or symbolic links; the schema copy matches the shipped schema; and, when the workspace is found (`--dir`), no line of 24 characters or more from your training split |
| `portability` | each skill has a valid `name` (lowercase, hyphens, at most 64 characters, matching its folder) and a `description` of at most 1,024 characters; `AGENTS.snippet.md` exists |
| `workflow` | every workflow file is a disabled `.sample`, uses `pull_request`, has `contents: read` only, uses no secrets and runs no code from the pull request |

## Voice Delta

When an agent proposes a rewrite, check it before anyone applies it:

```bash
selfclone delta before.md after.md          # --json for data
```

It prints only the edited lines and compares every protected span of the two files (the same spans lint protects: code, links, paths, versions, issue references, identifiers, flags, test results, citations) byte for byte, as a multiset. If any span is missing, changed or added, the result is `E_FACT_PRESERVATION`, `recommendApply` is false and the exit code is 1. It protects tokens, not every claim: a rewrite can keep `#412` and still say something different about it, so read the edited lines. Nothing is ever applied by this command.

Real output on the synthetic example, where the rewrite changed the issue number and the flag:

```text
Protected tokens: 3 before, 3 after.
E_FACT_PRESERVATION: protected tokens differ, so this rewrite is not recommended.
  missing: `--dir`
  missing: #412
  added:   `--directory`
  added:   #421
```

## Voice Drift

How your own writing changed between two periods. It reads only your training split, needs consent with the `local-lint` scope, and is for the profile owner only: it is not a tool for monitoring staff, ranking a team or detecting who wrote something.

```bash
selfclone drift --before 2026-01-01..2026-04-30 --after 2026-05-01..2026-08-31 --channel dev   # --json, --out file
```

- The two windows are inclusive UTC dates and may not share a day (overlap is exit 2, `E_DRIFT_OVERLAP`).
- Each window needs 100 messages in 20 conversations spanning at least 4 weeks. Otherwise the result is `insufficient_data`: a successful run (exit 0) with a warning and no numbers.
- 12 surface features are tested: median words per message; the share of messages that start lowercase, end in punctuation, or have a question mark, an exclamation mark or emoji; commas, full stops, semicolons, dashes, exclamation marks and question marks per 1,000 characters.
- Each change gets a 95% percentile interval from 1,000 bootstrap resamples of whole conversations (one thread on one UTC day), never single sentences, which would overstate confidence. The seed is fixed (`--seed`), so the same input gives the same report. The bootstrap works on per-conversation sums packed into typed arrays, so it stays fast as the corpus grows.
- A feature is flagged as changed only when its interval excludes zero and the change is at least a practical threshold: 0.10 for a share of messages, 5 words for the median, 2 per 1,000 characters for punctuation.
- Every tested feature is reported. With 12 features tested at once some intervals can exclude zero by chance, so the report calls itself exploratory and never calls a change certain. It infers nothing about beliefs, personality, health or identity.

Real output on the synthetic corpus (the generator makes the maintainer's later developer messages longer and more often lowercase; four rows shown):

```text
| Feature | Before | After | Change | 95% interval | Threshold | Changed |
| --- | --- | --- | --- | --- | --- | --- |
| Median words per message | 9 | 22 | +13 | 12 to 14 | 5 | yes, up |
| Messages starting lowercase | 0.522 | 1 | +0.478 | 0.379 to 0.573 | 0.1 | yes, up |
| Commas per 1,000 characters | 9.63 | 8.28 | -1.35 | -3.59 to 1.05 | 2 | no |
| Full stops per 1,000 characters | 14.54 | 7.28 | -7.26 | -10.65 to -3.85 | 2 | yes, down |
```

## Performance

`node tools/perf-voice-ci.mjs` builds a profile from 10,000 synthetic messages, lints 100 Markdown files (4.09 MiB), and runs drift with 1,000 rounds. Measured on the development machine (Windows 11, Node 24): profile about 0.4 s, lint about 0.7 s, drift about 0.5 s. `tests/unit/perf.test.mjs` fails if profile plus lint takes more than 15 s or drift more than 30 s.
