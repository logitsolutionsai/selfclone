#!/usr/bin/env bash
# The user's own profile is built; issue-412.md describes a bug report.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" auto-post-reply
