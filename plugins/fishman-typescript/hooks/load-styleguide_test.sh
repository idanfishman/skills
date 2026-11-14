#!/usr/bin/env bash
# Checks what load-styleguide.sh puts into a session: the whole skill body, a STYLEGUIDE.md that exists,
# and rule ids that a reviewer can cite, each one unique.
# shellcheck disable=SC2016 # The patterns match literal backticks and ${...}, not shell expansions.
set -euo pipefail

cd "$(dirname "$0")/.."
skill=skills/styleguide
loaded="$(bash hooks/load-styleguide.sh)"
fail() { echo "load-styleguide: $1" >&2; exit 1; }

body_lines="$(awk 'n >= 2; /^---$/ { n++ }' "$skill/SKILL.md" | wc -l)"
[ "$(wc -l <<<"$loaded")" = "$body_lines" ] || fail "the output is not the whole skill body"
! grep -q '^description: ' <<<"$loaded" || fail "the output holds the frontmatter"
! grep -qF '${CLAUDE_SKILL_DIR}' <<<"$loaded" || fail "the output still holds \${CLAUDE_SKILL_DIR}"
guide="$(grep -oE '`[^`]*/STYLEGUIDE\.md`' <<<"$loaded" | tr -d '`')"
[ -f "$guide" ] || fail "the output points to a STYLEGUIDE.md that doesn't exist: $guide"

# The first cell of each table row is the rule's id.
ids="$(grep -oE '^\| `[a-z]+#[a-z-]+` \|' "$skill/STYLEGUIDE.md" | sort)"
[ -n "$ids" ] || fail "STYLEGUIDE.md has no rule ids"
repeated="$(uniq -d <<<"$ids")"
[ -z "$repeated" ] || fail "STYLEGUIDE.md repeats rule ids: $repeated"

echo "load-styleguide: all checks pass"
