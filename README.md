# skills

My agent setup. Each skill is a folder under [`skills/`](skills/) with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format. Today the repo ships as a Claude Code plugin. Support for other agents comes later.

## Install in Claude Code

```sh
claude plugin marketplace add idanfishman/skills
claude plugin install idanfishman@idanfishman
```

Run a skill as `/idanfishman:<skill>`. To get updates, run `claude plugin marketplace update idanfishman`.

## Develop

1. Install the tools and the pre-commit hooks:

   ```sh
   mise install
   mise exec -- prek install
   ```

2. Register your checkout as a directory marketplace, so Claude reads the skills in place. Edits load at the next session start or after `/reload-plugins`.
3. Run the gate after each change. CI runs the same script.

   ```sh
   scripts/validate.sh
   ```

4. Bump `version` in `.claude-plugin/plugin.json` in the PR that changes a skill. Merging to main releases `v<version>`. An unchanged version releases nothing.

## License

[Unlicense](LICENSE): public domain.
