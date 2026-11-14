#!/usr/bin/env bash
# An export in which Jordan Pike, a coworker, appears beside the user. No consent from Jordan.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" insufficient-consent
