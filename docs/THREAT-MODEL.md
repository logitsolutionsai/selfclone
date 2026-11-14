# Threat Model

What can go wrong with selfclone's writing features (profile, lint, Voice Passport, kit, delta, drift) and what each defence is. The face and video features have their own rules in [ETHICS.md](../ETHICS.md) and the README.

## Assets

- **The corpus**: `.selfclone/corpus.jsonl`, `train.jsonl` and `sealed.jsonl`, which hold real (scrubbed) messages, including other people's words as context.
- **The private profile**: `voice-profile.v1.json`, numbers per channel.
- **Public outputs**: the public Voice Passport, lint reports and SARIF, the kit, the README demo.
- **The sealed test set**, which keeps the fidelity score honest.

## Threats And Defences

| Threat | What could happen | Defence |
| --- | --- | --- |
| Identity misuse | Someone builds a profile or card of another person to imitate them | Consent ledger with scopes; `profile build`, `stylecard` and `drift` refuse without it (exit 2); the skill's ground rules and the eval cases for a coworker, a public figure and a friend's chat; cards say "not identity proof" |
| Privacy leak through a public card | Message text, names, links or exact counts end up on a shared card | The card is built from bucketed numbers and fixed catalogs only; an allowlist check refuses any other string before writing; low-volume channels are dropped; fewer than 100 messages gives no card; tests with planted secrets and scrubbing off |
| Privacy leak through lint output or SARIF | A report uploaded to code scanning carries private text | Findings never quote source text; style messages carry rounded numbers only; tests lint a draft holding every planted secret and check the JSON, SARIF and text output |
| Privacy leak through the kit | The kit committed to a repository carries profile data | The kit takes one rounded paragraph limit from the profile; `kit check` scans for profile fields, digests, emails, local paths, unknown links, scrubber hits and lines from the training split |
| False attribution | A card, a lint result or a drift report is read as proof of who wrote something | Every output says it measures surface style only; the docs and the skill forbid describing results as authorship evidence; there is no "human score" |
| Prompt injection from the corpus | A message in an export tells the agent to reveal secrets or act | The tool never executes text; public outputs are allowlisted so an injected string cannot reach them; the skill reads only the pack and style summary; a planted injection is part of the privacy tests |
| Hostile Markdown | Image beacons, hidden HTML or links in a draft change behaviour or leak data | Lint treats images, HTML and links as protected and never fetches anything; the passport page has a strict CSP and loads nothing |
| Hostile policy file | A policy runs code, uses a catastrophic regular expression or reads outside the repository | Policies are data only: six rule types, literal phrases, no regular expressions, a bounded glob matcher, no `..` or absolute globs, prototype keys rejected, a 256 KB limit |
| Hostile pull request in CI | The sample workflow runs attacker code with secrets | The sample uses `pull_request` (never `pull_request_target`), `contents: read`, no secrets, runs selfclone from a pinned separate checkout and only reads the pull request's files as data; it is disabled until a person installs it |
| Third-party data | Other people's messages, which appear as context, end up in outputs | Profiles and cards use only the user's own messages, as numbers; context text is never measured |
| Sealed set contamination | The clone or a tuning loop sees the exam | `profile build` and `drift` read `train.jsonl` only and record `sealedMessagesRead: false`; a test runs `profile build` with an unreadable sealed file |
| Model inversion from public metrics | Someone reconstructs writing from a card | Cards hold coarse buckets and at most 3 catalog habits, not feature vectors or n-grams; this is a heuristic, not a formal guarantee |
| Silent network use | A command phones home | The new commands make no network calls; a test stubs `fetch`, `http`, `https` and `net` to throw and runs them |
| Surveillance | Drift used to monitor staff or rank a team | Drift needs the owner's consent ledger and runs on their own training split; the docs and skill say it is not for monitoring others |

## Out Of Scope

- An attacker with access to your computer, who can read `.selfclone/` directly.
- Perfect redaction: the scrubber is a pattern matcher. The allowlist on public outputs is the guarantee for those outputs; the corpus itself can still hold what the scrubber missed.
- Formal anonymity of a public card.
