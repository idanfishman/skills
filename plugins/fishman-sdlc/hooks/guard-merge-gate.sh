#!/usr/bin/env bash
# Blocks Claude from merging a pull request that isn't ready, or that has the `critical` label, because
# that merge is the owner's call. Ready means that every check on the head commit passed. hooks.json runs
# it before gh calls and GitHub MCP calls. Exit 2 blocks the call and hands stderr back to Claude. If the
# hook can't read the labels or the checks, it blocks.
#
# It reads the command line, so it stops a mistake, not a deliberate bypass such as a script or `bash -c`.
set -uo pipefail

block() {
  echo "Blocked: $1" >&2
  exit 2
}
command -v jq >/dev/null || block "the merge-gate hook needs jq. Ask the owner to install it."
input=$(cat)
tool=$(jq -er '.tool_name' <<<"$input") || block "the merge-gate hook can't read this call."
cd "$(jq -r '.cwd // "."' <<<"$input")" || block "the merge-gate hook can't open the session's folder."

# check repos/OWNER/REPO/pulls/NUMBER: blocks if the pull request has a critical label in any case, or if
# a check on its head commit has not passed. A pull request with no checks has not passed.
check() {
  local pr=$1 out runs
  out=$(gh api "$pr" --jq '.head.sha, .labels[].name' 2>&1) ||
    block "the merge-gate hook can't read this pull request: ${out%%$'\n'*}"
  if tail -n +2 <<<"$out" | grep -qix critical; then
    block "this pull request has the critical label. Merging it is the owner's call, so hand over its URL."
  fi
  runs=$(gh api "${pr%/pulls/*}/commits/$(head -1 <<<"$out")/check-runs?per_page=100" \
    --jq '.check_runs[] | .conclusion // "pending"' 2>&1) ||
    block "the merge-gate hook can't read the checks of this pull request: ${runs%%$'\n'*}"
  if [ -z "$runs" ] || grep -qvxE 'success|skipped|neutral' <<<"$runs"; then
    block "not every check on this pull request passed. Wait with gh pr checks --watch, fix what failed, then merge."
  fi
}

if [[ $tool == mcp__* ]]; then
  # Turning on auto-merge also merges, later and without another call.
  case $tool in
    *__merge_pull_request | *__enable_pr_auto_merge)
      check "$(jq -r '.tool_input | "repos/\(.owner)/\(.repo)/pulls/\(.pullNumber)"' <<<"$input")"
      ;;
  esac
  exit 0
fi

cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# gh api: the REST routes that merge or turn on auto-merge name the pull request in their path.
pull='repos/[^/[:space:]"'\'']+/[^/[:space:]"'\'']+/pulls/[0-9]+'
while read -r pr; do
  [ -n "$pr" ] && check "$pr"
done < <(grep -Eo "$pull/(merge|ccr/auto_merge)" <<<"$cmd" | grep -Eo "^$pull")

# gh pr merge, where a command starts, so a mention in a commit message doesn't count. gh pr view finds
# the pull request the same way, so it gets the same target and --repo, and gives its URL.
while read -r seg; do
  [ -n "$seg" ] || continue
  # xargs splits the words the way the shell does, so a quoted value stays one word.
  parsed=$(xargs printf '%s\n' <<<"${seg#*merge}" 2>/dev/null) ||
    block "the merge-gate hook can't parse this gh pr merge command."
  words=()
  while IFS= read -r w; do [ -n "$w" ] && words+=("$w"); done <<<"$parsed"
  target="" repo=""
  for ((i = 0; i < ${#words[@]}; i++)); do
    case ${words[i]} in
      -R | --repo) repo=${words[i + 1]:-} && i=$((i + 1)) ;;
      --repo=*) repo=${words[i]#--repo=} ;;
      # These flags take a value, and the value is not the target.
      -b | --body | -F | --body-file | -t | --subject | -A | --author-email | --match-head-commit) i=$((i + 1)) ;;
      -*) ;;
      *) target=${words[i]} ;;
    esac
  done
  url=$(gh pr view ${target:+"$target"} ${repo:+--repo "$repo"} --json url --jq .url 2>&1) ||
    block "the merge-gate hook can't find this pull request: ${url%%$'\n'*}"
  check "$(sed -E 's|^https://[^/]+/([^/]+/[^/]+)/pull/([0-9]+)$|repos/\1/pulls/\2|' <<<"$url")"
done < <(grep -Eo "(^|[;&|({]|then|do|else)[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge[^;&|]*" <<<"$cmd")

exit 0
