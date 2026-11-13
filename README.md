# skills

My agent setup. Each skill is a folder under [`skills/`](skills/) with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format. Today the repo ships as a Claude Code plugin. Support for other agents comes later.

## Install in Claude Code

```sh
claude plugin marketplace add idanfishman/skills
claude plugin install idanfishman@idanfishman
```

Run a skill as `/idanfishman:<skill>`. To get updates, run `claude plugin marketplace update idanfishman`.

## Develop

1. Register your checkout as a directory marketplace, so Claude reads the skills in place. Edits load at the next session start or after `/reload-plugins`.
2. Validate after each change:

   ```sh
   claude plugin validate .
   ```

3. Bump `version` in `.claude-plugin/plugin.json` when you change a skill.

## License

[MIT](LICENSE)
