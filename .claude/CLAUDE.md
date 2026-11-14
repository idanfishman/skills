# skills

My agent skills, shipped as the `fishman` Claude Code marketplace. Each plugin is a folder in `plugins/`. Each skill is a folder in a plugin's `skills/`, with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format.

`references/` holds summaries of source articles, as a base for new skills. They are not skills and do not ship in a release on their own.

## Commands

- Setup, once per clone: `mise install`, then `mise exec -- prek install`.
- Gate, the same check as the `Validate` CI job: `scripts/validate.sh`.
- After a change to `.github/`: `mise exec -- actionlint` and `mise exec -- zizmor --no-online-audits .`.
- To try a plugin from this checkout: `claude --plugin-dir plugins/<name>`. Edits load at the next session or after `/reload-plugins`.

## Release

- All plugins share one version. Merging to main releases `v<version>` from the `plugin.json` files, with the `CHANGELOG.md` section of that version as the notes. An unchanged version releases nothing.
- A PR that changes a plugin bumps `version` in every `plugin.json` and renames `## [Unreleased]` in `CHANGELOG.md` to `## [<version>] - <YYYY-MM-DD>`. Keep the format of [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), link references included.
- Draft the changelog entry with me. Base it on the diff and the changed `SKILL.md` files since the last tag, not on commit titles. Write it with `fishman:no-fluff`, for the plugin user, not for the developer of this repo. Wait for my edits before you commit it.

## Gotchas

- This repository is public. Keep names, paths and rules from my private repositories out of it.
- Each hook script has a `<name>_test.sh` beside it, which the gate runs. A hook change needs a test case.
- `scripts/validate.sh` fails when the `plugin.json` versions differ, or when `CHANGELOG.md` has no section for that version. `scripts/release-notes.sh <version>` prints that section and then `.github/release-footer.md`. The release job publishes this output.
- The release job creates a release only once. To fix the notes of a published release, edit `CHANGELOG.md`, then run `gh release edit v<version> --notes "$(scripts/release-notes.sh <version>)"`.
