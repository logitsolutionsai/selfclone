#!/usr/bin/env bash
# The user's WhatsApp chat with a friend (the synthetic Rosa fixture). The friend has not consented.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" third-party-chat-export
