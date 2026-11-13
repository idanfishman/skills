#!/usr/bin/env bash
# Print the release body for a version: its CHANGELOG.md section, then .github/release-footer.md.
set -euo pipefail

cd "$(dirname "$0")/.."

version="${1:?usage: $0 <version>}"
# A section ends at the next "## [" heading or at the link references at the end of the file.
# Blank lines are held back, so the section has none at its start or end.
section="$(awk -v v="$version" '
  /^## \[/ { p = index($0, "## [" v "]") == 1; next }
  /^\[[^]]+\]: / { p = 0 }
  !p { next }
  /^$/ { blanks++; next }
  { if (seen) while (blanks-- > 0) print ""; blanks = 0; seen = 1; print }
' CHANGELOG.md)"

if [[ -z "$section" ]]; then
  echo "CHANGELOG.md has no section for $version" >&2
  exit 1
fi

printf '%s\n\n' "$section"
cat .github/release-footer.md
