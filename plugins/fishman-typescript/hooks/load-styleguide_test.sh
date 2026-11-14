#!/usr/bin/env bash
# Checks what load-styleguide.sh puts into a session: nothing in a repository without a tsconfig.json,
# and otherwise the whole skill body, files that exist, and rule ids that a reviewer can cite, each one unique.
# shellcheck disable=SC2016 # The patterns match literal backticks and ${...}, not shell expansions.
set -euo pipefail

cd "$(dirname "$0")/.."
skill=skills/styleguide
hook="$PWD/hooks/load-styleguide.sh"
fail() { echo "load-styleguide: $1" >&2; exit 1; }

repo="$(mktemp -d)"
trap 'rm -rf "$repo"' EXIT
[ -z "$(cd "$repo" && bash "$hook")" ] || fail "the output is not empty without a tsconfig.json"
touch "$repo/tsconfig.json"
loaded="$(cd "$repo" && bash "$hook")"

body_lines="$(awk 'n >= 2; /^---$/ { n++ }' "$skill/SKILL.md" | wc -l)"
[ "$(wc -l <<<"$loaded")" = "$body_lines" ] || fail "the output is not the whole skill body"
! grep -q '^description: ' <<<"$loaded" || fail "the output holds the frontmatter"
! grep -qF '${CLAUDE_SKILL_DIR}' <<<"$loaded" || fail "the output still holds \${CLAUDE_SKILL_DIR}"
for file in STYLEGUIDE.md biome.jsonc; do
  path="$(grep -oE "\`[^\`]*/$file\`" <<<"$loaded" | tr -d '`')"
  [ -f "$path" ] || fail "the output points to a $file that doesn't exist: $path"
done

# The first cell of each table row is the rule's id.
ids="$(grep -oE '^\| `[a-z]+#[a-z-]+` \|' "$skill/STYLEGUIDE.md" | sort)"
[ -n "$ids" ] || fail "STYLEGUIDE.md has no rule ids"
repeated="$(uniq -d <<<"$ids")"
[ -z "$repeated" ] || fail "STYLEGUIDE.md repeats rule ids: $repeated"

echo "load-styleguide: all checks pass"
