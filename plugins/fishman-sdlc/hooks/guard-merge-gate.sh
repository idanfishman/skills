#!/usr/bin/env bash
# Stops Claude standing in for the owner at the merge gate. Claude may merge a pull request only when the
# repository has a `critical` label, the pull request doesn't carry it, and every check passed. The hook
# also blocks approving a pull request, removing or changing the `critical` label, and loosening branch
# protection. Wired to PreToolUse by hooks.json; exit 2 blocks the call and hands stderr back to Claude.
#
# It reads GitHub through the REST API only, because cloud sessions block GraphQL. So every way to merge
# gets the same check: gh pr merge, gh api, and the GitHub MCP tools.
#
# ponytail: a string match on the command line, so a script, `bash -c` or a browser routes around it. It
# stops a mistake, not an adversary.
set -euo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
cwd=$(jq -r '.cwd // "."' <<<"$input")

deny() {
  echo "Blocked: $1. Claude merges only a pull request whose labels and checks it could read, that isn't critical, whose checks all passed, in a repository that has a critical label. A critical pull request is the owner's to review and merge: hand over its URL. Approving is the owner's call too." >&2
  exit 2
}

gh_api() { "${GUARD_GH:-gh}" api "$1" 2>/dev/null; }

# A path may hold gh's {owner}/{repo} placeholders, which gh fills in from the current repository.
full_name() {
  if [[ $1 == *"{"* ]]; then
    gh_api "repos/$1" | jq -er .full_name || true
  else
    echo "$1"
  fi
}

# may_merge OWNER/REPO NUMBER [checks]: denies unless the pull request may merge. With "checks", every
# check on its head must have passed. Without it, auto-merge waits for the checks.
may_merge() {
  local repo=$1 number=$2 mode=${3:-} pr sha runs statuses results
  [[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && $number =~ ^[0-9]+$ ]] ||
    deny "Merging a pull request this hook can't identify"
  pr=$(gh_api "repos/$repo/pulls/$number") || deny "Merging without reading the pull request's labels"
  jq -e '.labels | any(.name == "critical")' <<<"$pr" >/dev/null && deny "Merging a critical pull request"
  # A repository that never labels anything critical has no gate to lean on.
  gh_api "repos/$repo/labels/critical" >/dev/null || deny "Merging in a repository with no critical label"
  [ "$mode" = checks ] || return 0
  sha=$(jq -r .head.sha <<<"$pr")
  runs=$(gh_api "repos/$repo/commits/$sha/check-runs?per_page=100") || deny "Merging without reading the pull request's checks"
  statuses=$(gh_api "repos/$repo/commits/$sha/status?per_page=100") || deny "Merging without reading the pull request's checks"
  # One page holds at most 100 of each, and a check this hook doesn't see can't count as passed.
  jq -en --argjson r "$runs" --argjson s "$statuses" \
    '$r.total_count > ($r.check_runs | length) or $s.total_count > ($s.statuses | length)' >/dev/null &&
    deny "Merging a pull request with more checks than this hook reads"
  # One line per check: a check run's conclusion (null while it runs), or a commit status's state.
  results=$(jq -rn --argjson r "$runs" --argjson s "$statuses" '($r.check_runs[] | .conclusion // "pending"), ($s.statuses[] | .state)')
  [ -n "$results" ] || deny "Merging a pull request that has no checks"
  grep -qvxE 'success|skipped|neutral' <<<"$results" && deny "Merging before every check passes"
  return 0
}

if [[ $tool == mcp__* ]]; then
  name=${tool##*__}
  repo=$(jq -r '.tool_input | "\(.owner // "")/\(.repo // "")"' <<<"$input")
  number=$(jq -r '.tool_input | .pullNumber // .pull_number // .number // "" | tostring' <<<"$input")
  case $name in
    *merge_pull_request*) may_merge "$repo" "$number" checks ;;
    *auto_merge*) [[ $name == *disable* ]] || may_merge "$repo" "$number" ;;
    *review*)
      # An approval is a value that is exactly APPROVE, in any case, such as a review's event. A body that
      # mentions approving is not one.
      jq -e '[.tool_input | .. | strings | ascii_upcase] | any(. == "APPROVE")' <<<"$input" >/dev/null &&
        deny "Approving through $tool"
      ;;
  esac
  exit 0
fi

cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# One segment per gh invocation that starts a command, cut at the next ; & or |, so a chained command
# is judged per part and a mere mention (git log --grep "gh pr merge") is not. Variable assignments, env
# and command may come before gh.
lead='(^|[;&|(`])[[:space:]]*((env|command)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=[^[:space:];&|]*[[:space:]]+)*'
segments() { grep -Eo "${lead}gh[[:space:]]+$1[^;&|]*" <<<"$cmd" || true; }
has() { grep -Eq -- "$2" <<<"$1"; }
# GH_REPO=OWNER/REPO before gh names the repository, as --repo does.
prefix_repo() {
  if [[ ${1%%gh[[:space:]]*} =~ GH_REPO=[\"\']?([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

while read -r seg; do
  [ -n "$seg" ] || continue
  # -a alone or grouped after the other boolean shorthands (-ca); a letter after -b or -F is its value.
  has "$seg" '[[:space:]](--approve|-[cr]*a[^[:space:]]*)([[:space:]=]|$)' && deny "Approving a pull request"
done < <(segments 'pr[[:space:]]+review')

# Without the critical label, a critical pull request reads as one that Claude may merge.
while read -r seg; do
  [ -n "$seg" ] || continue
  has "$seg" '--remove-label[[:space:]=]+["'\'']?([^[:space:],"'\'']*,[[:space:]]*)*critical([,"'\''[:space:]]|$)' &&
    deny "Removing the critical label"
done < <(segments '(pr|issue)[[:space:]]+edit')
while read -r seg; do
  [ -n "$seg" ] || continue
  has "$seg" 'label[[:space:]]+(delete|edit)[[:space:]]+["'\'']?critical(["'\''[:space:]]|$)' || continue
  has "$seg" 'label[[:space:]]+delete' && deny "Deleting the critical label"
  has "$seg" '[[:space:]](-n|--name)([[:space:]=]|$)' && deny "Renaming the critical label"
done < <(segments 'label[[:space:]]+(delete|edit)')

while read -r seg; do
  [ -n "$seg" ] || continue
  has "$seg" '[[:space:]]--admin([[:space:]]|$)' && deny "An admin-bypass merge"
  has "$seg" '[[:space:]]--disable-auto([[:space:]]|$)' && continue
  # xargs splits the words the way the shell would, so a quoted value stays one word.
  parsed=$(xargs printf '%s\n' <<<"${seg#*gh[[:space:]]*pr[[:space:]]*merge}" 2>/dev/null) ||
    deny "Merging with a command line this hook can't parse"
  words=()
  while IFS= read -r w; do [ -n "$w" ] && words+=("$w"); done <<<"$parsed"
  target="" repo=""
  for ((i = 0; i < ${#words[@]}; i++)); do
    case ${words[i]} in
      -R | --repo) repo=${words[i + 1]:-} && i=$((i + 1)) ;;
      --repo=*) repo=${words[i]#--repo=} ;;
      -R?*) repo=${words[i]#-R} ;;
      # Flags that take a value, so the value isn't read as the target.
      -b | --body | -t | --subject | -F | --body-file | -A | --author-email | --match-head-commit) i=$((i + 1)) ;;
      -*) ;;
      *) [ -n "$target" ] || target=${words[i]} ;;
    esac
  done
  # The target is a URL, a number, a branch, or nothing for the current branch, as gh reads it. Without
  # --repo or GH_REPO, gh's placeholders stand for the current repository and branch.
  repo=${repo:-$(prefix_repo "$seg")}
  here='{owner}/{repo}' current='{branch}'
  if [[ $target =~ ^https://github\.com/([^/]+/[^/]+)/pull/([0-9]+) ]]; then
    repo=${BASH_REMATCH[1]} number=${BASH_REMATCH[2]}
  elif [[ $target =~ ^#?([0-9]+)$ ]]; then
    number=${BASH_REMATCH[1]}
    repo=$(full_name "${repo:-$here}")
  else
    base=${repo:-$here}
    found=$(gh_api "repos/$base/pulls?head=${base%%/*}:${target:-$current}&state=open" |
      jq -er '.[0] | "\(.base.repo.full_name) \(.number)"') ||
      deny "Merging a pull request this hook can't identify"
    read -r repo number <<<"$found"
  fi
  if has "$seg" '[[:space:]]--auto([[:space:]]|$)'; then
    may_merge "$repo" "$number"
  else
    may_merge "$repo" "$number" checks
  fi
done < <(segments 'pr[[:space:]]+merge')

pull_route='repos/([^/[:space:]"'\'']+/[^/[:space:]"'\'']+)/pulls/([0-9]+)/'
merge_route="${pull_route}merge([^a-z_]|\$)"
auto_merge_route="${pull_route}ccr/auto_merge"
# The request body may come from a file (--input FILE, -F key=@FILE) or from stdin (-). Stdin is a
# heredoc or a pipe in the command, so the whole command stands in for it.
body_refs='(--input[[:space:]=]+|(-F|--field)[[:space:]]+["'\'']?[^[:space:]=]+=@)["'\'']?[^[:space:]"'\'']+'
while read -r seg; do
  [ -n "$seg" ] || continue
  # gh api sends POST as soon as it has a field, unless told otherwise.
  if has "$seg" '(-X|--method)[[:space:]=]*["'\'']?GET'; then
    continue
  fi
  has "$seg" '(-X|--method)[[:space:]=]*["'\'']?(POST|PUT|PATCH|DELETE)|[[:space:]](-f|-F|--field|--raw-field|--input)([[:space:]=]|$)' || continue
  body=$seg
  while read -r ref; do
    [ -n "$ref" ] || continue
    if [ "$ref" = - ]; then
      body+=$'\n'$cmd
    else
      body+=$'\n'$(cd "$cwd" && cat -- "${ref/#\~/$HOME}" 2>/dev/null) ||
        deny "Sending a request body from $ref, which this hook can't read. Give its absolute path"
    fi
  done < <(grep -Eo -- "$body_refs" <<<"$seg" | sed -E 's/^.*(--input[[:space:]=]+|=@)["'\'']?//')
  has "$body" 'mergePullRequest|enablePullRequestAutoMerge' && deny "Merging through GraphQL, which this hook can't check"
  seg_repo=$(prefix_repo "$seg")
  if [[ $seg =~ $merge_route ]]; then
    route_repo=${BASH_REMATCH[1]} number=${BASH_REMATCH[2]}
    [[ $route_repo == '{owner}/{repo}' && -n $seg_repo ]] && route_repo=$seg_repo
    may_merge "$(full_name "$route_repo")" "$number" checks
  fi
  if [[ $seg =~ $auto_merge_route ]] && ! has "$seg" 'DELETE'; then
    route_repo=${BASH_REMATCH[1]} number=${BASH_REMATCH[2]}
    [[ $route_repo == '{owner}/{repo}' && -n $seg_repo ]] && route_repo=$seg_repo
    may_merge "$(full_name "$route_repo")" "$number"
  fi
  has "$body" 'PullRequestReview|pulls/[0-9]+/reviews' &&
    grep -Eqi -- 'event["'\'']?[[:space:]]*[:=][[:space:]]*["'\'']?APPROVE([^A-Z_]|$)' <<<"$body" &&
    deny "Approving through the API"
  has "$seg" '/labels/critical([^A-Za-z0-9_.-]|$)' && deny "Removing or changing the critical label"
  has "$seg" 'rulesets|branches/[^[:space:]]+/protection' && deny "Changing branch protection"
done < <(segments 'api')

exit 0
