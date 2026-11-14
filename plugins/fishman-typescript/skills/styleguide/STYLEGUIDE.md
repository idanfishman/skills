# TypeScript style guide: every rule

The single source for the TypeScript style guide skill. The [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) is the standard. The linter enforces it. The house rulings settle only where the toolchain forces a departure from Google, or where a gate holds what Google only prefers. An id is `source#rule`:

- `google`: a rule of the Google TypeScript Style Guide
- `house`: a ruling below, or a rule that a `tsconfig` flag adds

*Class* says how the rule is enforced: `lint` (a tool fails or rewrites it), `judgment` (no tool holds it), or `judgment + lint` (a tool holds part of it). *Held by* names the tool: a Biome rule from Ultracite's preset with the overrides in `biome.jsonc` beside this file, or `tsc` with the flags in the repository's `tsconfig`. A reviewer reports only `judgment` rules and the judgment part of `judgment + lint` rules. The gate reports the rest.

## Rulings: where the house departs from Google

A ruling has one of two reasons: the toolchain forces it, or a gate holds what Google only prefers or allows. A tool's default setting is not a reason. Where Ultracite's default differs from Google and no reason applies, `biome.jsonc` changes the setting to follow Google.

A ruling takes the place of the Google rule that its *Why* column names. That rule has no row of its own.

| Id | Ruling | Why |
|---|---|---|
| `house#erasable-syntax` | No `enum` and no constructor parameter property. Use a union of string literals, or an `as const` object when the values are needed at runtime. Declare a field and assign it in the constructor. | Toolchain. Node runs `.ts` files by stripping types, so `tsconfig` sets `erasableSyntaxOnly`, and these two features are not erasable. This overrules `google#enums` and `google#parameter-properties`. Biome's `noEnum` and `noParameterProperties` hold it. |
| `house#kebab-case-files` | File names are kebab-case. A router's route files keep the router's naming. | Toolchain. The shadcn/ui CLI writes kebab-case files into the repository, and snake_case would mean renaming each one. This overrules Google's snake_case file names (`google#identifiers-imports`). Biome's `useFilenamingConvention` holds it. Ultracite's router presets exempt route folders. |
| `house#tool-default-exports` | Named exports only. A default export only where a tool loads one, such as a Vite, Vitest or Drizzle config, or a route file for a router that loads a default export. | Toolchain. These tools read the default export. This overrules `google#no-default-exports`. Biome's `noDefaultExport` holds it, and `biome.jsonc` exempts config files. A repository adds its router's route folder to that exemption. |
| `house#strict-gate` | The gate bans five things that Google allows or only discourages: `forEach` (use `for...of`), the `!` non-null assertion (narrow with a check that throws or returns), a nested ternary, the `delete` operator, and `await` inside a loop. `++` and `--` stand only in a `for` loop's update. If the code needs one of these, write `// biome-ignore lint/<group>/<rule>: <reason>`. | A gate can only fail, so it holds the stricter form, and Google's allowance becomes a suppression with a reason. Google prefers `for...of` (`google#iterating-containers`) and allows `!` with an obvious reason (`google#type-and-non-nullability-assertions`). Biome's `noForEach`, `noNonNullAssertion`, `noNestedTernary`, `noDelete`, `noAwaitInLoops` and `noIncrementDecrement` hold it. `biome.jsonc` allows `++` in a `for` loop's update, as Google's own examples use it. |

## Formatting

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#formatter` | The formatter decides layout: indentation, line breaks, the 80-column width and semicolons. Don't hand-format. | lint | Biome formatter |
| `google#single-quotes` | Strings use single quotes. A string that holds a single quote may use double quotes. A template literal only where it interpolates or spans lines. JSX attributes use double quotes. | lint | Biome formatter with `quoteStyle: "single"` in `biome.jsonc` |

## Source files and modules

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#ascii-identifiers` | Identifiers use ASCII letters, digits and underscores only. Non-ASCII text, such as Hebrew, lives in strings and translation files. | judgment | |
| `google#es-modules` | ES module syntax only. No `require` and no `import x = require()`. | judgment + lint | `tsc` with `verbatimModuleSyntax` rejects `import x = require()` |
| `google#relative-imports` | Files in the same package import each other by relative path. Avoid long `../../../` chains. | judgment | |
| `google#named-imports` | Named imports for symbols a file uses often. A namespace import (`import * as z`) for a large API. | judgment | |
| `google#no-mutable-exports` | No `export let`. Export a getter function if a binding must change. | judgment | |
| `google#export-visibility` | Export only what other modules use. | judgment + lint | Knip |
| `google#no-container-classes` | No class of static members used as a namespace. Export the functions and constants. | judgment + lint | `noStaticOnlyClass` |
| `google#import-type` | `import type` and `export type` for symbols used only as types. | lint | `useImportType`, `useExportType` |
| `google#no-import-type-expression` | No `import()` inside a type annotation. Use `import type`. | judgment | |

## Variables, arrays and objects

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#const-let` | `const` by default, `let` only when reassigned, never `var`. | lint | `useConst`, `noVar` |
| `google#one-variable-per-declaration` | One variable per declaration. | judgment | |
| `google#no-array-constructor` | No `Array()` constructor. Use `[]` or `Array.from`. | lint | `useArrayLiterals` |
| `google#no-array-properties` | No non-numeric properties on an array. Use a `Map` or an object. | judgment | |
| `google#no-object-constructor` | No `Object()` constructor. Use a literal. | judgment | |
| `google#for-in` | No unfiltered `for...in`. Use `for...of` over `Object.keys`, `values` or `entries`. | lint | `useGuardForIn` |
| `google#spread-plain-objects` | Spread only plain objects, not class instances or functions. | judgment | |
| `google#simple-destructuring` | Parameter destructuring is one level deep, with defaults on the left: `{ name = "" } = {}`. | judgment | |
| `google#map-over-index-signature` | Prefer `Map` and `Set` to an object used as a dictionary. An index signature names its key: `[guestId: string]: T`. | judgment | |

## Classes

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#no-private-fields` | No `#private` fields. Use the `private` modifier. | judgment | |
| `google#readonly` | A property never reassigned after the constructor is `readonly`. | lint | `useReadonlyClassProperties` |
| `google#no-public-modifier` | No `public` modifier. Members are public by default. | lint | `useConsistentMemberAccessibility` |
| `google#field-initializers` | Initialize a field where it is declared when it doesn't need a constructor parameter. | judgment | |
| `google#no-constructor-only-members` | A value used only in the constructor is a local variable, not a member. | judgment | |
| `google#pure-getters` | A getter has no side effects. No pass-through accessor that only hides a field. | judgment | |
| `google#no-static-this` | No `this` in a static context. | lint | `noThisInStatic` |
| `google#prefer-module-functions` | A module-local function over a private static method. | judgment | |
| `google#no-prototype` | No direct use of `prototype`, no mixins, no change to built-in objects. | judgment | |
| `google#no-new-decorators` | Use only the decorators a framework defines. Define none. | judgment | |

## Functions

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#function-declarations` | A named top-level function is a function declaration, not an arrow function in a `const`. React components too. | judgment | |
| `google#no-function-expressions` | No function expressions. Use an arrow function. Generators are exempt. | lint | `useArrowFunction` |
| `google#concise-body` | An arrow function has a concise body only when its value is used. | judgment + lint | `useConsistentArrowReturn` |
| `google#wrap-callbacks` | Pass an arrow function that forwards its arguments, not a named function, to a higher-order function: `ids.map((id) => load(id))`. | judgment | |
| `google#no-arrow-properties` | A class has no properties set to arrow functions, unless the handler must be removed later. | judgment | |
| `google#rest-spread` | Rest parameters, not `arguments`. Spread, not `apply`. | lint | `noArguments`, `useSpreadOverApply` |
| `google#simple-default-params` | A default parameter has no side effects. More than a few optional parameters become one destructured options object. | judgment | |
| `google#small-functions` | Keep a function small and focused. Past about 40 lines, see if it splits well. | judgment + lint | `noExcessiveCognitiveComplexity` |

## Strings, numbers and coercion

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#template-literals` | Template literals over string concatenation. | lint | `useTemplate` |
| `google#no-line-continuations` | No backslash line continuation in a string. | lint | `noMultilineString` |
| `google#number-parsing` | Parse numbers with `Number()` and handle `NaN`. No unary `+` or `parseFloat`. `parseInt` only with a radix. | judgment + lint | `useParseIntRadix`, `useNumberNamespace` |
| `google#no-wrapper-objects` | No `new String`, `new Number` or `new Boolean`, and no `String`, `Number`, `Boolean` or `Object` as types. | lint | `useConsistentBuiltinInstantiation`, `noBannedTypes` |
| `google#explicit-enum-compare` | Compare a literal-union value explicitly. Don't coerce it to a boolean. | judgment | |

## Control flow and errors

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#braces` | Every control-flow body has braces. | lint | `useBlockStatements` |
| `google#no-assignment-in-condition` | No assignment inside a condition. | lint | `noAssignInExpressions` |
| `google#switch-default` | A `switch` has a `default` group, last. No fall-through from a non-empty case. | lint | `useDefaultSwitchClause`, `noFallthroughSwitchClause` |
| `google#triple-equals` | `===` and `!==`. `== null` may cover both `null` and `undefined`. | lint | `noDoubleEquals` |
| `google#throw-errors` | Throw only `Error` objects, made with `new`. This includes `Promise.reject`. | lint | `useThrowOnlyError`, `useThrowNewError` |
| `google#error-cause` | When rethrowing, pass the caught error as `cause`. | lint | `useErrorCause` |
| `google#catch-assumes-error` | A `catch` assumes it caught an `Error`. Don't defend against non-`Error` values unless the API throws them. | judgment | |
| `google#empty-catch` | An empty `catch` has a comment that says why. | lint | `noEmptyBlockStatements` |
| `google#focused-try` | A `try` block holds only the code that can throw. | judgment | |
| `google#exceptions-over-error-objects` | Throw for an exceptional case. Don't return an error object. | judgment | |
| `google#no-disallowed-features` | No `debugger`, `with`, `eval` or `new Function(string)`. No change to a built-in prototype. | lint | `noDebugger`, `noWith`, `noGlobalEval` |

## Naming

Biome's `useNamingConvention` is off in Ultracite, so naming is judgment.

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#casing` | `UpperCamelCase` for classes, interfaces, types, type parameters and components. `lowerCamelCase` for variables, parameters, functions, methods and properties. | judgment | |
| `google#constants` | `CONSTANT_CASE` only for module-level values that never change. A value made more than once, such as a local, is `lowerCamelCase`. | judgment + lint | `noShoutyConstants` |
| `google#acronyms` | An acronym is one word: `loadHttpUrl`, `guestId`, not `loadHTTPURL`. | judgment | |
| `google#descriptive-names` | Names are clear to a new reader. No ambiguous abbreviation. A short name only in a scope of 10 lines or fewer. | judgment | |
| `google#no-type-in-name` | No type in a name: no `I` prefix on an interface, no `_` prefix or suffix for private members. | judgment | |
| `google#unused-underscore` | A leading `_` marks a parameter that must exist but is unused. Leave out a trailing unused parameter. | judgment + lint | `noUnusedFunctionParameters` |

## Types

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#infer-trivial-types` | Leave out a type that is obvious from a literal. Annotate a complex expression when it helps the reader. | judgment + lint | `noInferrableTypes` |
| `google#interfaces` | An object type is an `interface`, not a type alias of an object literal. A `z.infer` alias is fine. | lint | `useConsistentTypeDefinitions` |
| `google#no-nullable-aliases` | A type alias doesn't include `\| null` or `\| undefined`. Add it where the alias is used. | judgment | |
| `google#structural-types` | Declare the type where a value is made: `const guest: Guest = { ... }`, not `{ ... } as Guest`. | judgment | |
| `google#simplest-type` | Use the simplest type that works. Prefer an interface that extends another to a deep mapped or conditional type. | judgment | |
| `google#array-type` | `T[]` and `readonly T[]` for a simple element type. `Array<T>` and `ReadonlyArray<T>` for anything more complex, such as a union or an object type. | judgment | `biome.jsonc` turns off `useConsistentArrayType`, which holds only one form |
| `google#no-any` | No `any`. Use a specific type or `unknown` and narrow it. | lint | `noExplicitAny`, `noEvolvingTypes` |
| `google#no-empty-object-type` | No `{}` type. Use `unknown`, `object` or `Record<string, T>`. | lint | `noBannedTypes` |
| `google#assertions` | No type assertion without a reason the reader can see. Use `as`, never `<T>x`. Double assertions go through `unknown`. The `!` assertion falls under `house#strict-gate`. | judgment | |
| `google#no-return-only-generics` | No API whose generic type appears only in its return type. | judgment | |
| `google#no-ts-ignore` | No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`. Fix the type error, or narrow with a check. | judgment + lint | `noTsIgnore` holds `@ts-ignore` |
| `house#exact-optional` | An optional property doesn't take `undefined`. Leave the key out, or add it with a conditional spread. | lint | `tsc` with `exactOptionalPropertyTypes` |
| `house#checked-index` | Narrow an indexed read before use. `list[0]` can be `undefined`. | lint | `tsc` with `noUncheckedIndexedAccess` |

## Comments

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#jsdoc-vs-line` | `/** JSDoc */` for what a user of the code reads. `//` for notes on how the code works. | judgment | |
| `google#line-comments` | A multi-line note is several `//` lines, not `/* */`. No boxes. | judgment | |
| `google#document-exports` | JSDoc on exported symbols whose purpose the name and type don't show. Don't restate the name. | judgment | |
| `google#no-jsdoc-types` | No types in JSDoc: no `{string}` in `@param`, no `@private` or `@override`. | judgment | |
| `google#deprecated` | Mark a deprecated symbol `@deprecated`, with how to fix its callers. | judgment | |

## Consistency

| Id | Rule | Class | Held by |
|---|---|---|---|
| `google#consistency` | Where this guide is silent, follow the file, then the directory. Nearby code that breaks a rule is never a pattern for new code. | judgment | |
| `google#focused-reformat` | Don't mix large style fixes into a change about something else. | judgment | |
