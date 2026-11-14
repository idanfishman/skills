# skills

My agent setup. Each skill is a folder under [`skills/`](skills/) with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format. Today the repo ships as a Claude Code plugin. Support for other agents comes later.

## Install in Claude Code

```sh
claude plugin marketplace add idanfishman/skills
claude plugin install fishman@fishman
```

Run a skill as `/fishman:<skill>`. To get updates, run `claude plugin marketplace update fishman`.

## Ship with the SDLC

The plugin holds an AI-native SDLC (software development life cycle): the `verifier` and `reviewer` agents, `/fishman:push`, `/fishman:review`, and a hook that keeps the merge gate yours.

### Set up a repository

1. Enable `fishman@fishman` in the repository's `.claude/settings.json`.
2. Pin the OpenSpec CLI in `mise.toml`: `"npm:@fission-ai/openspec" = "1.14.3"`.
3. Run `openspec init --tools claude` and commit the result.
4. In `openspec/config.yaml`, add `rules` that give each proposal a "Lenses" section (UX, Security, QA) and each spec a scenario per lens.
5. Add a `REVIEW.md` that names the review passes, what counts as Important, and the nit cap.
6. Create a `critical` label, and have CI apply it to the paths that need your review.

### The loop

1. `/opsx:propose` writes `openspec/changes/<id>/`. You approve the proposal and specs before `/opsx:apply`.
2. Claude builds the change and runs the repository's gate.
3. `/fishman:push` opens the PR. The verifier checks every scenario. The reviewer posts inline findings, with one pass per lens.
4. Claude fixes Important findings, for up to 2 rounds. Then it archives the OpenSpec change and arms auto-merge, so CI decides the merge.

| Agent | Model | Effort | Reads |
|---|---|---|---|
| `reviewer` | Opus | high | the diff and touched files, `REVIEW.md`, `CLAUDE.md`, the active OpenSpec change and its lenses |
| `verifier` | Sonnet | medium | the active OpenSpec change, the gate, and a real run of each scenario |

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

[Unlicense](LICENSE): public domain.
