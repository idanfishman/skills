#!/usr/bin/env bash
# The gate: run by the pre-commit hook and by CI, so both check the same thing.
set -euo pipefail

cd "$(dirname "$0")/.."

# The marketplace, then each plugin with its skills, agents and hooks.
claude plugin validate . --strict
for plugin in plugins/*/; do
  claude plugin validate "$plugin" --strict
done

# Each hook has a test next to it. A test exits non-zero when a case fails.
shellcheck scripts/*.sh plugins/*/hooks/*.sh
for test in plugins/*/hooks/*_test.sh; do
  bash "$test"
done

# The plugins release together, so they carry one version.
versions="$(jq -r .version plugins/*/.claude-plugin/plugin.json | sort -u)"
# Arithmetic, because BSD wc on macOS pads the count with spaces.
if (( $(wc -l <<<"$versions") != 1 )); then
  echo "The plugins carry different versions: $(tr '\n' ' ' <<<"$versions")" >&2
  exit 1
fi

# The release job publishes this section after merge, so a bump without it fails here, not there.
scripts/release-notes.sh "$versions" >/dev/null
