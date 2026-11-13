# Changelog

All notable changes to the `fishman` plugin are in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the plugin uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-11-13

### Added

- The `context-engineering` skill writes and reviews context that Claude reads: `SKILL.md`, `CLAUDE.md`, agent system prompts, tool descriptions, and procedures or docs for agents. It keeps only what changes what Claude does. It puts each part where Claude loads it when needed. It writes the wording to the `no-fluff` standard. Run it as `/fishman:context-engineering [file]`. Give it a file path to review and rewrite that file, with a list of what it cut, moved or changed. Claude also loads it when you create or edit one of these files. The skill is based on the Anthropic post [The new rules of context engineering for Claude 5 generation models](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/).

## [1.0.0] - 2026-11-13

### Added

- The `no-fluff` skill writes or rewrites text to a clear-writing standard based on ASD-STE100 Simplified Technical English. Run it as `/fishman:no-fluff [text or file]`. Give it a file path to rewrite that file, or a description to write new text. Claude also loads it when you ask for plain, simple or clear language.
- The `come-again` skill tells Claude to explain its last answer again in `no-fluff` style. Claude first gives 2–3 sentences of context, then the answer. Run it as `/fishman:come-again [part]` to explain only one part. Claude loads it only when you run the command.

[unreleased]: https://github.com/idanfishman/skills/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/idanfishman/skills/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/idanfishman/skills/releases/tag/v1.0.0
