#!/usr/bin/env bash
# Blocks Claude from merging a pull request that has the `critical` label, because that merge is the
# owner's call. hooks.json runs it before gh calls and GitHub MCP calls. Exit 2 blocks the call and hands
# stderr back to Claude. If the hook can't read the labels, it blocks.
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

# check GH_ARGS...: reads the pull request's labels with gh, and blocks if one is critical in any case.
check() {
  local out
  out=$(gh "$@" --jq '.labels[].name' 2>&1) ||
    block "the merge-gate hook can't read the labels of this pull request: ${out%%$'\n'*}"
  if grep -qix critical <<<"$out"; then
    block "this pull request has the critical label. Merging it is the owner's call, so hand over its URL."
  fi
}

if [[ $tool == mcp__* ]]; then
  # Turning on auto-merge also merges, later and without another call.
  case $tool in
    *__merge_pull_request | *__enable_pr_auto_merge)
      check api "$(jq -r '.tool_input | "repos/\(.owner)/\(.repo)/pulls/\(.pullNumber)"' <<<"$input")"
      ;;
  esac
  exit 0
fi

cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# gh api: the REST routes that merge or turn on auto-merge name the pull request in their path.
pull='repos/[^/[:space:]"'\'']+/[^/[:space:]"'\'']+/pulls/[0-9]+'
while read -r pr; do
  [ -n "$pr" ] && check api "$pr"
done < <(grep -Eo "$pull/(merge|ccr/auto_merge)" <<<"$cmd" | grep -Eo "^$pull")

# gh pr merge, where a command starts, so a mention in a commit message doesn't count. gh pr view finds
# the pull request the same way, so it gets the same target and --repo.
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
  check pr view ${target:+"$target"} ${repo:+--repo "$repo"} --json labels
done < <(grep -Eo "(^|[;&|({]|then|do|else)[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge[^;&|]*" <<<"$cmd")

exit 0
