# fishman-sdlc

An AI-native SDLC (software development life cycle) for Claude Code. Claude does the work up to the merge gate. An independent verifier and reviewer check each PR, and you hold the gate. It follows Anthropic's [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook): skills advise, hooks enforce, and CI and review verify.

## The loop

```mermaid
flowchart TD
    plan["Plan and design<br/>/opsx:propose writes the proposal and the specs"]
    gate1{{"Gate 1<br/>You approve the proposal and the specs"}}
    build["Build and test<br/>Claude builds the change and runs the gate"]
    push["Ship<br/>/fishman-sdlc:push opens the PR"]
    check["Check<br/>The verifier and the reviewer post on the PR"]
    found{"Something broken,<br/>or an Important finding?"}
    fix["Fix<br/>Claude pushes a fix"]
    stop["Claude stops and<br/>reports to you"]
    ci["Claude archives the OpenSpec change,<br/>and CI runs every check"]
    critical{"Does the PR carry<br/>the critical label?"}
    merge["Claude merges"]
    gate2{{"Gate 2<br/>You review and merge"}}

    plan --> gate1 --> build --> push --> check --> found
    found -- "yes, in round 1 or 2" --> fix --> check
    found -- "yes, after round 2" --> stop
    found -- no --> ci --> critical
    critical -- no --> merge
    critical -- yes --> gate2

    classDef you fill:#fde68a,stroke:#b45309,color:#1f2937
    class gate1,gate2,stop you
```

The yellow steps are yours. Without OpenSpec, there is no gate 1, and the PR body states the intent.

When to use each part:

- Run `/fishman-sdlc:push` when the change is built and the gate passes. It takes the change from there to the merge.
- Run `/fishman-sdlc:review` on its own to review any PR, for example one that a person wrote. It posts findings and never approves.
- The merge gate needs no command. It acts in every session where the plugin is on, whatever starts the merge.

## The parts

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
4. Create a `critical` label, and have CI add it to each PR that touches a path that needs your review, for example with [actions/labeler](https://github.com/actions/labeler). Without the label, Claude merges nothing.
5. Optional: use [OpenSpec](https://github.com/Fission-AI/OpenSpec) for the intent of each change, with `openspec init --tools claude`. Without it, the PR body states the intent.

## The merge gate

Claude may merge a PR only when all of these are true:

- The repository has a `critical` label.
- The PR does not carry the `critical` label.
- The PR has at least one check, and every check on its head passed. This also holds for auto-merge, because GitHub waits only for required checks.

The hook never lets Claude approve a PR, merge with `--admin`, remove or rename the `critical` label with `gh`, or change branch protection or rulesets. It checks merges through `gh pr merge`, `gh api` and the GitHub MCP tools the same way. It reads GitHub only through the REST API, so it also works in Claude Code cloud sessions, which block GitHub's GraphQL API. The hook needs `jq`. When it can't run or can't read what it needs, it blocks.

The hook stops a mistake, not an adversary. It matches the command line, so a deliberate bypass can route around it, such as a script, `bash -c`, an env prefix, a request body in a file or a browser. Where your GitHub plan allows it, add branch protection as the hard boundary.
