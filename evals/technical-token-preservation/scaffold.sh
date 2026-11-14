#!/usr/bin/env bash
# The user's own profile is built; release-note-before.md is a generic release note with `--dir` and #412.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" technical-token-preservation
