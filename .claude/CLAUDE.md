# skills

My agent skills, shipped as the `fishman` Claude Code plugin. The repo root is the plugin. Each skill is a folder in `skills/` with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format.

## Commands

- Setup, once per clone: `mise install`, then `mise exec -- prek install`.
- Gate, the same check as the `Validate` CI job: `scripts/validate.sh`.
- After a change to `.github/`: `mise exec -- actionlint` and `mise exec -- zizmor --no-online-audits .`.
- To try a skill from this checkout, register the checkout as a directory marketplace. Edits load at the next session or after `/reload-plugins`.

## Release

- Merging to main releases `v<version>` from `.claude-plugin/plugin.json`, with the `CHANGELOG.md` section of that version as the notes. An unchanged version releases nothing.
- A PR that changes a skill bumps `version` and renames `## [Unreleased]` in `CHANGELOG.md` to `## [<version>] - <YYYY-MM-DD>`. Keep the format of [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), link references included.
- Draft the changelog entry with me. Base it on the diff and the changed `SKILL.md` files since the last tag, not on commit titles. Write it with `fishman:no-fluff`, for the plugin user, not for the developer of this repo. Wait for my edits before you commit it.

## Gotchas

- `scripts/validate.sh` fails when `CHANGELOG.md` has no section for the version in `plugin.json`. `scripts/release-notes.sh <version>` prints that section and then `.github/release-footer.md`. The release job publishes this output.
- The release job creates a release only once. To fix the notes of a published release, edit `CHANGELOG.md`, then run `gh release edit v<version> --notes "$(scripts/release-notes.sh <version>)"`.
