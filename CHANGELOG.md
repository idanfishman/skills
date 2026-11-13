# Changelog

All notable changes to the `fishman` plugin are in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the plugin uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-13

### Added

- The `no-fluff` skill writes or rewrites text to a clear-writing standard based on ASD-STE100 Simplified Technical English. Run it as `/fishman:no-fluff [text or file]`. Give it a file path to rewrite that file, or a description to write new text. Claude also loads it when you ask for plain, simple or clear language.
- The `come-again` skill tells Claude to explain its last answer again in `no-fluff` style. Claude first gives 2–3 sentences of context, then the answer. Run it as `/fishman:come-again [part]` to explain only one part. Claude loads it only when you run the command.

[unreleased]: https://github.com/idanfishman/skills/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/idanfishman/skills/releases/tag/v1.0.0
