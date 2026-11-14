# fishman-typescript

A TypeScript style guide for Claude Code. The [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) is the standard, and [Ultracite](https://www.ultracite.ai/) on Biome enforces it. The house departs from Google only where the toolchain forces it, or where the lint gate holds what Google only prefers.

- [`skills/styleguide/SKILL.md`](skills/styleguide/SKILL.md) holds the rulings and the rules models still miss. A hook loads it at session start in a repository with a `tsconfig.json`.
- [`skills/styleguide/STYLEGUIDE.md`](skills/styleguide/STYLEGUIDE.md) holds every rule, with its id, its source and the tool that holds it. A reviewer reports only the rules that no tool holds.
- [`skills/styleguide/biome.jsonc`](skills/styleguide/biome.jsonc) is the Biome configuration. It extends Ultracite and changes the settings where Ultracite's defaults differ from Google.

The guide assumes that `tsconfig` sets `strict`, `erasableSyntaxOnly`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Framework and library rules, such as for React, are not in this plugin. Keep them in a skill in the repository that uses them.

## Set up a repository

1. Turn on the plugin for the repository:

   ```sh
   claude plugin install fishman-typescript --marketplace idanfishman/skills --scope project
   ```

2. For a team, put the marketplace in the repository's `.claude/settings.json` too, so each clone gets it. Pin `ref` to a release tag:

   ```json
   {
     "extraKnownMarketplaces": {
       "fishman": { "source": { "source": "github", "repo": "idanfishman/skills", "ref": "v1.2.0" } }
     },
     "enabledPlugins": { "fishman-typescript@fishman": true }
   }
   ```

3. Copy [`biome.jsonc`](skills/styleguide/biome.jsonc) to the repository root. Add the repository's own Ultracite presets, such as `ultracite/biome/react`, to `extends`. If a router reads a default export from its route files, add the route folder to the default-export override.
4. To have the reviewer from `fishman-sdlc` check style, add a pass to `REVIEW.md` that loads `fishman-typescript:styleguide` and checks the rules in its `STYLEGUIDE.md`.
