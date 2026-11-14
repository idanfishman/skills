#!/usr/bin/env bash
# Prints the styleguide skill at session start in a repository with TypeScript in it, so the session
# starts with the guide. Wired to SessionStart by hooks.json. Claude Code adds the output to Claude's context.
set -euo pipefail

[ -f tsconfig.json ] || git ls-files -- tsconfig.json '*/tsconfig.json' 2>/dev/null | grep -q . || exit 0

dir="$(cd "$(dirname "$0")/../skills/styleguide" && pwd)"
# The body is what follows the frontmatter's closing "---". A skill load fills in ${CLAUDE_SKILL_DIR}, so this does too.
awk 'n >= 2; /^---$/ { n++ }' "$dir/SKILL.md" | sed "s|\${CLAUDE_SKILL_DIR}|$dir|g"
