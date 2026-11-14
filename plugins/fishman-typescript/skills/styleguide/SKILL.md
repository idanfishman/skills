---
name: styleguide
description: Use any time TypeScript or TSX is written, edited or reviewed. A repository with a tsconfig.json already has it loaded at session start.
---

# TypeScript style

Write and review TypeScript by the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). Ultracite on Biome enforces it, with the overrides in `${CLAUDE_SKILL_DIR}/biome.jsonc`, and the repository's fix command rewrites what it can. Every rule, with its id and the tool that holds it, is in `${CLAUDE_SKILL_DIR}/STYLEGUIDE.md`. Read it before you review TypeScript.

Where the house departs from Google:

- **Erasable syntax only.** Node runs `.ts` files by stripping types, so `tsconfig` sets `erasableSyntaxOnly`. So there is no `enum` and no constructor parameter property, though Google asks for both. Use a union of string literals, or an `as const` object when the values are needed at runtime.
- **File names are kebab-case,** as the shadcn/ui CLI writes them. Google uses snake_case. A router's route files keep the router's naming.
- **Default exports** only where a tool reads one, such as a config file or a router's route file. Google bans them.
- **The gate is stricter than Google.** Biome bans `forEach`, the `!` assertion, nested ternaries, `delete`, `await` in a loop, and `++` outside a `for` loop's update. Google allows or only discourages these. If the code needs one, write `// biome-ignore lint/<group>/<rule>: <reason>`.

Rules models still miss:

- `exactOptionalPropertyTypes` is on. An optional property `foo?: string` does not accept `undefined`. Leave the key out, or add it with a conditional spread.
- `noUncheckedIndexedAccess` is on. `list[0]` and `record[key]` can be `undefined`, so narrow them before use.
- No tool holds the array type form. Use `T[]` for a simple element type and `Array<T>` for a complex one, such as a union.
- Nearby code that breaks a rule is never a pattern for new code.

TypeScript work isn't done until the repository's gate passes, run the way `CLAUDE.md` says.
