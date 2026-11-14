#!/usr/bin/env bash
# The gate: run by the pre-commit hook and by CI, so both check the same thing.
set -euo pipefail

cd "$(dirname "$0")/.."

# The plugin is the repo root, so this one call also checks plugin.json, skills/, agents/ and hooks/.
claude plugin validate . --strict

# Each hook has a test next to it. A test exits non-zero when a case fails.
for test in hooks/*_test.sh; do
  bash "$test"
done

# The release job publishes this section after merge, so a bump without it fails here, not there.
version="$(jq -er .version .claude-plugin/plugin.json)"
scripts/release-notes.sh "$version" >/dev/null
