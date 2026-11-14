# fishman-sdlc

An AI-native SDLC (software development life cycle) for Claude Code. Claude does the work up to the merge gate. An independent verifier and reviewer check each PR, and you hold the gate. It follows Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook): skills advise, hooks enforce, and CI and review verify.

| Part | Kind | What it does |
| --- | --- | --- |
| `/fishman-sdlc:push` | Skill | Opens the PR and runs the verifier and the reviewer on it. It fixes what they find, for up to 2 rounds. Then it merges once every check passes. A critical PR waits for you. |
| `/fishman-sdlc:review` | Skill | Runs the reviewer and posts its findings as inline PR comments. It never approves. |
| `reviewer` | Agent: Opus, high effort | Reviews the diff against the repository's `REVIEW.md` and the change's intent, from a fresh context. It reports and never edits. |
| `verifier` | Agent: Sonnet, medium effort | Runs the gate and exercises each scenario of the change, as its actor. It reports and never fixes. |
| Merge gate | `PreToolUse` hook | Stops Claude from approving a PR, merging a critical PR, merging before every check passes, removing the `critical` label, and changing branch protection. |

The short `/push` also works when no other command has that name. Claude Code has a built-in `/review`, so use `/fishman-sdlc:review`.

## Set up a repository

1. Turn on the plugin for the repository:

   ```sh
   claude plugin install fishman-sdlc --marketplace idanfishman/skills --scope project
   ```

   For a team, put the marketplace in the repository's `.claude/settings.json` too, so each clone gets it. Pin `ref` to a release tag, so a new release reaches the repository only when you move the pin:

   ```json
   {
     "extraKnownMarketplaces": {
       "fishman": { "source": { "source": "github", "repo": "idanfishman/skills", "ref": "v1.2.0" } }
     },
     "enabledPlugins": { "fishman-sdlc@fishman": true }
   }
   ```

2. In `CLAUDE.md`, name the gate: one command that runs every check and fails on error. "Done" includes its output.
3. Add a `REVIEW.md`. It names the review passes in order, what counts as Important, the nit cap, and what not to report. Without one, the reviewer runs a bugs pass and a security pass.
4. Create a `critical` label, and have CI add it to the paths that need your review, for example with [actions/labeler](https://github.com/actions/labeler). Without the label, Claude merges nothing.
5. Optional: use [OpenSpec](https://github.com/Fission-AI/OpenSpec) for the intent of each change, with `openspec init --tools claude`. Without it, the PR body states the intent.

## The loop

1. **Plan and design.** `/opsx:propose` writes the proposal, the spec deltas, `design.md` and `tasks.md`. You approve the proposal and the specs before the build starts. This is gate 1.
2. **Build and test.** Claude builds the change and runs the gate.
3. **Ship.** `/fishman-sdlc:push` opens the PR. The verifier posts its report, and the reviewer posts inline findings.
4. **Fix.** Claude fixes each Important finding, for up to 2 rounds, and archives the OpenSpec change.
5. **Merge.** When every check passes, Claude merges. A `critical` PR waits for your review. This is gate 2.

## The merge gate

Claude may merge a PR only when all of these are true:

- The repository has a `critical` label.
- The PR does not carry the `critical` label.
- Every check on the PR's head passed. To arm auto-merge, the first two are enough, because GitHub waits for the checks.

The hook never lets Claude approve a PR, merge with `--admin`, remove or rename the `critical` label, or change branch protection or rulesets. It checks merges through `gh pr merge`, `gh api` and the GitHub MCP tools the same way, and it reads a request body that `gh api` takes from a file or stdin. It reads GitHub only through the REST API, so it also works in Claude Code cloud sessions, which block GitHub's GraphQL API.

The hook matches the command line, so a script, `bash -c` or a browser can route around it. It stops a mistake, not an adversary. Where your GitHub plan allows it, add branch protection as the hard boundary.
