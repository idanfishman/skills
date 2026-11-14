# fishman-typescript

A TypeScript style guide for Claude Code. It follows the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html), with house rulings where Biome and Ultracite overrule Google, and rules for React, Zod, Drizzle and Hono. A rule for a library applies only where the repository uses that library.

- [`skills/styleguide/SKILL.md`](skills/styleguide/SKILL.md) holds the rulings and the rules models still miss. A hook loads it at the start of each session.
- [`skills/styleguide/STYLEGUIDE.md`](skills/styleguide/STYLEGUIDE.md) holds every rule, with its id, its source and the tool that holds it. A reviewer reports only the rules that no tool holds.

The guide assumes the repository lints and formats with [Ultracite](https://www.ultracite.ai/) on Biome, and that `tsconfig` sets `strict`, `erasableSyntaxOnly`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.

## Set up a repository

Turn on the plugin for the repository. It loads the guide into every session, so turn it on only where TypeScript is written:

```sh
claude plugin install fishman-typescript --marketplace idanfishman/skills --scope project
```

For a team, put the marketplace in the repository's `.claude/settings.json` too, so each clone gets it. Pin `ref` to a release tag:

```json
{
  "extraKnownMarketplaces": {
    "fishman": { "source": { "source": "github", "repo": "idanfishman/skills", "ref": "v1.2.0" } }
  },
  "enabledPlugins": { "fishman-typescript@fishman": true }
}
```

To have the reviewer from `fishman-sdlc` check style, add a pass to `REVIEW.md` that loads `fishman-typescript:styleguide` and checks the rules in its `STYLEGUIDE.md`.
