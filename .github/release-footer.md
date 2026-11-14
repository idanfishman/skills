### Install

```sh
claude plugin marketplace add idanfishman/skills
claude plugin install fishman@fishman
```

Turn on `fishman-sdlc` and `fishman-typescript` per repository, because their hooks act in every session where they are on. Run this in the repository:

```sh
claude plugin install fishman-sdlc --marketplace idanfishman/skills --scope project
claude plugin install fishman-typescript --marketplace idanfishman/skills --scope project
```

Each plugin's README has the full setup: [`fishman-sdlc`](https://github.com/idanfishman/skills/tree/main/plugins/fishman-sdlc) and [`fishman-typescript`](https://github.com/idanfishman/skills/tree/main/plugins/fishman-typescript).

If you already have the marketplace, run `claude plugin marketplace update fishman` to get this version.

All changes are in [CHANGELOG.md](https://github.com/idanfishman/skills/blob/main/CHANGELOG.md).
