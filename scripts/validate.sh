#!/usr/bin/env bash
# The gate: run by the pre-commit hook and by CI, so both check the same thing.
set -euo pipefail

cd "$(dirname "$0")/.."

# The plugin is the repo root, so this one call also checks plugin.json and skills/.
claude plugin validate . --strict

# The release job publishes this section after merge, so a bump without it fails here, not there.
version="$(jq -er .version .claude-plugin/plugin.json)"
scripts/release-notes.sh "$version" >/dev/null
