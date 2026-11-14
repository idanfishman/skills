#!/usr/bin/env bash
# Stops Claude standing in for the owner at the merge gate: approving a pull request, merging past
# branch protection, arming auto-merge on a critical one, or loosening the protection itself. Wired to PreToolUse by hooks/hooks.json;
# exit 2 blocks the call and hands stderr back to Claude.
#
# ponytail: a string match on the command line, so a script, a variable or a browser routes around
# it. It stops a mistake, not an adversary. The hard boundary is Claude opening pull requests as a
# GitHub App bot, which the ruleset's admin bypass does not cover.
set -euo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")

deny() {
  echo "Blocked: $1 is the owner's call, not Claude's. Route: hand over the URL; the owner reviews the pull request on GitHub and merges it with \"bypass rules\", or approves it when a bot opened it. Auto-merge (gh pr merge --auto) may be armed only on a pull request whose labels could be read, that isn't critical, in a repository that has a critical label." >&2
  exit 2
}

if [[ $tool == mcp__* ]]; then
  name=${tool##*__}
  [[ $name == *merge_pull_request* ]] && deny "Merging through $tool"
  # This route reads no labels; gh pr merge --auto does.
  [[ $name == *auto_merge* && $name != *disable* ]] && deny "Arming auto-merge through $tool"
  [[ $name == *review* ]] && jq -e '.tool_input | tostring | test("APPROVE"; "i")' <<<"$input" >/dev/null && deny "Approving through $tool"
  exit 0
fi

cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# One segment per gh invocation that starts a command, cut at the next ; & or |, so a chained command
# is judged per part and a mere mention (git log --grep "gh pr merge") is not.
segments() { grep -Eo "(^|[;&|(\`])[[:space:]]*gh[[:space:]]+$1[^;&|]*" <<<"$cmd" || true; }
has() { grep -Eq -- "$2" <<<"$1"; }

while read -r seg; do
  [ -n "$seg" ] || continue
  # -a alone or grouped after the other boolean shorthands (-ca); a letter after -b or -F is its value.
  has "$seg" '[[:space:]](--approve|-[cr]*a[^[:space:]]*)([[:space:]=]|$)' && deny "Approving a pull request"
done < <(segments 'pr[[:space:]]+review')

while read -r seg; do
  [ -n "$seg" ] || continue
  has "$seg" '[[:space:]]--admin([[:space:]]|$)' && deny "An admin-bypass merge"
  has "$seg" '[[:space:]]--(auto|disable-auto)([[:space:]]|$)' || deny "Merging by hand"
  # The owner may bypass code-owner review, so --auto on a green critical pull request merges it unread.
  if has "$seg" '[[:space:]]--auto([[:space:]]|$)'; then
    read -ra words <<<"${seg#*merge}"
    target=() repo=()
    for ((i = 0; i < ${#words[@]}; i++)); do
      case ${words[i]} in
        -R | --repo) repo=(--repo "${words[i + 1]:-}") && i=$((i + 1)) ;;
        --repo=*) repo=(--repo "${words[i]#--repo=}") ;;
        -R?*) repo=(--repo "${words[i]#-R}") ;;
        -*) ;;
        *) [ ${#target[@]} -eq 0 ] && target=("${words[i]}") ;;
      esac
    done
    view=$("${GUARD_GH:-gh}" pr view ${target[@]+"${target[@]}"} ${repo[@]+"${repo[@]}"} --json url,labels --jq '.url, .labels[].name' 2>/dev/null) ||
      deny "Arming auto-merge without reading the pull request's labels"
    grep -qx critical <<<"$view" && deny "Arming auto-merge on a critical pull request"
    # A repository that never labels anything critical has no gate for --auto to lean on. The
    # repository comes from the pull request's URL, since the target may name another one.
    owner_repo=$(head -1 <<<"$view" | cut -d/ -f4-5)
    grep -qx critical <<<"$("${GUARD_GH:-gh}" label list --repo "$owner_repo" --search critical --json name --jq '.[].name' 2>/dev/null)" ||
      deny "Arming auto-merge in a repository with no critical label"
  fi
done < <(segments 'pr[[:space:]]+merge')

while read -r seg; do
  [ -n "$seg" ] || continue
  # gh api sends POST as soon as it has a field, unless told otherwise.
  if has "$seg" '(-X|--method)[[:space:]=]*["'\'']?GET'; then
    continue
  fi
  has "$seg" '(-X|--method)[[:space:]=]*["'\'']?(POST|PUT|PATCH|DELETE)|[[:space:]](-f|-F|--field|--raw-field|--input)([[:space:]=]|$)' || continue
  has "$seg" 'mergePullRequest|pulls/[0-9]+/merge' && deny "Merging through the API"
  has "$seg" 'enablePullRequestAutoMerge' && deny "Arming auto-merge through the API"
  has "$seg" 'PullRequestReview|pulls/[0-9]+/reviews' && has "$seg" 'APPROVE' && deny "Approving through the API"
  has "$seg" 'rulesets|branches/[^[:space:]]+/protection' && deny "Changing branch protection"
done < <(segments 'api')

exit 0
