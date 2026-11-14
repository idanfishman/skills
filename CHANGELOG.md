# Changelog

All notable changes to the plugins in the `fishman` marketplace are in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the plugins use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.2] - 2026-11-14

### Changed

- Claude can now start `/fishman-sdlc:push` itself when you ask it to push or ship the work. Before, only you could start it, by typing the command. The merge gate still stops Claude from merging a critical PR or a PR that is not ready.

## [1.3.1] - 2026-11-14

### Changed

- The `fishman-sdlc` merge gate also stops Claude from merging a PR that is not ready. Ready means that every check on the PR's head commit passed. A PR with no checks is not ready. The hook also blocks when it can't read the checks.

## [1.3.0] - 2026-11-14

### Added

- The `fishman-typescript` plugin is a TypeScript style guide. The Google TypeScript Style Guide is the standard, and Ultracite on Biome enforces it. Turn it on per repository, as [its README](https://github.com/idanfishman/skills/tree/v1.3.0/plugins/fishman-typescript) says.
  - A hook loads the guide at session start, but only in a repository with a `tsconfig.json`.
  - `STYLEGUIDE.md` lists every rule, with an id and the tool that holds it. A reviewer, such as the `reviewer` agent of `fishman-sdlc`, cites these ids. It reports only the rules that no tool holds.
  - `biome.jsonc` extends Ultracite and changes its settings where they differ from Google, such as single quotes. Copy it to your repository root.
  - The guide departs from Google in four places. There is no `enum` and no parameter property, because Node strips types. File names are kebab-case, as the shadcn/ui CLI writes them. A default export is allowed only where a tool reads one. Where Biome bans what Google allows, such as `forEach` or `!`, the lint gate wins, and the escape is a `biome-ignore` comment with a reason.

## [1.2.0] - 2026-11-14

### Added

- The `fishman-sdlc` plugin runs an AI-native SDLC. Claude does the work up to the merge, and you hold the merge gate. Turn it on per repository, as [its README](https://github.com/idanfishman/skills/tree/v1.2.0/plugins/fishman-sdlc) says.
  - `/fishman-sdlc:push` opens the PR and runs a verifier and a reviewer on it. It fixes what they find, for up to 2 rounds. Then it merges when every check passes. A PR with the `critical` label waits for you.
  - `/fishman-sdlc:review` runs the reviewer and posts its findings as inline PR comments. It never approves.
  - The `reviewer` agent checks the diff against the repository's `REVIEW.md` and the intent of the change. The `verifier` agent runs the gate and tries each scenario of the change as its actor. Both agents only report.
  - A hook stops Claude from merging a PR that has the `critical` label, through `gh` or the GitHub MCP tools.

### Changed

- The marketplace now has two plugins. The `fishman` plugin keeps the writing skills, with no change to them.

## [1.1.0] - 2026-11-13

### Added

- The `context-engineering` skill writes and reviews context that Claude reads: `SKILL.md`, `CLAUDE.md`, agent system prompts, tool descriptions, and procedures or docs for agents. It keeps only what changes what Claude does. It puts each part where Claude loads it when needed. It writes the wording to the `no-fluff` standard. Run it as `/fishman:context-engineering [file]`. Give it a file path to review and rewrite that file, with a list of what it cut, moved or changed. Claude also loads it when you create or edit one of these files. The skill is based on the Anthropic post [The new rules of context engineering for Claude 5 generation models](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/).

## [1.0.0] - 2026-11-13

### Added

- The `no-fluff` skill writes or rewrites text to a clear-writing standard based on ASD-STE100 Simplified Technical English. Run it as `/fishman:no-fluff [text or file]`. Give it a file path to rewrite that file, or a description to write new text. Claude also loads it when you ask for plain, simple or clear language.
- The `come-again` skill tells Claude to explain its last answer again in `no-fluff` style. Claude first gives 2–3 sentences of context, then the answer. Run it as `/fishman:come-again [part]` to explain only one part. Claude loads it only when you run the command.

[unreleased]: https://github.com/idanfishman/skills/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/idanfishman/skills/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/idanfishman/skills/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/idanfishman/skills/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/idanfishman/skills/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/idanfishman/skills/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/idanfishman/skills/releases/tag/v1.0.0
