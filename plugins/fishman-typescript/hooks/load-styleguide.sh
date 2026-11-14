#!/usr/bin/env bash
# Prints the styleguide skill at session start, so each session in a repository that turns on this plugin
# starts with it. Wired to SessionStart by hooks.json. Claude Code adds the output to Claude's context.
set -euo pipefail

dir="$(cd "$(dirname "$0")/../skills/styleguide" && pwd)"
# The body is what follows the frontmatter's closing "---". A skill load fills in ${CLAUDE_SKILL_DIR}, so this does too.
awk 'n >= 2; /^---$/ { n++ }' "$dir/SKILL.md" | sed "s|\${CLAUDE_SKILL_DIR}|$dir|g"
