---
name: push
description: Open a PR for verified work, have it checked independently on the PR, fix what's found, and arm auto-merge, which the merge-gate hook refuses on a critical PR.
disable-model-invocation: true
---

Push the current work as a pull request. This session already ran the repository's gate before it called the work done. The steps below add an independent check, recorded on the PR.

1. Run `git fetch origin`, then rebase onto the default branch if this branch is behind it. Branch from the default branch, as `<type>/<change-id>` when the work implements an OpenSpec change. If the change needs an open PR's change, branch from that PR's branch and open yours against it (`gh pr create --base <its branch>`). If that PR lands first, yours is retargeted to the default branch: merge the default branch in, push it, and run steps 5 and 6 again before step 7.
2. Stage what belongs in this change and show what will be committed. If the gate that the repository's `CLAUDE.md` or README names hasn't passed on it, run it now. Tick an OpenSpec change's `tasks.md` boxes in the commits that do the work.
3. Write the message in Conventional Commits format. The subject is at most 50 characters, imperative, lowercase after the type, with no trailing period. Add a body only when the "why" is not obvious from the subject.
4. Push, then open the PR with `gh pr create`. The title mirrors the commit subject. The body says what changed and why, and carries `OpenSpec: <change-id>` when there is one.
5. Check it independently, on the PR:
   - Run the `verifier` subagent and post its report as a PR comment with `gh pr comment`, ending with `<!-- fishman:verify -->`.
   - Run `/fishman:review`, which posts the reviewer's findings as inline comments.
6. Fix what they found:
   - Fix each thing the verifier found broken, and every Important review finding, as a follow-up commit, and push it.
   - Then repeat step 5 on the new head.
   - If it isn't clean after two rounds, stop and report.
   - Nits don't block. A nit fix starts another round, so after the last round leave a nit as is.
   - A review thread is yours only when it is unresolved and holds exactly one comment, which contains `<!-- fishman:review -->`. Any reply makes it the owner's. Answer each of yours with one reply that ends in `<!-- fishman:review -->`, and resolve it: fixed, naming the commit, or a nit left as is, saying why. An Important finding still open after two rounds stays unresolved, and so does every thread that isn't yours.
7. When the last round is clean, archive the OpenSpec change, if there is one, as the PR's final commit: `openspec archive <change-id> --yes`, then `openspec validate --all --strict`. Push it. Then arm auto-merge with `gh pr merge --squash --auto`, and report the PR URL and the check status. The merge-gate hook refuses a PR labelled `critical`, which waits for the owner's review: say so. It also refuses when it can't read the PR's labels, or when the repository has no `critical` label. Retry once, then report the hook's message.
8. Let CI gate the merge. Do not merge by hand, and do not disable or bypass a failing check.

Ask before you force-push a branch that someone else may already have pulled.
