#!/usr/bin/env bash
# Feeds guard-merge-gate.sh one PreToolUse payload per case and checks that it blocks (2) or allows (0).
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
mcp() { jq -nc --arg t "mcp__github__$1" --argjson n "$2" '{tool_name: $t, tool_input: {owner: "o", repo: "r", pullNumber: $n}}'; }

# A gh on PATH that stands in for the real one. Pull request 2 has the Critical label, and so does each
# pull request in other/repo. gh can't read pull request 3. Each other pull request has a docs label.
stub=$(mktemp -d)
trap 'rm -rf "$stub"' EXIT
cat >"$stub/gh" <<'STUB'
#!/usr/bin/env bash
case " $* " in
  *" 3 "* | */3" "*) echo "HTTP 404: Not Found" >&2 && exit 1 ;;
  *" 2 "* | */2" "* | *" other/repo "*) echo Critical ;;
  *) echo docs ;;
esac
STUB
chmod +x "$stub/gh"
export PATH="$stub:$PATH"

# gh pr merge.
check 0 "$(run "gh pr merge 1 --squash")"
check 2 "$(run "gh pr merge 2 --squash")"
check 2 "$(run "gh pr merge 3 --squash")"
check 2 "$(run "gh pr merge https://github.com/o/r/pull/2 --auto")"
check 2 "$(run "gh pr merge -R other/repo 1")"
check 0 "$(run 'gh pr merge --squash --subject "Fix 3 bugs"')"
check 2 "$(run "git push && gh pr merge 2 --squash")"
check 2 "$(run "if gh pr checks 2; then gh pr merge 2 --squash; fi")"
check 0 "$(run 'git commit -m "Run gh pr merge 2 after CI"')"

# gh api and the GitHub MCP tools.
check 0 "$(run "gh api -X PUT repos/o/r/pulls/1/merge")"
check 2 "$(run "gh api -X PUT repos/o/r/pulls/2/merge")"
check 2 "$(run "gh api -X PUT repos/o/r/pulls/2/ccr/auto_merge")"
check 0 "$(mcp merge_pull_request 1)"
check 2 "$(mcp merge_pull_request 2)"
check 2 "$(mcp enable_pr_auto_merge 2)"

# Other work, and a hook that can't run.
check 0 "$(run "gh pr view 2")"
check 0 "$(jq -nc '{tool_name: "Edit", tool_input: {file_path: "x"}}')"
check 2 'not json'
PATH=/nonexistent "$BASH" "$guard" <<<"$(run "gh pr merge 2 --squash")" >/dev/null 2>&1
nojq=$?
[ "$nojq" = 2 ] || { echo "FAIL want 2 got $nojq: the hook without jq on PATH"; fail=1; }

[ "$fail" = 0 ] && echo "guard-merge-gate: all cases pass"
exit "$fail"
