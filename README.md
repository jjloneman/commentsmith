<div align="center">

<img src="https://raw.githubusercontent.com/jjloneman/commentsmith/main/assets/icon.png" width="120" alt="Commentsmith icon" />

# 🛠️ Commentsmith

**A configurable comment formatter for VS Code and the command line — reshape
block, line, and JSDoc comments to a style you define.**

[![CI](https://img.shields.io/github/actions/workflow/status/jjloneman/commentsmith/ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI)](https://github.com/jjloneman/commentsmith/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jjloneman/commentsmith?logo=github&label=release&color=blue)](https://github.com/jjloneman/commentsmith/releases)
[![License](https://img.shields.io/github/license/jjloneman/commentsmith?logo=opensourceinitiative&logoColor=white&color=green)](LICENSE)

[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.103-0078D4?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%E2%89%A526-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Prettier](https://img.shields.io/badge/code%20style-prettier-F7B93E?logo=prettier&logoColor=black)](https://prettier.io)

</div>

Most comment tools either wrap text or generate boilerplate. Commentsmith
**restructures**: it can turn a wall of prose into a lead sentence followed by
scannable bullets, convert between comment framings, and rewrap the result — all
from one configurable pipeline shared by the editor extension and the CLI.

## 📖 Table of Contents

- [✨ What it does](#-what-it-does)
- [🧩 Planned transforms](#-planned-transforms)
- [⚙️ How configuration works](#️-how-configuration-works)
- [🚧 Status](#-status)
- [🛠️ Development](#️-development)
  - [📜 Scripts](#-scripts)
- [🏛️ Architecture](#️-architecture)
- [📄 License](#-license)

## ✨ What it does

The flagship transform turns this:

```ts
/**
 * Classify one message by sender and subject alone.
 *
 * Both a sender **and** a subject-shape match are required. The clinic's
 * address also sends marketing, closure notices, and payment links, so the
 * sender by itself carries no signal. Conversely, matching on subject alone
 * would let a forwarded copy trigger the pipeline.
 */
```

into this:

```ts
/**
 * Classify one message by sender and subject alone.
 *
 * - Both a sender **and** a subject-shape match are required.
 *
 * - The clinic's address also sends marketing, closure notices, and payment
 *   links, so the sender by itself carries no signal.
 *
 * - Conversely, matching on subject alone would let a forwarded copy trigger
 *   the pipeline.
 */
```

The first paragraph stays prose. Every paragraph after it becomes one `-` bullet
per sentence, blank-line separated, hang-indented by two spaces, and rewrapped
to your print width.

## 🧩 Planned transforms

| Transform                     | Does                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `body/bulletize-sentences`    | One bullet per sentence, after the lead paragraph        |
| `body/rewrap`                 | Hard-wrap to a target column, respecting block structure |
| `frame/convert`               | `//` ↔ `/* */` ↔ `/** */`                                |
| `frame/asterisk-prefix`       | Add, strip, or realign the leading `*` column            |
| `jsdoc/sort-tags`             | Configurable tag ordering                                |
| `jsdoc/align-tags`            | Column-align tag names, types, and descriptions          |
| `jsdoc/wrap-tag-descriptions` | Wrap long tag descriptions with a hanging indent         |

## ⚙️ How configuration works

Transforms are pure functions run in a configured order, and a **preset** is
just a named list of transforms plus their options. You compose your own style
with `extends` and per-transform overrides, the way you would with ESLint —
there is no bespoke template language to learn.

The same schema drives both consumers: VS Code settings (including per-language
scoping like `"[typescript]"`) and the CLI's config file.

## 🚧 Status

**Early development.** The scaffold, toolchain, and both entry points are in
place; the formatter itself is being built transform by transform. Nothing is
published yet.

Progress is tracked in
[issues](https://github.com/jjloneman/commentsmith/issues) across two milestones
— `v0.1` for a usable extension, `v1.0` for the full transform set, the CLI, and
publication.

## 🛠️ Development

```sh
pnpm install
pnpm check
pnpm test
pnpm build
```

Press <kbd>F5</kbd> to launch an Extension Development Host with the extension
loaded. On a Mac the top row sends hardware controls by default, so that is
<kbd>fn</kbd>+<kbd>F5</kbd> — or run **Debug: Start Debugging** from the command
palette (<kbd>⇧⌘P</kbd>), which needs no function key at all.

In the host window, _Commentsmith: Format Comment_ should appear in the command
palette, and the **Commentsmith** entry in the Output panel should carry the
activation log.

### 📜 Scripts

| Script                   | Does                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `pnpm build`             | Bundle both entry points (`--watch` to rebuild on change)   |
| `pnpm check`             | Lint (fix) + format + typecheck + host-target check         |
| `pnpm check:host-target` | Verify the esbuild target matches the oldest supported host |
| `pnpm test`              | Run the Vitest suite                                        |
| `pnpm test:coverage`     | Run with coverage and write the HTML report                 |

## 🏛️ Architecture

Three modules, one direction of dependency — **adapters depend on core; core
depends on nothing.**

- **`src/core/`** holds the formatter and never imports `vscode`, which keeps it
  unit-testable with no extension host.
- **`src/extension/`** is the VS Code adapter, calling core in-process so a
  keypress costs no subprocess.
- **`src/cli/`** is a peer adapter for pre-commit hooks, CI, and running after
  Prettier.

Neither adapter invokes the other, so their behaviour cannot drift.

Conventions for contributors — and for AI sessions — live in
[CLAUDE.md](CLAUDE.md).

## 📄 License

[MIT](LICENSE)
