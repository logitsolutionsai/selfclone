#!/usr/bin/env bash
# An ingested workspace for the user's own writing, with a sealed test set in .selfclone/sealed.jsonl.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" sealed-replies
