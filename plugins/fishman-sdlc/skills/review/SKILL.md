---
name: review
description: Review a pull request against the repository's REVIEW.md and post the findings on it as inline comments.
argument-hint: "[PR number or URL; defaults to the current branch's PR]"
---

Review a pull request and post what you find on it.

1. **Find the PR:** `$ARGUMENTS`, or the current branch's PR (`gh pr view --json number,url,baseRefName,headRefOid`). If a `gh pr` command fails because GitHub's GraphQL API is blocked, as in Claude Code cloud sessions, use its REST route through `gh api`. If its head isn't checked out, check it out with `gh pr checkout`, but only when the working tree is clean.
2. **Run the `reviewer` subagent** on the PR's diff against its base.
3. **Post the findings as one review, never an approval.** Use `gh api repos/{owner}/{repo}/pulls/<n>/reviews` with `event: COMMENT` and `commit_id` set to the head.
   - **Inline comments:** each finding is an inline comment on its `path` and `line` (`side: RIGHT`). Its body names the severity (Important or nit), the rule or pass it breaks, and the fix. It ends with `<!-- fishman-sdlc:review -->`, which is how `/fishman-sdlc:push` finds the threads it may resolve.
   - **Lines outside the diff:** a finding there goes in the review body instead.
   - **The review body:** counts by severity, the nits past the cap as a count, and what was checked. If there are no findings, the body says what was checked. It ends with `<!-- fishman-sdlc:review -->`.
4. **Report the review's URL and its Important findings.** Approving or requesting changes is the owner's call, not yours.
