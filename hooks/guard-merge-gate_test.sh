#!/usr/bin/env bash
# Feeds guard-merge-gate.sh one PreToolUse payload per case and checks it blocks (2) or allows (0).
set -uo pipefail

guard="$(dirname "$0")/guard-merge-gate.sh"
fail=0

check() {
  local want=$1 payload=$2 got
  bash "$guard" <<<"$payload" >/dev/null 2>&1
  got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL want $want got $got: $payload"
    fail=1
  fi
}
bash_cmd() { jq -nc --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'; }

# Stands in for gh: pull request 13 carries the critical label and 14 can't be read; idanfishman/nolabel has no critical label.
GUARD_GH=$(mktemp)
trap 'rm -f "$GUARD_GH"' EXIT
cat >"$GUARD_GH" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "pr view")
    [[ " $* " == *" 14 "* ]] && exit 1
    repo=idanfishman/example
    [[ " $* " == *nolabel* ]] && repo=idanfishman/nolabel
    echo "https://github.com/$repo/pull/12"
    [[ " $* " == *" 13 "* ]] && echo critical
    echo docs ;;
  "label list") [[ " $* " == *" idanfishman/nolabel "* ]] || echo critical ;;
esac
STUB
chmod +x "$GUARD_GH"
export GUARD_GH

check 2 "$(bash_cmd 'gh pr merge 12 --admin --squash')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash')"
check 2 "$(bash_cmd 'git push && gh pr merge 12 --squash --delete-branch')"
check 2 "$(bash_cmd 'gh pr review 12 --approve')"
check 2 "$(bash_cmd 'gh pr review 12 -a -b lgtm')"
check 2 "$(bash_cmd 'gh pr review 12 -ab lgtm')"
check 2 "$(bash_cmd 'gh pr review 12 -ca')"
check 2 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/12/merge')"
check 2 "$(bash_cmd 'gh api graphql -f query="mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }"')"
check 2 "$(bash_cmd 'gh api repos/idanfishman/example/pulls/12/reviews -f event=APPROVE')"
check 2 "$(bash_cmd 'gh api graphql -f query="mutation { enablePullRequestAutoMerge(input: {pullRequestId: \"x\"}) { clientMutationId } }"')"
check 2 "$(bash_cmd 'gh api -X DELETE repos/idanfishman/example/rulesets/7')"
check 2 "$(bash_cmd 'gh api --method PUT repos/idanfishman/example/branches/master/protection --input p.json')"
check 2 "$(bash_cmd 'gh pr merge 13 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge --auto --squash 13 --repo idanfishman/example')"
check 2 "$(bash_cmd 'gh pr merge 14 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --auto --repo idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --auto -R idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --auto --repo=idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge https://github.com/idanfishman/nolabel/pull/12 --squash --auto')"
check 2 "$(jq -nc '{tool_name: "mcp__github__merge_pull_request", tool_input: {pullNumber: 12}}')"
check 2 "$(jq -nc '{tool_name: "mcp__github__enable_pr_auto_merge", tool_input: {pullNumber: 12}}')"
check 2 "$(jq -nc '{tool_name: "mcp__plugin_engineering_github__pull_request_review_write", tool_input: {method: "create", event: "APPROVE"}}')"

check 0 "$(bash_cmd 'gh pr merge 12 --squash --auto')"
check 0 "$(bash_cmd 'gh pr merge --squash --auto')"
check 0 "$(bash_cmd 'gh pr merge 12 --disable-auto')"
check 0 "$(bash_cmd 'gh pr review 12 --comment -b "see line 4"')"
check 0 "$(bash_cmd 'gh pr review 12 -b approved-by-design -c')"
check 0 "$(bash_cmd 'gh pr view 12 --json state')"
check 0 "$(bash_cmd 'gh api repos/idanfishman/example/rulesets --jq ".[].name"')"
check 0 "$(bash_cmd 'gh api -X GET repos/idanfishman/example/branches/master/protection -f per_page=1')"
check 0 "$(bash_cmd 'gh api repos/idanfishman/example/pulls/12/reviews -f event=COMMENT -f body=nit')"
check 0 "$(bash_cmd 'git log --grep "gh pr merge"')"
check 0 "$(jq -nc '{tool_name: "mcp__github__get_pull_request_reviews", tool_input: {pullNumber: 12}}')"
check 0 "$(jq -nc '{tool_name: "mcp__github__disable_pr_auto_merge", tool_input: {pullNumber: 12}}')"
check 0 "$(jq -nc '{tool_name: "Edit", tool_input: {file_path: "x"}}')"

[ "$fail" = 0 ] && echo "guard-merge-gate: all cases pass"
exit "$fail"
