# 🤖 CLAUDE.md

Conventions for any future Claude (or human) session working in this repo. Read
top to bottom before editing.

## 📖 Table of Contents

- [📖 Table of Contents](#-table-of-contents)
- [🎯 Purpose of this repo](#-purpose-of-this-repo)
- [🧰 Tech stack](#-tech-stack)
- [🗂️ Project layout](#️-project-layout)
- [🧩 Architecture](#-architecture)
- [🧱 Comment intermediate representation \& transforms](#-comment-intermediate-representation--transforms)
- [📦 Bundling \& module format](#-bundling--module-format)
- [🎨 Code style guidelines](#-code-style-guidelines)
  - [🏛️ Architecture \& design mindset](#️-architecture--design-mindset)
  - [💬 Comments — this repo has to practice what it ships](#-comments--this-repo-has-to-practice-what-it-ships)
  - [🗂️ Config files](#️-config-files)
- [🗣️ Prose \& communication](#️-prose--communication)
- [✍️ Commit conventions](#️-commit-conventions)
  - [🌿 Branch naming](#-branch-naming)
  - [🏷️ Issues \& PRs](#️-issues--prs)
- [🏷️ Versioning \& changelog](#️-versioning--changelog)
- [🧪 Pre-commit checks](#-pre-commit-checks)
  - [🕒 7-day dependency moratorium](#-7-day-dependency-moratorium)
- [🧪 Testing (Vitest)](#-testing-vitest)
- [🪵 Logging](#-logging)
- [🚀 Publishing](#-publishing)

## 🎯 Purpose of this repo

**Commentsmith** reshapes block, line, and JSDoc comments to a style you define
— shipped as a **VS Code extension** and a **standalone CLI** over one shared
core, and published to the VS Code Marketplace and Open VSX.

The flagship transform turns a wall of prose into a lead sentence followed by
one `-` bullet per sentence, blank-line separated and rewrapped to 80 columns.
The incumbent,
[Rewrap](https://marketplace.visualstudio.com/items?itemName=stkb.rewrap), has
had no stable release since early 2022 and only ever wrapped — it never
attempted restructuring or reframing. That gap is the wedge.

## 🧰 Tech stack

- Node `>=26` (system node — no `nvm` / `.nvmrc`).
- TypeScript 6 (strict, `@tsconfig/node-lts` base, `module: ESNext` /
  `moduleResolution: bundler`, `--noEmit`).
- `pnpm` — `packageManager` field pinned; `save-exact=true`, so **no caret
  ranges ever enter `package.json`**.
- esbuild — bundles both entry points; owns emit, since tsc is typecheck-only.
- Vitest + `@vitest/coverage-v8` — one Node project, no browser tier.
- ESLint v10 (flat config, written in TypeScript via `jiti`) +
  `typescript-eslint` (type-aware) + `eslint-plugin-perfectionist` +
  `eslint-plugin-import-x`.
- Prettier with all defaults — never override — plus `prettier-plugin-sh` for
  the extensionless git hooks.
- **No runtime dependencies.** The extension and CLI bundles carry only our own
  code; logging, sentence segmentation (`Intl.Segmenter`), and everything else
  come from the platform.

## 🗂️ Project layout

```text
commentsmith/
├── src/
│   ├── core/                 # Pure formatter — MUST NOT import "vscode"
│   │   ├── comment/          # The comment vocabulary: parse → CommentDoc
│   │   │                     # → render
│   │   └── logger.ts         # Logger port: moduleLogger() + sink + no-op default
│   ├── extension/            # VS Code adapter
│   │   ├── main.ts           # activate()/deactivate() — esbuild entry point
│   │   └── logger.ts         # LogOutputChannel sink
│   └── cli/                  # Command-line adapter
│       ├── main.ts           # Entry point (shebang via esbuild banner)
│       ├── args.ts           # Flag parsing — testable, unlike main.ts
│       └── logger.ts         # stderr sink
├── test/                     # Cross-cutting support (#test/*) — per-module
│   │                         # *.test.ts live beside their own source
│   ├── fixtures/             # Golden comment corpus for the round-trip test
│   └── helpers/              # Factories and fixture loaders
├── scripts/                  # CI helper scripts (coverage PR comment)
├── assets/                   # Marketplace icon
├── .githooks/                # pre-commit (fix staged) + pre-push (typecheck)
├── esbuild.config.ts
└── dist/                     # extension.cjs + cli.cjs (gitignored)
```

## 🧩 Architecture

Three modules, one direction of dependency: **adapters depend on core; core
depends on nothing.**

- **`src/core/` must never import `vscode`.** That is the load-bearing rule of
  the whole repo. It is what keeps the formatter unit-testable under plain
  Vitest with no extension host, and what lets the CLI and the extension share
  behavior byte for byte. Anything that needs the editor API belongs in
  `src/extension/`.
- **The extension calls core in-process** — it does _not_ shell out to the CLI.
  A subprocess would pay ~100–300ms of Node startup on every keypress and turn a
  typed error into a stderr-parsing exercise.
- **The CLI is a peer adapter, not a dependency of the extension.** Neither
  invokes the other; both are thin wrappers over the same core, so behavior
  cannot drift.
- The CLI's `--stdin-filepath` + `--range <start>-<end>` mode is deliberately
  the protocol an editor selection would need, so routing the keybinding through
  the CLI stays possible later without redesign.

## 🧱 Comment intermediate representation & transforms

> 🚧 The intermediate representation shipped in
> [#2](https://github.com/jjloneman/commentsmith/issues/2); the registry and
> presets land in [#3](https://github.com/jjloneman/commentsmith/issues/3), and
> the transforms in #4–#7. The forward-looking half of this section records
> intent so it isn't relitigated.

The pipeline is **parse → intermediate representation → ordered transforms →
render**, the model Prettier, Remark, and ESLint all use. It is deliberately
**not** a template language: a template describes layout given known slots, but
"split this paragraph into one bullet per sentence" is restructuring, and a
template language expressive enough for it would be a programming language.

The intermediate representation has **two independent layers**, and keeping them
separate is what makes "convert to JSDoc **and** bulletize **and** rewrap" a
composition rather than three fighting special cases. `src/core/comment/` splits
along the same seam:

```text
src/core/comment/
├── types.ts     # CommentDoc, CommentFrame, the Block union — the vocabulary
├── frame.ts     # parseFrame / renderFramedLines — delimiters, never blocks
├── body.ts      # block segmentation and render dispatch — blocks, never
│                # delimiters
├── list.ts      # bullet and ordered items, and their hanging indents
├── table.ts     # pipe tables and canonical column padding
├── parse.ts     # parseComment — the public entry
├── render.ts    # renderComment — the public exit
├── errors.ts    # CommentParseError
└── safety.ts    # containsBlockTerminator
```

- **Frame** — `{ close, indent, isSingleLine, kind, linePrefix, open }`. Owns
  `//` ↔ `/* */` ↔ `/** */` conversion and the leading `*` column.
  - **The strings are stored exactly as they appear after the indent**, so
    rendering is concatenation rather than derivation — `linePrefix` is `" * "`,
    not `"*"`, and the closer carries its own alignment space. That is what lets
    the round trip hold with no normalization pass in the middle.
  - **`kind` is not redundant with the delimiters.** It answers the semantic
    question — is this a docblock? — leaving room for a triple-slash doc stack
    to be `kind: "doc"` carrying a line comment's delimiters. The parser cannot
    make that call yet: `///` is SassDoc, rustdoc, or C# XML doc depending on
    the language, but a compiler directive in TypeScript, so every slash run
    reports as `kind: "line"` until the frame knows the language.
  - **`isSingleLine` is honored asymmetrically.** The renderer collapses only
    when the body is structurally collapsible (at most one content line) and
    **never collapses unbidden**: declining an impossible request is
    correctness, while collapsing something the frame did not ask to collapse is
    a transform's decision. Without that, a rewrap that grows the body and
    forgets to clear the flag would crush a paragraph and its bullets onto one
    line.
- **Body** —
  `Paragraph | BulletList | OrderedList | CodeFence | TagSection | Table | ThematicBreak`.
  Owns bulletizing, blank-line spacing, hanging indents, rewrapping, and JSDoc
  tags.
  - **List items are flat, each carrying its own `indent`**, not a tree. Nesting
    is representable, and no transform yet needs to walk a hierarchy.
  - **A blank line between JSDoc tags starts a new `TagSection`**, which is why
    a section needs no tight/loose flag of its own.

**`renderComment(parseComment(x)) === x` for any comment already in canonical
form**, proven across `test/fixtures/` by a property test rather than by
examples. Canonical form is a definition, not a vibe:

- The opener sits alone on its line, every body line is
  `indent + linePrefix + content`, and the closer sits alone on its line —
  except a **single-line docblock**, which is canonical too.
- **Exactly one blank line between blocks**, none leading or trailing.
- Table columns are padded to their widest cell, counted in **code points, not
  terminal columns** — a full-width character pads narrower than it displays,
  and fixing that needs an east-asian-width table, which the moratorium makes a
  deliberate dependency decision rather than an incidental one.
- Anything outside canonical form still **parses**; it simply comes back tidied
  rather than byte-identical. That boundary is what leaves the transforms free
  to normalize.

**`containsBlockTerminator` is a predicate, not an escaper.** A body containing
the block terminator cannot be safely reframed into a `/* */` comment — the
result silently changes what the file parses as, which cost this repo a broken
build during scaffolding. A transform that finds it must **refuse and report**,
never escape: escaping changes the text the author wrote, and inside a code
fence it would be flatly wrong.

**Preserving the author's frame is the default, and stays that way.** The frame
is captured from source, never derived, so a stack of line comments stays a
stack, a block stays a block, and a docblock stays a docblock. **Switching
between forms is opt-in only** — an explicitly configured `frame/convert` — and
no built-in preset may reframe comments on its own. Silently turning someone's
`//` stack into a `/* */` block is exactly what makes a formatter untrustworthy;
the feature is "switch the style **when asked**, among the forms the language
actually has".

**The frame layer is C-family only, for now.** `//`, `/* */`, and `/** */` are
hard-coded in `frame.ts`, which covers TS/JS, SCSS, Less, C/C++, C#, Java, Go,
Rust, Swift, and Kotlin — but not `#` (YAML, Python, shell, TOML), `--` (SQL,
Lua), `<!-- -->` (HTML, Markdown), or `;` (INI). Widening it is deliberately a
**frame-only** change: `body.ts`, `list.ts`, and `table.ts` operate on
prefix-stripped content lines and have never seen a delimiter, so bulletizing
and rewrapping work on a YAML comment the moment the frame can read one. The
real design work is not the delimiters but declaring **which forms each language
has** — a `#` stack cannot be converted into a block comment, because YAML has
none — plus generalizing `containsBlockTerminator` past the block terminator to
whatever ends the target syntax.

**Transforms are pure `(CommentDoc, options) => CommentDoc`**, registered by
name and run in configured order. A **preset is a named list of transforms plus
their options**; users compose via `extends` + per-transform overrides, exactly
as in ESLint. The block vocabulary is Markdown-_ish_, not CommonMark-complete —
comments are prose plus a few structures, and a full parser would be a large
dependency for constructs that never appear in a docblock.

**Two invariants belong in every transform's test file** from its first commit:

- **Idempotency** — `f(f(x)) === f(x)`.
- **No word loss** — the sequence of non-whitespace tokens is unchanged.

Together they catch most of what golden fixtures miss.

## 📦 Bundling & module format

- Source is **ESM TypeScript** (`"type": "module"`), but both bundles are
  emitted as **CommonJS** with an explicit `.cjs` extension. The extension host
  loads `main` with `require`, so an ESM bundle would fail to load outright; the
  CLI matches it so a single `format` setting can't drift between the two.
- **`vscode` is `external`** in the extension build. It is injected by the host
  and has no installable implementation — bundling it fails the build, shimming
  it breaks activation.
- **esbuild's `target` tracks the extension host's Node, not the dev machine's**
  — and it is **derived, never guessed**. VS Code 1.103 (the `engines.vscode`
  floor) pins Electron 37.2.3, which bundles Node 22.17.0, so the target is
  `node22`.
  - The chain is machine-checkable from two stable public endpoints: VS Code's
    `.npmrc` at the release tag gives the Electron version, and Electron's
    [release index](https://releases.electronjs.org/releases.json) maps that to
    a Node version.
  - `pnpm check:host-target`
    ([scripts/check-extension-host-target.ts](scripts/check-extension-host-target.ts))
    runs that derivation in CI and fails on drift, so raising `engines.vscode`
    without revisiting the target can't silently ship syntax the oldest
    supported host cannot parse.
  - A **network failure is a warning, not an error** — an upstream outage must
    not fail CI. Only a confirmed mismatch exits non-zero.
  - The constant lives in
    [scripts/lib/extension-host-target.ts](scripts/lib/extension-host-target.ts),
    not in `esbuild.config.ts`, because importing that module runs a build; the
    checker needs to read the value without triggering one.
- The version string is inlined at build time via esbuild `define`
  (`__VERSION__`, declared in [src/globals.d.ts](src/globals.d.ts)) rather than
  read from `package.json` at runtime, which would break once the `.vsix` ships
  only `dist/`.
- `tsc` is `--noEmit` throughout; esbuild owns emit. `pnpm build` runs it,
  `pnpm build -- --watch` rebuilds on change for the <kbd>F5</kbd> loop.

## 🎨 Code style guidelines

### 🏛️ Architecture & design mindset

- **Think holistically, like an architect.** Weigh each change against the whole
  project's structure, not just the file in front of you — where a
  responsibility _should_ live, what a new module's boundaries are, how the
  pieces fit. Optimize for the shape of the codebase, not the local diff.
- **Watch for god files / god functions.** When a file or function starts
  accreting unrelated responsibilities, split it along **domain** (e.g. one
  module per transform) or **phase** (parse → transform → render) boundaries
  instead of piling on. A file that mixes several concerns is a signal to
  restructure.
- **But don't over-architect.** Avoid speculative abstraction, needless
  indirection, and premature generalization — no barrels, factories, or config
  layers a single call site doesn't justify. Add structure when the code demands
  it, not preemptively; the simplest design that keeps concerns separated wins.
- **Semantic naming everywhere.** Files, types, functions, variables, and params
  should say what the thing _is_ or _does_. Favor clarity over brevity; avoid
  vague names (`data`, `tmp`, `handle`, `obj`) except where scope is trivial.
- **Prefer functional over imperative**, and **derive types from existing
  types** — see the specific rules below.

---

- **Strict types**: no `any`. Prefer inferred types where annotation is
  redundant.
- **Avoid `as unknown as T` double assertions.** They erase all type-checking on
  the value, so a typo, a missing key, or a wrong-typed property sails through.
  Prefer `satisfies` — it verifies the value against a shape while keeping its
  literal type. When a full `T` isn't practical to build (e.g. stubbing a VS
  Code API in a test), assert to a **`Partial`** first so every property you
  _do_ supply is still checked:
  `({ … }) satisfies Partial<LogOutputChannel> as LogOutputChannel`. Fall back
  to a bare `as unknown as T` only when genuinely unavoidable.
- **Derive types from existing types** rather than re-spelling a primitive —
  both so a shape change propagates through tsc, and because **a derived type
  carries its source's JSDoc to the call site** while a re-spelled `string`
  carries nothing. A helper taking `{ level, module }` should say
  `Pick<LogEntry, "level" | "module">`, not
  `{ level: LogLevel; module: string }` — the reader then knows exactly where
  those fields come from, and their docs follow. Prefer indexed access + utility
  types over a bare `string`/`number`: `LogEntry["module"]` not `string`,
  `Required<Pick<T, "id">>` to require an optional key. `NonNullable<T>` only
  strips `null`/`undefined` from a **union**; on an object type it's a no-op, so
  reach for `Required<…>` or a `RequiredNonNullable<T>` mapped type
  (`{ [K in keyof T]-?: NonNullable<T[K]> }`) to clean properties that are
  optional **and** nullable.
- **`type` over `interface`** for object shapes — only use `interface` when
  declaration merging is genuinely needed.
- **`import type`** for type-only imports
  (`@typescript-eslint/consistent-type-imports`, `separate-type-imports`).
- **Lexicographic ordering** (enforced by `eslint-plugin-perfectionist`): object
  keys, type members, **union and intersection type members**, imports, named
  imports/exports. `#core/*` and `#test/*` are classified as internal via
  `internalPattern: ["^#"]` so they sort into their own group. The user has been
  bitten by mixed-ordering diffs — keep things alphabetized.
- **Function parameters — 2+ params use a single object** with lexicographically
  sorted keys (one positional arg is fine). Default to objects when in doubt;
  boolean/option params are easier to read named. (The sibling broadway repo
  allows two positional params; this repo takes trivia's stricter rule.)
- **Declare independent bindings in lexicographic order.** When a run of
  `const`s (module constants, local variables) has no dependency between them,
  sort them by name — the same rule `eslint-plugin-perfectionist` already
  enforces on object keys, type members, and imports, applied to declarations it
  cannot see. A binding that _is_ built from another still follows its
  dependency; correctness beats alphabet.
- **Name every capture group you read** — `(?<marker>…)` over `match[1]`. A
  positional index says nothing about what was captured and silently shifts when
  a group is inserted ahead of it. Conversely, a group nothing reads should be
  non-capturing, or dropped: an unused capture is a claim about intent the code
  does not keep.
- **A character class beats an alternation of single characters inside a
  quantifier.** `[\d.]+`, never `(\d+|\.)+` — the second can match the same text
  many ways, so a failing tail backtracks exponentially. Measured here: 0.0ms
  versus **5078ms** on a 27-character string, roughly doubling per added
  character.
- **Parse strictly for any value handed to an external system.** A permissive
  pattern fails _later and quieter_ — `resolveVsCodeFloorTag` feeds a git tag
  into a URL, so a lenient parse yields a plausible-looking tag, a 404, and an
  "upstream is down" warning that passes the build. Strict matching turns the
  same broken input into a loud error at the point of the mistake.
- **Prefer Unicode property escapes where the domain is text, not syntax.**
  `\p{Letter}` over `[A-Za-z]` for anything a human authored — a tag name in a
  French or Japanese codebase is still a tag name. Always spell the **long**
  property name (`\p{Decimal_Number}`, not `\p{Nd}`), and remember `\p{…}` needs
  the `u` (or `v`) flag.
  - **Only where it makes sense.** `\s` is already Unicode-aware, so
    `\p{White_Space}` buys nothing. And a Markdown ordered-list marker really is
    ASCII digits, so `\d` is correct there — `\p{Decimal_Number}` would admit
    markers no renderer treats as a list. Widening a pattern that describes
    _syntax_ is a bug, not an improvement.
- **No single-line `if`s** — always braces (`curly: ["error", "all"]`). Even
  one-statement blocks.
- **Breathing room between statements** (`padding-line-between-statements`): a
  blank line _before_ `if`/`for`/`while`/`switch`/`try`/`return`, and _after_
  those blocks close.
- **Prefer `as const` objects over `enum`s.** Pair with
  `(typeof OBJ)[keyof typeof OBJ]` for the union type.
- **Prefer `??` and `?.`** over `||` and manual `&&` chains when the intent is
  "fall back if null/undefined". Keep `||` only when you specifically want all
  falsy values (`""`, `0`, `false`) to trigger the fallback — and in those cases
  write the comparison explicitly (`port !== "" ? port : "9222"`) rather than
  relying on `||`.
- **Property access**: dot notation when the key is a valid identifier; bracket
  notation only for dynamic / special-character keys
  (`@typescript-eslint/dot-notation`).
- **Array index access**: use `.at()` **only** for the last element —
  `array.at(-1)` over `array[array.length - 1]`. For every other index use plain
  bracket access. When you've established the array is non-empty,
  `array.at(-1)!.x` is acceptable.
- **Strings**: prefer template strings over concatenation. Split across multiple
  template literals joined with `+` only when a single one would exceed
  Prettier's print width; keep the bridging space _inside_ a literal, not
  floating between them.
- **Index, don't switch, when a union already names the members.** `LogLevel` is
  exactly the set of `LogOutputChannel` log methods, so `channel[level](line)`
  replaces a five-arm switch and stays just as type-checked — a new level
  becomes a compile error either way. Reach for a switch only when the arms do
  genuinely different work.
- **Never swallow errors.** No empty or comment-only `catch` blocks — at minimum
  `logger.error({ error }, "what failed")` before any fallback or rethrow.
- **Prettier defaults only** — with exactly **one** deliberate override, and
  only because it is this repo's own subject. Its default `printWidth` of 80 is
  also Commentsmith's default wrap column, so the repo formats its own comments
  to the shape the tool emits.
  - **`proseWrap: "always"`** is the exception. The default `"preserve"` leaves
    Markdown prose at whatever width it was typed, so `format:check` cannot
    catch an 800-column paragraph — and shipping docs that ignore the premise of
    the product would be the wrong look. `"always"` reflows to the same 80
    columns the formatter defaults to.
  - Prettier occasionally leaves a prose line a character or two over 80 rather
    than breaking mid-word. That is its output, and `format:check` is the
    authority — don't hand-fix it.
  - Adding a **second** override needs a reason of that calibre. "It looks
    nicer" isn't one.
- **No `console.*` in `src/`** — it's an ESLint **error**, not a warning. A
  stray `console.log` in the CLI writes to stdout and corrupts piped `--stdin`
  output, which is a correctness bug rather than a style slip. Everything goes
  through the logger port; `--help`/`--version` text is the program's _result_
  and goes to stdout deliberately via `process.stdout.write`. CI helper scripts
  under `scripts/` are exempt — printing to the job log is their whole job.

### 💬 Comments — this repo has to practice what it ships

- **No comments that just describe what the code does.** Only comment _why_ —
  non-obvious constraints, workarounds, hidden invariants. Don't reference
  current tasks/PRs/callers; those rot.
  - **Tests are the deliberate exception** — each test body uses `// Given` /
    `// When` / `// Then` section comments; these "what" comments document the
    scenario's intent.
- **Comment shape: lead sentence, then bullets.** A comment that runs **three
  lines or more** uses the **block form** (`/* … */`, or `/** … */` when it's
  JSDoc). Inside it, the **first sentence is ordinary prose** giving the
  summary; **every subsequent point is a `-` bullet**, with a **blank line
  between bullets** so each reads as its own block. Short one- or two-line
  comments stay a plain `//`.
- **This is the exact transformation Commentsmith exists to automate**, so the
  repo is dogfooding its own output. A comment here that violates the shape is a
  bug report against the tool.
- **JSDoc every exported function** — one-line summary, `@returns`, and
  `@example` where a concrete value clarifies. Document _why_/invariants, not a
  restatement of the code.
  - **Private helpers get JSDoc too**, even if it is one line. "It's not
    exported" is not a reason for the next reader to guess.
  - **Document object parameters on the inline type, not with `@param`.** This
    is not a style preference — it is the difference between working and broken
    IntelliSense. When you start typing an object argument at a call site, VS
    Code surfaces the doc attached to **each property of the type**; a
    `@param pretty - …` tag on the function does **not** propagate there, so the
    hint is invisible exactly when it is needed. Put the prose in a `/** … */`
    above the property inside the inline type literal instead.
  - Keep `@param` only for **positional** parameters, where it does propagate.
  - **Every property of every type gets a doc comment and, where a value
    clarifies, an `@example`** — including properties of inline parameter types.
  - **Blank-line breathing room between JSDoc'd members.** When a type's
    properties each carry their own doc comment, separate them with a blank
    line. Undocumented members can stay tightly packed.

```ts
// ❌ the `@param` docs never reach the call site's IntelliSense
/**
 * @param threshold - the minimum severity to emit.
 */
export const createStderrSink = ({ threshold }: { threshold: LogLevel }) => {};

// ✅ documented on the property — surfaced while typing the argument
export const createStderrSink = ({
  threshold,
}: {
  /**
   * The minimum severity to emit.
   *
   * @example "info"
   */
  threshold: LogLevel;
}) => {};
```

```ts
/**
 * Build a sink that writes to a VS Code `LogOutputChannel`.
 *
 * - No level filtering happens here: the channel applies the level the user
 *   picked via **Developer: Set Log Level…**, so filtering first would silently
 *   override their choice.
 *
 * @param channel - the log channel to write to, owned by the caller.
 * @returns a sink suitable for `setLogSink`.
 */
```

### 🗂️ Config files

- **`package.json` keys are sorted recursively**, every object, top level
  included. Arrays keep their order — it is semantic for `categories`,
  `keywords`, and `contributes.commands`.
- **`.github/dependabot.yml` keys are sorted alphabetically within each
  mapping**, matching the repo-wide lexicographic rule. Its comments follow the
  same lead-sentence-then-bullets shape as code comments.
- **`.vscode/tasks.json` uses `type: "shell"` tasks running `pnpm` directly**,
  not `type: "npm"`. The npm task provider rejects an `args` property and its
  auto-generated `npm: <script>` label misreads as npm rather than pnpm; a shell
  task says exactly what runs.
- **`problemMatcher: []` on the build tasks is deliberate.** VS Code ships no
  `$esbuild` matcher, so naming one is a schema error — and esbuild already
  prints diagnostics with file and line.

## 🗣️ Prose & communication

- **American English everywhere** — prose, code comments, identifiers, commit
  messages, and issue/PR bodies. The repo was inconsistent until #2 swept it;
  one stated rule is cheaper than re-deciding per file.
- **Spell abbreviations out in prose.** "intermediate representation", not "IR"
  — the reader who needs the document most is the one who does not yet know the
  shorthand. Identifiers stay short; the words around them do not.
- **Send files, don't link them, when the user is on mobile.** A markdown link
  to a local file path renders as tappable but fails in the Claude mobile app
  over Remote Control, which reports `Unsupported link` because the phone has no
  access to this machine's filesystem. Attach the file itself when the user
  needs to read something outside the repo; keep links for repo paths a desktop
  session will open.

## ✍️ Commit conventions

[Conventional Commits v1.0.0](https://www.conventionalcommits.org/) with a
gitmoji **after** the colon:

```text
<type>(optional-scope): <gitmoji> <subject>

- <bullet 1>
- <bullet 2>
```

| Type       | Gitmoji | Use for                             |
| ---------- | ------- | ----------------------------------- |
| `build`    | 🔨      | build system / typecheck infra      |
| `chore`    | ✏️ / ⬆️ | housekeeping, dependency bumps      |
| `ci`       | 🤖      | CI / dependabot / workflow changes  |
| `config`   | 🔧      | tooling config (esbuild, eslint, …) |
| `docs`     | 📝      | documentation                       |
| `feat`     | ✨      | new feature                         |
| `fix`      | 🔧      | bug fix                             |
| `perf`     | ⚡      | performance                         |
| `refactor` | 🏗️      | refactor                            |
| `test`     | 🧪      | tests                               |

- Subject is imperative, lowercase, no trailing period.
- **Scope** is the area touched — `core`, `extension`, `cli`, `transforms`,
  `config`, `deps`, `workflow`, `docs`.
- **Dependency bumps**: `chore(deps): ⬆️ bump <package> from X to Y`
  (`chore(deps-dev): ⬆️ …` for dev deps).
- Commit **bodies are `-` bullet points**, not prose paragraphs. Group changes
  into logical commits; don't lump unrelated changes together.
- **Omit the `Co-Authored-By` trailer from individual commits.** Branches are
  squash-merged, so a per-commit trailer produces a run of redundant lines in
  the squashed message. It is added **once**, on the squash commit.

### 🌿 Branch naming

- `feature/`, `bugfix/`, `release/`.
- Tied to an issue: insert `gh-<n>-` after the prefix, then a short kebab-case
  slug — `feature/gh-1-scaffold-toolchain`.

### 🏷️ Issues & PRs

- Emoji-prefixed section headings + bulleted points, not long prose.
- **Strip newlines within a single bullet** — GitHub renders hard wraps inside a
  bullet as line breaks. One line per bullet; newlines only _between_ items.
- The issue title is the commit title (conventional + gitmoji); the PR title
  matches the issue verbatim.
- PR bodies reference the issue (`Closes #<n>` for a feature, `Fixes #<n>` for a
  bug) and summarize what changed and how it was verified.
- Issue/PR bodies and comments written by an AI session **open with a disclaimer
  banner** naming the model.

## 🏷️ Versioning & changelog

The project follows [SemVer](https://semver.org) and is **pre-stable (0.x)** — a
`feat` bumps the **minor**, a `fix` the **patch**. Versions are made real by
`vX.Y.Z` git tags.

Two keys in [release-please-config.json](release-please-config.json) enforce
that and are easy to mistake for noise — **do not remove them**:

- **`initial-version: "0.1.0"`** — release-please defaults a repo's _first_
  release to `1.0.0` when no prior version exists, which would declare a stable
  public API before the formatter exists. This bug is invisible in the sibling
  repo this config was ported from, because that repo already has a released
  version.
- **`bump-minor-pre-major: true`** — below `1.0.0`, a breaking change bumps the
  **minor** instead of promoting to `1.0.0`. Without it the first `feat!` would
  silently declare the project stable.
- **`bump-patch-for-minor-pre-major` is deliberately unset**, so a `feat` keeps
  bumping the minor. The alternative convention (a `feat` bumping the patch)
  exists because npm reads `^0.1.2` as locking the minor — an argument that
  applies to published packages, not to a Marketplace extension nobody writes a
  version range against. Revisit only if the CLI is ever published to npm.

Releases are **fully automated** by
[`release-please`](https://github.com/googleapis/release-please), which reads
the commit conventions — this is why they matter beyond tidiness.
[`CHANGELOG.md`](CHANGELOG.md) is generated, **never hand-edited**; config lives
in [release-please-config.json](release-please-config.json), version state in
[.release-please-manifest.json](.release-please-manifest.json), workflow in
[.github/workflows/release.yml](.github/workflows/release.yml).

- **The flow:** every push to `main` maintains a **single rolling release PR**
  titled `chore(release): 🚀 bump to vX.Y.Z`. Merging it bumps `package.json`,
  finalizes the changelog, and creates the tag + GitHub Release.
  **Squash-merge** it so the PR title becomes the commit message.
- `changelog-sections` decides which types appear and under which
  gitmoji-prefixed section. `chore`/`style` are hidden so dependency bumps and
  formatting churn stay out of the log.
- **The generated `CHANGELOG.md` is what the Marketplace renders as the
  extension's Changelog tab**, verbatim. Sloppy commit types become a sloppy
  public changelog.
- It runs as a **GitHub Action, not an npm dep** — nothing enters the lockfile,
  so the moratorium doesn't apply to it.
- **No manual release step.** Don't hand-run a bump or `git tag`; manually
  retagging desyncs the manifest.

## 🧪 Pre-commit checks

Git hooks live in [.githooks/](.githooks/) and are activated by the `prepare`
script (`git config core.hooksPath .githooks`), which runs on every
`pnpm install` — a fresh clone gets them for free after the first install. They
are intentionally fast and split by stage:

- **[.githooks/pre-commit](.githooks/pre-commit)** — auto-fixes and reformats
  **only the staged files**: `eslint --fix` then
  `prettier --ignore-unknown --write`. Each tool self-filters from its own
  config, so the hook can't drift from `pnpm lint` / `pnpm format`. It snapshots
  each file's blob hash before running and **re-stages only files a tool
  actually rewrote**, so unstaged hunks in untouched files are never swept in. A
  non-fixable lint error aborts the commit.
- **[.githooks/pre-push](.githooks/pre-push)** — whole-project `pnpm typecheck`.
  Single-file typechecking is unsound (a shared-type edit breaks dependents a
  per-file check never revisits), so it runs once per push, not per commit.

`pnpm build` is deliberately left to CI. The convenience scripts back the same
tools: `pnpm format` / `pnpm format:check`, and **`pnpm check`** (`lint:fix` +
`format` + `typecheck` + `check:host-target`) for a manual pre-push sweep —
prefer that single gate over running each individually.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck,
format:check, tests, and build on every PR and `main` push — the source of
truth. Coverage runs on PRs only, feeding a **report-only** sticky PR comment
([scripts/post-coverage-pr-comment.ts](scripts/post-coverage-pr-comment.ts));
there is no `%` threshold and it never gates the build. Don't bypass hooks
(`--no-verify`) without explicit user approval.

### 🕒 7-day dependency moratorium

No npm dependency may enter the lockfile until it has been published for **7
days**. This is a supply-chain guard — it gives the registry time to yank a
compromised release before it reaches us. Two settings enforce it and must stay
in sync:

- `minimumReleaseAge: 10080` (minutes) in
  [pnpm-workspace.yaml](pnpm-workspace.yaml) — a hard floor checked on every
  `pnpm install` (including `--frozen-lockfile` in CI). Overrides pnpm's
  built-in 1-day default. A too-new entry fails with
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.
- `cooldown.default-days: 7` in [.github/dependabot.yml](.github/dependabot.yml)
  — keeps Dependabot from proposing a version until it is already old enough.

When manually bumping a dep, pick the newest version already ≥7 days old; if the
lockfile fails the check, downgrade the offending entry rather than relaxing the
floor. To re-resolve while a stale entry blocks the write:
`pnpm install --config.minimumReleaseAge=0`, then verify with a normal
`pnpm install --frozen-lockfile`.

**GitHub Actions are pinned the same way.** Every `uses:` ref is an exact
`vX.Y.Z` tag — never a floating major. Actions does **no** semver resolution:
`uses: foo/bar@v6` resolves the tag _literally named_ `v6`, which maintainers
re-point on each release, making a major ref a mutable pointer. An exact tag
turns every update into a reviewable Dependabot PR. Full-SHA pinning was
considered and rejected — it makes every diff an opaque hash for marginal gain
here.

**Two `ignore` entries are deliberate**, not oversights:

- **`typescript` majors** — 7.0 is the Go port and ships no programmatic
  compiler API, which `typescript-eslint`'s parser requires and which the
  extension's comment discovery also wants. 6.x patch/minor bumps still flow.
- **`@types/vscode` entirely** — it must move in lockstep with the
  `engines.vscode` floor. Bumping the types alone lets code compile against an
  API the minimum supported VS Code lacks.

## 🧪 Testing (Vitest)

- **Runner: [Vitest](https://vitest.dev).** `pnpm test` (= `vitest run`) and
  `pnpm test:watch`. Coverage via `pnpm test:coverage` (`@vitest/coverage-v8`);
  CI runs it on PRs only. It is **not** in the git hooks — those stay fast.
- **Co-locate per-module tests** as a sibling `*.test.ts` next to the file under
  test — not in a `__tests__/` dir. Cross-cutting support lives in top-level
  `test/` and is imported via the **`#test/*`** subpath alias (mirrors
  `#core/*`; declared once in `package.json`, resolved natively by
  tsc/Vitest/ESLint/esbuild).
- **Structure each file** as `describe("<unit/behavior>")` →
  `test("<scenario>")` (use `test`, not the `it` alias; don't mix) → `// Given`
  / `// When` / `// Then` body sections, with `beforeEach`/`afterEach` inside
  the `describe` so setup is suite-scoped.
  - **Use only the phases that carry meaning — don't force all three.** The
    `// When` marks the single action that triggers the asserted outcome; a test
    with no such action is just `// Given` + `// Then`. A **combined** label —
    `// Given/When -`, `// Given/When/Then -` — is fine, and preferred over an
    artificial split, when one line genuinely spans those phases.
  - **Every phase label carries a short bit of context**, not just the bare word
    — `// Given - a machine-readable sink admitting every level`,
    `// When - a record with context is logged`,
    `// Then - the context is flattened alongside the record's own fields`. A
    naked `// Then` makes the reader re-derive the intent from the assertion,
    which is the thing the comment was supposed to save them.
  - **A phase spanning several blocks is split with `// And - …`.** When a
    `// Then` makes one assertion, pulls a value out, and asserts again, each
    block gets its own labeled group with a blank line between — never one dense
    run under a single label.
  - **`// And - …` breaks a phase into groups** when one Given/When/Then covers
    several independent things, one blank line between them.
  - **`// Setup - …` / `// Cleanup - …`** label extra arrange/teardown that
    doesn't belong to a phase.
  - **Vertical breathing room in the body.** Give each distinct step its own
    block separated by a blank line; consecutive **multi-line** `expect(...)`
    statements are separated by a blank line. A run of short single-line
    assertions on the same subject can stay packed.
- **Keep logic out of entry points, because importing one runs it.**
  `src/cli/main.ts` ends in `process.exitCode = main()`, so a test that imports
  it executes the CLI as a side effect — and it also references `__VERSION__`,
  which only exists after esbuild's `define`. Anything worth testing moves to a
  sibling module (`src/cli/args.ts`) that the entry point composes. Entry points
  stay excluded from coverage; the modules they compose do not.
- **Strongly type mocks and spies** — never leave a bare `vi.fn()` or
  `ReturnType<typeof vi.spyOn>`; both resolve to effectively `any` (untyped
  `.mock.calls`, unchecked `toHaveBeenCalledWith`). Type a constructed mock as
  `vi.fn<typeof realFn>()` and a `vi.spyOn(obj, "method")` result as
  `MockInstance<typeof obj.method>`, always deriving the signature from the real
  function. **Name a `vi.spyOn` result `<method>Spy`** so a spy on a real method
  reads distinctly from a standalone `vi.fn()` mock.
  - **Exception:** when surrounding context already supplies the type — inside a
    `vi.mock(import())` factory, or a return annotated `Mocked<T>` — the bare
    `vi.fn()` is _inferred_, not `any`, so the explicit generic is redundant.
- **Fabrication factories: name them `createMock<Thing>`, type object doubles
  with `Mocked<T>`.** `Mocked<T>` maps every method to
  `MockInstance<its signature>` and, via its trailing `& T`, stays assignable to
  `T`, so the double drops straight into code expecting the real type.
- **Always `vi.mock(import("./mod"), …)`, never `vi.mock("./mod", …)`.** The
  string-path overload types the factory's return as `unknown`, so a missing,
  misnamed, or wrong-typed export sails through unchecked. Passing
  `import("./mod")` — a promise Vitest reads statically and never awaits —
  selects the generic overload, which checks the factory return against the
  module's real exports.
- **Assert call counts precisely** — prefer `toHaveBeenCalledTimes(n)` over the
  count-agnostic `toHaveBeenCalled()`. When asserting a **single** call with a
  known argument, collapse the pair into `toHaveBeenCalledExactlyOnceWith(arg)`.
- **Name fabricated fixtures with a `mock` prefix** — `mockEntry`, `mockError` —
  so a reader tells fabricated input from a value under assertion at a glance.
  Real data loaded from `test/fixtures/` is **not** a mock; leave it unprefixed.
  Never hard-code PII into a test.
- **Only `src/extension/main.ts` is excluded from coverage** — the narrowest
  exclusion that works, not the whole directory. It imports `vscode` at runtime,
  a module the host injects and Vitest cannot provide, so it is verified by
  running the Extension Development Host.
  - Its sibling `src/extension/logger.ts` imports `vscode` **type-only**, so the
    import is erased at runtime and the module unit-tests fine against a
    `Mocked<Pick<LogOutputChannel, …>>` double. Before excluding anything for
    "needing VS Code", check whether its `vscode` imports are type-only — most
    of `src/extension/` should stay testable.
  - Keep genuinely-uncoverable code out of the denominator; everything else
    counts. A coverage percentage is only meaningful alongside what was excluded
    to produce it.

## 🪵 Logging

All logging goes through the port in [src/core/logger.ts](src/core/logger.ts) —
**never `console.*`** in `src/` (an ESLint error, see the code style rules).

- **`moduleLogger("<area>")`** returns a logger bound to a `module` field. Each
  src file creates one at the top.
- **Structured first:** context as the first-arg object, message as the second
  string — `logger.info({ range }, "formatted comment")`, not interpolated into
  the message.
- **Errors: pass the raw throwable under `error` (or `err`)** —
  `logger.error({ error }, "what failed")`. `serializeLogContext` unwraps it to
  `{ message, stack, type }`, mirroring pino's `stdSerializers.err`. This is why
  there are **no `error instanceof Error ? … : String(…)` ternaries** at call
  sites; don't reintroduce them. A non-`Error` throwable is left alone rather
  than coerced, so the log shows what was actually thrown.
- **The sink is injected, and the default is a no-op.** That is what lets pure
  core code log freely without a live sink in unit tests, and without importing
  `vscode`.
- **Two sinks, because no single backend covers both consumers:**
  - **Extension → `LogOutputChannel`**
    ([src/extension/logger.ts](src/extension/logger.ts)). Its own Output-pane
    entry, and a user-settable level via **Developer: Set Log Level…**. The sink
    does **no** level filtering — the channel applies the user's choice, and
    filtering first would silently override it.
  - **CLI → stderr** ([src/cli/logger.ts](src/cli/logger.ts)). Human-readable
    when stderr is a TTY, NDJSON when it isn't, level from `--log-level`.
    **Never stdout**, which carries the formatted document in `--stdin-filepath`
    mode.
- **pino was deliberately not used**, unlike the sibling repos. Its core runs
  fine in the extension host, but `pino-pretty` and file transports go through
  `thread-stream` worker threads that need a real worker file on disk, which
  fights esbuild's single-file bundle — and an extension maintaining its own
  rotating `logs/` directory duplicates storage, retention, and level control VS
  Code already owns. The call shape is identical; only the backend differs.

## 🚀 Publishing

> 🚧 The pipeline itself lands in
> [#10](https://github.com/jjloneman/commentsmith/issues/10); the metadata it
> needs is already in `package.json`.

- **Targets are the VS Code Marketplace _and_ [Open VSX](https://open-vsx.org)**
  — the latter is what Cursor, VSCodium, and Windsurf install from. Cheap to do
  from the first release, awkward to retrofit.
- **`engines.vscode` is a product decision, not a formality.** Too new shrinks
  the addressable install base; too old and a needed API isn't there. It is
  pinned at `^1.103.0`, with `@types/vscode` held at exactly that version so
  code cannot compile against a newer API.
- **Activation stays lazy.** `activationEvents` is empty and VS Code derives
  activation from `contributes.commands`. Never use `*`.
- **No telemetry.** The extension collects nothing.
- **The README is the Marketplace page** — an animated GIF of the transform is
  the highest-leverage asset on it, and images need absolute URLs.
- **The repo is public and the Marketplace PAT lives only in GitHub Actions
  secrets.** Nothing secret enters the tree.
