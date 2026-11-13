# skills

My agent setup. Each skill is a folder under [`skills/`](skills/) with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format. Today the repo ships as a Claude Code plugin. Support for other agents comes later.

## Install in Claude Code

```sh
claude plugin marketplace add idanfishman/skills
claude plugin install fishman@fishman
```

Run a skill as `/fishman:<skill>`. To get updates, run `claude plugin marketplace update fishman`.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

[Unlicense](LICENSE): public domain.
