# skills

My agent setup, as a Claude Code plugin marketplace. Each plugin is a folder under [`plugins/`](plugins/). Each skill in a plugin is a folder with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format. Support for other agents comes later.

| Plugin | What it gives you |
| --- | --- |
| [`fishman`](plugins/fishman/) | Writing skills: `no-fluff` for plain language, `come-again` to explain an answer again, and `context-engineering` for context that Claude reads. |
| [`fishman-sdlc`](plugins/fishman-sdlc/) | An AI-native SDLC. `/fishman-sdlc:push` ships a PR past an independent verifier and reviewer, behind a merge gate you hold. |

## Install in Claude Code

```sh
claude plugin marketplace add idanfishman/skills
claude plugin install fishman@fishman
```

Run a skill as `/<plugin>:<skill>`, for example `/fishman:no-fluff`. Turn on `fishman-sdlc` per repository, because its hook acts in every session where it is on. [Its README](plugins/fishman-sdlc/) says how. To get updates, run `claude plugin marketplace update fishman`.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

[Unlicense](LICENSE): public domain.
