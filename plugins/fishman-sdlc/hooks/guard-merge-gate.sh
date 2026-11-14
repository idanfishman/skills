#!/usr/bin/env bash
# Stops Claude standing in for the owner at the merge gate. Claude may merge a pull request only when the
# repository has a `critical` label, the pull request doesn't carry it, and every check passed. The hook
# also blocks approving a pull request, removing or renaming the `critical` label, and loosening branch
# protection. Wired to PreToolUse by hooks.json; exit 2 blocks the call and hands stderr back to Claude.
#
# It reads GitHub through the REST API only, because cloud sessions block GraphQL. So every way to merge
# gets the same check: gh pr merge, gh api, and the GitHub MCP tools.
#
# It is a string match on the command line, so a script, `bash -c` or a browser routes around it. It stops
# a mistake, not an adversary.
set -euo pipefail

# Claude Code runs the call unless the hook exits 2, so every failure this script didn't plan for blocks.
# shellcheck disable=SC2329 # The EXIT trap below calls it.
fail_closed() {
  local rc=$?
  [ "$rc" = 0 ] || [ "$rc" = 2 ] || { echo "Blocked: the merge-gate hook failed (exit $rc), so it could not check this call." >&2; exit 2; }
}
trap fail_closed EXIT
command -v jq >/dev/null || { echo "Blocked: the merge-gate hook needs jq. Ask the owner to install it." >&2; exit 2; }

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
cwd=$(jq -r '.cwd // "."' <<<"$input")

deny() {
  echo "Blocked: $1. Claude may merge only when the repository has a critical label, the pull request doesn't carry it, and every check passed, and the hook must read all three. A critical pull request is the owner's to review and merge, so hand over its URL. Approving is the owner's call too." >&2
  exit 2
}

# gh fills in its {owner}/{repo} placeholders from the directory it runs in, so run it where Claude does.
gh_api() { (cd "$cwd" && "${GUARD_GH:-gh}" api "$1") 2>/dev/null; }

full_name() {
  if [[ $1 == *"{"* ]]; then
    gh_api "repos/$1" | jq -er .full_name || true
  else
    echo "$1"
  fi
}

is_critical='any((if type == "object" then .name else . end) | ascii_downcase == "critical")'

# may_merge OWNER/REPO NUMBER: denies unless the pull request may merge. Auto-merge gets the same check,
# because gh merges at once when it can, and GitHub waits only for required checks.
may_merge() {
  local repo=$1 number=$2 pr sha runs statuses results
  [[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && $number =~ ^[0-9]+$ ]] ||
    deny "Merging a pull request this hook can't identify"
  pr=$(gh_api "repos/$repo/pulls/$number") || deny "Merging without reading the pull request's labels"
  # GitHub label names ignore case, so Critical is the critical label too.
  jq -e ".labels | $is_critical" <<<"$pr" >/dev/null && deny "Merging a critical pull request"
  # A repository that never labels anything critical has no gate to lean on.
  gh_api "repos/$repo/labels/critical" >/dev/null || deny "Merging in a repository with no critical label"
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

# drops_critical OWNER/REPO NUMBER: denies when the issue or pull request carries the critical label, for a
# write that replaces or clears its labels without keeping critical.
drops_critical() {
  local labels
  [[ $1 =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && $2 =~ ^[0-9]+$ ]] || deny "Changing labels this hook can't place"
  labels=$(gh_api "repos/$1/issues/$2") || deny "Changing labels without reading the current ones"
  jq -e ".labels | $is_critical" <<<"$labels" >/dev/null && deny "Removing the critical label"
  return 0
}

if [[ $tool == mcp__* ]]; then
  name=${tool##*__}
  repo=$(jq -r '.tool_input | "\(.owner // "")/\(.repo // "")"' <<<"$input")
  number=$(jq -r '.tool_input | .pullNumber // .pull_number // .number // .issue_number // .issueNumber // "" | tostring' <<<"$input")
  # A labels list replaces the labels, so it drops critical unless it lists it again.
  if jq -e '.tool_input.labels | type == "array"' <<<"$input" >/dev/null &&
    ! jq -e ".tool_input.labels | $is_critical" <<<"$input" >/dev/null; then
    drops_critical "$repo" "$number"
  fi
  if [[ $name == *label* ]] && jq -e '[.tool_input | .. | strings | ascii_downcase] | any(. == "critical")' <<<"$input" >/dev/null &&
    [[ $name$(jq -r '.tool_input.method // ""' <<<"$input") =~ remove|delete|update ]]; then
    deny "Removing or changing the critical label through $tool"
  fi
  case $name in
    *merge_pull_request* | *auto_merge*) [[ $name == *disable* ]] || may_merge "$repo" "$number" ;;
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
has_i() { grep -Eqi -- "$2" <<<"$1"; }
# GH_REPO=OWNER/REPO before gh names the repository, as --repo does.
prefix_repo() {
  if [[ ${1%%gh[[:space:]]*} =~ GH_REPO=[\"\']?([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}
# After a cd or pushd, gh resolves the current repository somewhere this hook can't see.
moved=0
has "$cmd" '(^|[;&|(`])[[:space:]]*(cd|pushd)([[:space:]]|$)' && moved=1
# api_repo PATH_REPO SEGMENT_REPO: sets resolved to the full name behind a route's OWNER/REPO. It runs in
# this shell, not in $(...), so its deny ends the hook.
api_repo() {
  local raw=$1
  [[ $raw == '{owner}/{repo}' && -n $2 ]] && raw=$2
  [[ $raw == *"{"* && $moved == 1 ]] &&
    deny "Naming the repository by placeholder after a cd, which this hook can't place. Name it in full"
  resolved=$(full_name "$raw")
}

while read -r seg; do
  [ -n "$seg" ] || continue
  # -a alone or grouped after the other boolean shorthands (-ca); a letter after -b or -F is its value.
  has "$seg" '[[:space:]](--approve|-[cr]*a[^[:space:]]*)([[:space:]=]|$)' && deny "Approving a pull request"
done < <(segments 'pr[[:space:]]+review')

# Without the critical label, a critical pull request reads as one that Claude may merge.
while read -r seg; do
  [ -n "$seg" ] || continue
  has_i "$seg" '--remove-label[[:space:]=]+["'\'']?([^[:space:],"'\'']*,[[:space:]]*)*critical([,"'\''[:space:]]|$)' &&
    deny "Removing the critical label"
done < <(segments '(pr|issue)[[:space:]]+edit')
while read -r seg; do
  [ -n "$seg" ] || continue
  has_i "$seg" 'label[[:space:]]+(delete|edit)[[:space:]]+["'\'']?critical(["'\''[:space:]]|$)' || continue
  has "$seg" 'label[[:space:]]+delete' && deny "Deleting the critical label"
  has "$seg" '[[:space:]](-n|--name)([[:space:]=]|$)' && deny "Renaming the critical label"
done < <(segments 'label[[:space:]]+(delete|edit)')

while read -r seg; do
  [ -n "$seg" ] || continue
  has "$seg" '[[:space:]]--admin([[:space:]=]|$)' && deny "An admin-bypass merge"
  has "$seg" '[[:space:]]--disable-auto([[:space:]=]|$)' && continue
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
  else
    [[ -z $repo && $moved == 1 ]] &&
      deny "Merging by number or branch after a cd, which this hook can't place. Name the pull request by URL or --repo"
    if [[ $target =~ ^#?([0-9]+)$ ]]; then
      number=${BASH_REMATCH[1]}
      repo=$(full_name "${repo:-$here}")
    else
      base=${repo:-$here}
      found=$(gh_api "repos/$base/pulls?head=${base%%/*}:${target:-$current}&state=open" |
        jq -er '.[0] | "\(.base.repo.full_name) \(.number)"') ||
        deny "Merging a pull request this hook can't identify"
      read -r repo number <<<"$found"
    fi
  fi
  may_merge "$repo" "$number"
done < <(segments 'pr[[:space:]]+merge')

route_repo='repos/([^/[:space:]"'\'']+/[^/[:space:]"'\'']+)'
merge_route="$route_repo/pulls/([0-9]+)/merge([^a-z_]|\$)"
auto_merge_route="$route_repo/pulls/([0-9]+)/ccr/auto_merge"
issue_labels_route="$route_repo/issues/([0-9]+)(/labels)?([^/A-Za-z0-9_]|\$)"
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
    number=${BASH_REMATCH[2]}
    api_repo "${BASH_REMATCH[1]}" "$seg_repo"
    may_merge "$resolved" "$number"
  fi
  if [[ $seg =~ $auto_merge_route ]] && ! has "$seg" 'DELETE'; then
    number=${BASH_REMATCH[2]}
    api_repo "${BASH_REMATCH[1]}" "$seg_repo"
    may_merge "$resolved" "$number"
  fi
  has "$body" 'PullRequestReview|pulls/[0-9]+/reviews' &&
    has_i "$body" 'event["'\'']?[[:space:]]*[:=][[:space:]]*["'\'']?APPROVE([^A-Z_]|$)' &&
    deny "Approving through the API"
  has_i "$seg" '/labels/critical([^A-Za-z0-9_.-]|$)' && deny "Removing or changing the critical label"
  # PUT replaces an issue's labels and DELETE clears them; PATCH on the issue replaces them when it sends labels.
  if [[ $seg =~ $issue_labels_route ]] && ! has_i "$body" 'critical'; then
    issue_repo=${BASH_REMATCH[1]} number=${BASH_REMATCH[2]} sub=${BASH_REMATCH[3]}
    if { [ -n "$sub" ] && has "$seg" 'PUT|DELETE'; } || { [ -z "$sub" ] && has "$seg" 'PATCH' && has "$body" 'labels'; }; then
      api_repo "$issue_repo" "$seg_repo"
      drops_critical "$resolved" "$number"
    fi
  fi
  has "$seg" 'rulesets|branches/[^[:space:]]+/protection' && deny "Changing branch protection"
done < <(segments 'api')

exit 0
