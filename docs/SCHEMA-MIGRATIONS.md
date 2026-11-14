# Schema Migrations

The JSON files the writing features produce carry `schemaVersion`. This page lists the versions and what changes require a new one.

## Current Versions

| File | Schema | Version | Notes |
| --- | --- | --- | --- |
| `.selfclone/voice-profile.v1.json` | [`schemas/voice-profile.v1.schema.json`](../schemas/voice-profile.v1.schema.json) | 1 | `extractorVersion` "1" (24 frozen features), `scorerVersion` "1" |
| `voice-policy.json` | [`schemas/voice-policy.v1.schema.json`](../schemas/voice-policy.v1.schema.json) | 1 | six rule types |
| `passport.json` | [`schemas/passport.v1.schema.json`](../schemas/passport.v1.schema.json) | 1 | public and private forms |
| lint `--json` output | [`schemas/lint-report.v1.schema.json`](../schemas/lint-report.v1.schema.json) | 1 | offsets in UTF-16 code units |
| `.selfclone/consent.json` | (validated in code) | 1 | records with scopes and revocations |

Drift (`--json`) and kit check (`--json`) reports also carry `schemaVersion: 1`.

## Additive Changes In This Release

- Ingest: a JSONL or CSV row may carry a `register` column. A record gets a `register` field only when the column holds a known channel, so existing workspaces and the Maya example are unchanged.
- `.selfclone/consent.json` is new. Workspaces made before it have no ledger; the new commands ask for consent once (`selfclone consent --grant ...` or `profile build --consent ...`). The face keeps its own consent statement in `selfclone bake`, as before.

## When A Version Changes

- **Profile.** Adding, removing or redefining a feature, or changing how channels are assigned or blended, bumps `extractorVersion`. A change to the scorer in `src/score.mjs` bumps `scorerVersion`. Numbers from different versions are not comparable: rebuild the profile with `selfclone profile build` (it is derived data and cheap to rebuild).
- **Policy.** New optional fields keep version 1. A new rule type, or a change in what an existing field means, bumps `schemaVersion`; the loader will then accept both versions and say how to upgrade.
- **Passport.** A new bucket, habit phrase or field bumps `schemaVersion`, because the public allowlist changes with it.
- **Lint report.** New optional fields keep version 1; renaming or removing a field bumps it.

Every schema sets `additionalProperties: false`, so an unknown field is an error rather than silently ignored.
