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
mcp() { jq -nc --arg t "$1" --argjson i "$2" '{tool_name: $t, tool_input: $i}'; }

# Stands in for gh api. In idanfishman/example, pull request 13 carries the critical label and 14 can't be
# read. On their heads, 15 has a failing check run, 16 a running one, 17 unreadable checks, 18 no checks,
# 19 a failing commit status. 21 carries the label as "Critical". Branch "feature" is pull request 12 and
# "hotfix" is 13; the current branch is 12. idanfishman/nolabel has no critical label.
GUARD_GH=$(mktemp)
trap 'rm -f "$GUARD_GH"' EXIT
cat >"$GUARD_GH" <<'STUB'
#!/usr/bin/env bash
[ "$1" = api ] || exit 1
pr() { printf '[{"number": %s, "base": {"repo": {"full_name": "idanfishman/example"}}}]\n' "$1"; }
case $2 in
  "repos/{owner}/{repo}") echo '{"full_name": "idanfishman/example"}' ;;
  "repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open") pr 12 ;;
  repos/*/pulls\?head=*:feature\&state=open) pr 12 ;;
  repos/*/pulls\?head=*:hotfix\&state=open) pr 13 ;;
  repos/*/pulls\?head=*) echo '[]' ;;
  repos/*/pulls/14) exit 1 ;;
  repos/*/pulls/13) echo '{"labels": [{"name": "critical"}], "head": {"sha": "s13"}}' ;;
  repos/*/pulls/21) echo '{"labels": [{"name": "Critical"}], "head": {"sha": "s21"}}' ;;
  repos/*/pulls/*) echo "{\"labels\": [{\"name\": \"docs\"}], \"head\": {\"sha\": \"s${2##*/}\"}}" ;;
  repos/idanfishman/nolabel/labels/critical) exit 1 ;;
  repos/*/labels/critical) echo '{"name": "critical"}' ;;
  repos/*/commits/s15/check-runs*) echo '{"check_runs": [{"conclusion": "success"}, {"conclusion": "failure"}]}' ;;
  repos/*/commits/s16/check-runs*) echo '{"check_runs": [{"conclusion": null}]}' ;;
  repos/*/commits/s17/check-runs*) exit 1 ;;
  repos/*/commits/s18/check-runs*) echo '{"check_runs": []}' ;;
  repos/*/commits/*/check-runs*) echo '{"check_runs": [{"conclusion": "success"}, {"conclusion": "skipped"}]}' ;;
  repos/*/commits/s19/status*) echo '{"statuses": [{"state": "failure"}]}' ;;
  repos/*/commits/*/status*) echo '{"statuses": []}' ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$GUARD_GH"
export GUARD_GH


# gh pr merge
check 2 "$(bash_cmd 'gh pr merge 12 --admin --squash')"
check 2 "$(bash_cmd 'gh pr merge 13 --squash')"
check 2 "$(bash_cmd 'git push && gh pr merge 13 --squash --delete-branch')"
check 2 "$(bash_cmd 'gh pr merge 14 --squash')"
check 2 "$(bash_cmd 'gh pr merge 15 --squash')"
check 2 "$(bash_cmd 'gh pr merge 16 --squash')"
check 2 "$(bash_cmd 'gh pr merge 17 --squash')"
check 2 "$(bash_cmd 'gh pr merge 18 --squash')"
check 2 "$(bash_cmd 'gh pr merge 19 --squash')"
check 2 "$(bash_cmd 'gh pr merge --squash --subject "fix 12" 15')"
check 2 "$(bash_cmd 'gh pr merge hotfix --squash')"
check 2 "$(bash_cmd 'gh pr merge no-such-branch --squash')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --repo idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge 13 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge --auto --squash 13 --repo idanfishman/example')"
check 2 "$(bash_cmd 'gh pr merge 14 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --auto --repo idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --auto -R idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --auto --repo=idanfishman/nolabel')"
check 2 "$(bash_cmd 'gh pr merge https://github.com/idanfishman/nolabel/pull/12 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge 15 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge 16 --squash --auto')"
check 2 "$(bash_cmd 'gh pr merge 21 --squash')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash --admin=true')"
check 2 "$(bash_cmd 'gh pr merge 12 --squash -Ridanfishman/nolabel')"
# shellcheck disable=SC2016 # The command substitution is the case under test.
check 2 "$(bash_cmd 'echo $(gh pr merge 13 --squash)')"
# shellcheck disable=SC2016 # So is the backtick form.
check 2 "$(bash_cmd 'echo `gh pr merge 13 --squash`')"
check 2 "$(bash_cmd 'cd ../other && gh pr merge 12 --squash')"
check 2 "$(bash_cmd 'pushd ../other && gh pr merge --squash')"
# gh pr review
check 2 "$(bash_cmd 'gh pr review 12 --approve')"
check 2 "$(bash_cmd 'gh pr review 12 -a -b lgtm')"
check 2 "$(bash_cmd 'gh pr review 12 -ab lgtm')"
check 2 "$(bash_cmd 'gh pr review 12 -ca')"
# gh api
check 2 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/13/merge')"
check 2 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/15/merge -f merge_method=squash')"
check 2 "$(bash_cmd 'gh api -X PUT "repos/{owner}/{repo}/pulls/13/merge"')"
check 2 "$(bash_cmd 'gh api -X PUT repos/idanfishman/nolabel/pulls/12/merge')"
check 2 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/13/ccr/auto_merge')"
check 2 "$(bash_cmd 'gh api graphql -f query="mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }"')"
check 2 "$(bash_cmd 'gh api graphql -f query="mutation { enablePullRequestAutoMerge(input: {pullRequestId: \"x\"}) { clientMutationId } }"')"
check 2 "$(bash_cmd 'gh api repos/idanfishman/example/pulls/12/reviews -f event=APPROVE')"
check 2 "$(bash_cmd 'gh api -X DELETE repos/idanfishman/example/rulesets/7')"
check 2 "$(bash_cmd 'gh api --method PUT repos/idanfishman/example/branches/master/protection --input p.json')"
check 2 "$(bash_cmd 'gh api -X DELETE repos/idanfishman/example/issues/13/labels/critical')"
check 2 "$(bash_cmd 'gh api -X DELETE repos/idanfishman/example/issues/13/labels/Critical')"
check 2 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/15/ccr/auto_merge')"
check 2 "$(bash_cmd 'cd ../other && gh api -X PUT "repos/{owner}/{repo}/pulls/12/merge"')"
check 2 "$(bash_cmd 'gh api repos/idanfishman/example/rulesets --input r.json')"
check 2 "$(bash_cmd 'gh api graphql -f query="mutation { addPullRequestReview(input: {pullRequestId: \"x\", event: APPROVE}) { clientMutationId } }"')"
# The critical label
check 2 "$(bash_cmd 'gh pr edit 13 --remove-label critical')"
check 2 "$(bash_cmd 'gh pr edit 13 --remove-label "docs, critical"')"
check 2 "$(bash_cmd 'gh issue edit 13 --remove-label=critical')"
check 2 "$(bash_cmd 'gh label delete critical --yes')"
check 2 "$(bash_cmd 'gh label edit critical --name later')"
check 2 "$(bash_cmd 'gh pr edit 13 --remove-label Critical')"
check 2 "$(bash_cmd 'gh label delete Critical --yes')"
# GitHub MCP tools
check 2 "$(mcp mcp__github__merge_pull_request '{"owner": "idanfishman", "repo": "example", "pullNumber": 13}')"
check 2 "$(mcp mcp__github__merge_pull_request '{"owner": "idanfishman", "repo": "example", "pullNumber": 15}')"
check 2 "$(mcp mcp__github__merge_pull_request '{"pullNumber": 12}')"
check 2 "$(mcp mcp__github__enable_pr_auto_merge '{"owner": "idanfishman", "repo": "example", "pullNumber": 13}')"
check 2 "$(mcp mcp__github__enable_pr_auto_merge '{"owner": "idanfishman", "repo": "nolabel", "pullNumber": 12}')"
check 2 "$(mcp mcp__plugin_engineering_github__pull_request_review_write '{"method": "create", "event": "APPROVE"}')"
check 2 "$(mcp mcp__github__pull_request_review_write '{"method": "create", "event": "approve"}')"
check 2 "$(mcp mcp__github__merge_pull_request '{"owner": "idanfishman", "repo": "example", "pullNumber": 21}')"
check 2 "$(mcp mcp__github__enable_pr_auto_merge '{"owner": "idanfishman", "repo": "example", "pullNumber": 15}')"

check 0 "$(bash_cmd 'gh pr merge 12 --squash')"
check 0 "$(bash_cmd 'git push && gh pr merge 12 --squash --delete-branch')"
check 0 "$(bash_cmd 'gh pr merge --squash --subject "fix 13" 12')"
check 0 "$(bash_cmd 'gh pr merge 12 --squash --repo idanfishman/example')"
check 0 "$(bash_cmd 'gh pr merge feature --squash')"
check 0 "$(bash_cmd 'gh pr merge --squash')"
check 0 "$(bash_cmd 'gh pr merge 12 --squash --auto')"
check 0 "$(bash_cmd 'gh pr merge --squash --auto')"
check 0 "$(bash_cmd 'gh pr merge 13 --disable-auto')"
check 0 "$(bash_cmd 'gh pr review 12 --comment -b "see line 4"')"
check 0 "$(bash_cmd 'gh pr review 12 -b approved-by-design -c')"
check 0 "$(bash_cmd 'gh pr view 12 --json state')"
check 0 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/12/merge -f merge_method=squash')"
check 0 "$(bash_cmd 'gh api -X PUT "repos/{owner}/{repo}/pulls/12/merge"')"
check 0 "$(bash_cmd 'gh api -X PUT repos/idanfishman/example/pulls/12/ccr/auto_merge')"
check 0 "$(bash_cmd 'gh api -X DELETE repos/idanfishman/example/pulls/13/ccr/auto_merge')"
check 0 "$(bash_cmd 'gh api repos/idanfishman/example/pulls/13/merge')"
check 0 "$(bash_cmd 'gh api repos/idanfishman/example/rulesets --jq ".[].name"')"
check 0 "$(bash_cmd 'gh api -X GET repos/idanfishman/example/branches/master/protection -f per_page=1')"
check 0 "$(bash_cmd 'gh api repos/idanfishman/example/pulls/12/reviews -f event=COMMENT -f body=nit')"
check 0 "$(bash_cmd 'git log --grep "gh pr merge"')"
check 0 "$(bash_cmd $'gh api repos/idanfishman/example/pulls/12/reviews --input - <<\'EOF\'\n{"event": "COMMENT", "body": "Fix this, then I APPROVE"}\nEOF')"
check 0 "$(bash_cmd 'gh pr edit 13 --add-label critical')"
check 0 "$(bash_cmd 'gh pr edit 13 --remove-label docs,critical-path')"
check 0 "$(bash_cmd 'gh label edit critical --description "Needs the owner"')"
check 0 "$(bash_cmd 'cd ../other && gh pr merge https://github.com/idanfishman/example/pull/12 --squash')"
check 0 "$(bash_cmd 'cd ../other && gh pr merge 12 --squash --repo idanfishman/example')"
check 0 "$(mcp mcp__github__merge_pull_request '{"owner": "idanfishman", "repo": "example", "pullNumber": 12}')"
check 0 "$(mcp mcp__github__enable_pr_auto_merge '{"owner": "idanfishman", "repo": "example", "pullNumber": 12}')"
check 0 "$(mcp mcp__github__disable_pr_auto_merge '{"owner": "idanfishman", "repo": "example", "pullNumber": 13}')"
check 0 "$(mcp mcp__github__pull_request_read '{"method": "get_reviews", "pullNumber": 12}')"
check 0 "$(mcp mcp__github__add_comment_to_pending_review '{"body": "I approve of this name"}')"
check 0 "$(jq -nc '{tool_name: "Edit", tool_input: {file_path: "x"}}')"

# Without jq on PATH, the hook still blocks.
PATH=/nonexistent "$BASH" "$guard" <<<"$(bash_cmd 'gh pr merge 13 --squash')" >/dev/null 2>&1
nojq=$?
[ "$nojq" = 2 ] || { echo "FAIL want 2 got $nojq: the hook without jq on PATH"; fail=1; }

[ "$fail" = 0 ] && echo "guard-merge-gate: all cases pass"
exit "$fail"
