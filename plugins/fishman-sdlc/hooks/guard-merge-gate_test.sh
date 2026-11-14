#!/usr/bin/env bash
# Feeds guard-merge-gate.sh one PreToolUse payload per case and checks it blocks (2) or allows (0).
# One case per rule, plus the command forms that change how the hook finds the pull request.
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
run() { jq -nc --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'; }
mcp() { jq -nc --arg t "$1" --argjson i "$2" '{tool_name: $t, tool_input: $i}'; }

# The stub's pull requests in idanfishman/example, by number. Branch "hotfix" is the critical one, and the
# current branch is the green one. idanfishman/nolabel has no critical label.
green=1 critical=2 unreadable=3 failing=4 running=5 nochecks=6 failing_status=7

# Stands in for gh api. A pull request's head SHA is its number.
GUARD_GH=$(mktemp)
trap 'rm -f "$GUARD_GH"' EXIT
cat >"$GUARD_GH" <<STUB
#!/usr/bin/env bash
pr() { printf '[{"number": %s, "base": {"repo": {"full_name": "idanfishman/example"}}}]\n' "\$1"; }
case \$2 in
  "repos/{owner}/{repo}") echo '{"full_name": "idanfishman/example"}' ;;
  "repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open") pr $green ;;
  repos/*/pulls\?head=*:hotfix\&state=open) pr $critical ;;
  repos/*/pulls\?head=*) echo '[]' ;;
  repos/*/pulls/$unreadable) exit 1 ;;
  repos/*/pulls/$critical) echo '{"labels": [{"name": "Critical"}], "head": {"sha": "$critical"}}' ;;
  repos/*/pulls/*) echo "{\"labels\": [{\"name\": \"docs\"}], \"head\": {\"sha\": \"\${2##*/}\"}}" ;;
  repos/idanfishman/nolabel/labels/critical) exit 1 ;;
  repos/*/labels/critical) echo '{"name": "critical"}' ;;
  repos/*/commits/$failing/check-runs*) echo '{"check_runs": [{"conclusion": "success"}, {"conclusion": "failure"}]}' ;;
  repos/*/commits/$running/check-runs*) echo '{"check_runs": [{"conclusion": null}]}' ;;
  repos/*/commits/$nochecks/check-runs*) echo '{"check_runs": []}' ;;
  repos/*/commits/*/check-runs*) echo '{"check_runs": [{"conclusion": "success"}, {"conclusion": "skipped"}]}' ;;
  repos/*/commits/$failing_status/status*) echo '{"statuses": [{"state": "failure"}]}' ;;
  repos/*/commits/*/status*) echo '{"statuses": []}' ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$GUARD_GH"
export GUARD_GH

# The merge rules.
check 0 "$(run "gh pr merge $green --squash")"
check 2 "$(run "gh pr merge $critical --squash")"
check 2 "$(run "gh pr merge $unreadable --squash")"
check 2 "$(run "gh pr merge $failing --squash")"
check 2 "$(run "gh pr merge $running --squash")"
check 2 "$(run "gh pr merge $nochecks --squash")"
check 2 "$(run "gh pr merge $failing_status --squash")"
check 2 "$(run "gh pr merge $green --squash --repo idanfishman/nolabel")"
check 2 "$(run "gh pr merge $failing --squash --auto")"
check 2 "$(run "gh pr merge $green --squash --admin")"
check 0 "$(run "gh pr merge $critical --disable-auto")"

# How gh pr merge names the pull request.
check 0 "$(run "gh pr merge --squash")"
check 2 "$(run "gh pr merge hotfix --squash")"
check 2 "$(run "gh pr merge https://github.com/idanfishman/nolabel/pull/$green --squash")"
check 2 "$(run "gh pr merge $green --squash -R idanfishman/nolabel")"
check 0 "$(run "gh pr merge --squash --subject \"fix $critical\" $green")"
check 2 "$(run "cd ../other && gh pr merge $green --squash")"
check 0 "$(run "cd ../other && gh pr merge https://github.com/idanfishman/example/pull/$green --squash")"

# Where gh starts in a longer command.
check 2 "$(run "git push && gh pr merge $critical --squash")"
check 2 "$(run "if gh pr checks $critical; then gh pr merge $critical --squash; fi")"
check 0 "$(run 'git log --grep "gh pr merge"')"

# Merging through gh api and GraphQL.
check 0 "$(run "gh api -X PUT repos/idanfishman/example/pulls/$green/merge -f merge_method=squash")"
check 2 "$(run "gh api -X PUT repos/idanfishman/example/pulls/$critical/merge")"
check 0 "$(run "gh api -X PUT \"repos/{owner}/{repo}/pulls/$green/merge\"")"
check 2 "$(run "cd ../other && gh api -X PUT \"repos/{owner}/{repo}/pulls/$green/merge\"")"
check 2 "$(run "gh api -X PUT repos/idanfishman/example/pulls/$failing/ccr/auto_merge")"
check 0 "$(run "gh api -X DELETE repos/idanfishman/example/pulls/$critical/ccr/auto_merge")"
check 0 "$(run "gh api repos/idanfishman/example/pulls/$critical/merge")"
check 2 "$(run 'gh api graphql -f query="mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }"')"

# Merging through the GitHub MCP tools.
check 0 "$(mcp mcp__github__merge_pull_request "{\"owner\": \"idanfishman\", \"repo\": \"example\", \"pullNumber\": $green}")"
check 2 "$(mcp mcp__github__merge_pull_request "{\"owner\": \"idanfishman\", \"repo\": \"example\", \"pullNumber\": $critical}")"
check 2 "$(mcp mcp__github__merge_pull_request "{\"pullNumber\": $green}")"
check 2 "$(mcp mcp__github__enable_pr_auto_merge "{\"owner\": \"idanfishman\", \"repo\": \"example\", \"pullNumber\": $failing}")"
check 0 "$(mcp mcp__github__disable_pr_auto_merge "{\"owner\": \"idanfishman\", \"repo\": \"example\", \"pullNumber\": $critical}")"

# Approving.
check 2 "$(run "gh pr review $green --approve")"
check 2 "$(run "gh pr review $green -a")"
check 0 "$(run "gh pr review $green -b approved-by-design -c")"
check 2 "$(run "gh api repos/idanfishman/example/pulls/$green/reviews -f event=APPROVE")"
check 0 "$(run $'gh api repos/idanfishman/example/pulls/1/reviews --input - <<\'EOF\'\n{"event": "COMMENT", "body": "Fix this, then I APPROVE"}\nEOF')"
check 2 "$(mcp mcp__github__pull_request_review_write '{"method": "create", "event": "approve"}')"
check 0 "$(mcp mcp__github__add_comment_to_pending_review '{"body": "I approve of this name"}')"

# The critical label.
check 2 "$(run "gh pr edit $critical --remove-label critical")"
check 0 "$(run "gh pr edit $critical --add-label critical")"
check 2 "$(run 'gh label delete critical --yes')"
check 2 "$(run 'gh label edit critical --name later')"
check 0 "$(run 'gh label edit critical --description "Needs the owner"')"
check 2 "$(run "gh api -X DELETE repos/idanfishman/example/issues/$critical/labels/critical")"

# Branch protection.
check 2 "$(run 'gh api --method PUT repos/idanfishman/example/branches/main/protection --input p.json')"
check 0 "$(run 'gh api repos/idanfishman/example/rulesets --jq ".[].name"')"

# Other work, and a hook that can't run.
check 0 "$(run "gh pr view $critical --json state")"
check 0 "$(jq -nc '{tool_name: "Edit", tool_input: {file_path: "x"}}')"
check 2 'not json'
PATH=/nonexistent "$BASH" "$guard" <<<"$(run "gh pr merge $critical --squash")" >/dev/null 2>&1
nojq=$?
[ "$nojq" = 2 ] || { echo "FAIL want 2 got $nojq: the hook without jq on PATH"; fail=1; }

[ "$fail" = 0 ] && echo "guard-merge-gate: all cases pass"
exit "$fail"
