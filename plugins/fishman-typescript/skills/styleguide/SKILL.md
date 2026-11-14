---
name: styleguide
description: Use any time TypeScript or TSX is written, edited or reviewed, including React components, Hono routes, Drizzle schemas and tests. Every session in a repository that turns on fishman-typescript already has it loaded at start.
---

# TypeScript style

Write TypeScript by the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). Ultracite on Biome enforces most of it, and the repository's fix command rewrites what it can. Every rule, with its id, source and the tool that holds it, is in `${CLAUDE_SKILL_DIR}/STYLEGUIDE.md`. Read it before you review TypeScript.

Where the repository's tools overrule Google:

- **Erasable syntax only.** `tsconfig` sets `erasableSyntaxOnly`, because Node runs the `.ts` files directly. So there is no `enum`, `namespace` or constructor parameter property, though Google allows enums and parameter properties. Use a union of string literals, or an `as const` object when the values are needed at runtime.
- **Double quotes.** Biome's formatter writes them. Google asks for single quotes.
- **File names are kebab-case**, as Biome checks. Google uses snake_case.
- **No `forEach`.** Use `for...of`. Google allows both, and Biome bans `forEach`.
- **No non-null assertion (`!`).** Narrow with a check that throws or returns. Google allows `!` with a comment, and Biome bans it.
- **`T[]` for every array type,** `(A | B)[]` included. Biome's form wins over Google's `Array<T>` for complex types.

Stack rules, where Google is silent. Each applies where the repository uses that library:

- **React** follows the [Rules of React](https://react.dev/reference/rules). Components and hooks are pure during render: no side effects, no mutation of props, state or values already passed to JSX. Compute derived values during render, not in `useEffect`. Never call a component as a function.
- **Zod is the source of truth for data shapes.** Declare the schema, then `type X = z.infer<typeof X>`. Never write an interface that copies a schema.
- **Types from Drizzle and Hono are inferred.** Row types come from `typeof table.$inferSelect` and `$inferInsert`, or from a Zod schema built from the table. Clients get route types from the Hono app type (`hc<AppType>`), never from hand-written response types.
- **Named exports only,** as Google says. A file may default-export only where a tool requires it, such as a Vite or Vitest config.

Rules models still miss:

- `exactOptionalPropertyTypes` is on. An optional property `foo?: string` does not accept `undefined`. Leave the key out, or add it with a conditional spread.
- `noUncheckedIndexedAccess` is on. `list[0]` and `record[key]` can be `undefined`, so narrow them before use.
- Nearby code that breaks a rule is never a pattern for new code.

TypeScript work isn't done until the repository's gate passes, run the way `CLAUDE.md` says.
