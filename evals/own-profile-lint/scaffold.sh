#!/usr/bin/env bash
# The user's own synthetic export in exports/ and a generic release note in CHANGELOG.md. No workspace yet.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" own-profile-lint
