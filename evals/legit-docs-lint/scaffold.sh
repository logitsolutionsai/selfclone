#!/usr/bin/env bash
# A repository with docs/README.md, docs/guide.mdx and a Maintainer Voice Kit policy in .selfclone-kit/.
set -euo pipefail
_case_script="${BASH_SOURCE[0]//\\//}"
CASE_DIR="$(cd "$(dirname "$_case_script")" && pwd)"
node "$CASE_DIR/../_shared/scaffold.mjs" legit-docs-lint
