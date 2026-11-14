#!/usr/bin/env bash
# A JSONL of leaked private messages attributed to an invented public figure, Victor Hale.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" public-figure-private-messages
