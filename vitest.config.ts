import { coverageConfigDefaults, defineConfig } from "vitest/config";

/*
 * One Node project — unlike the sibling repos there is no browser tier, since
 * Commentsmith ships no UI of its own.
 *
 * - `pnpm test` runs it; `pnpm test:coverage` adds the aggregated report the CI
 *   PR comment consumes.
 */
export default defineConfig({
  test: {
    coverage: {
      exclude: [
        // Extend Vitest's defaults (test files, `.d.ts`, config, dist, …)
        // rather than replacing them — a bare `exclude` overrides the whole
        // default list.
        ...coverageConfigDefaults.exclude,

        /*
         * Ambient declarations emit no runtime code, so v8 reports them as a
         * permanent 0%.
         *
         * - Vitest's own defaults cover them only outside an explicit
         *   `include`; ours is a recursive TypeScript glob over src, which
         *   sweeps them back in.
         */
        "**/*.d.ts",

        /*
         * Only the activation entry point is unreachable here: it imports
         * `vscode` at runtime, a module the extension host injects and Vitest
         * cannot provide.
         *
         * - Its sibling `logger.ts` imports `vscode` **type-only**, so the
         *   import is erased and the module runs fine under Vitest — it stays
         *   in the denominator and is unit-tested.
         *
         * - This file is verified by running the Extension Development Host,
         *   not by unit tests.
         */
        "src/extension/main.ts",

        // Process entry point — argv parsing is covered through the units it
        // delegates to, not by spawning the binary.
        "src/cli/main.ts",
      ],

      // Scope to code files by extension so v8 never tries to parse a
      // non-source file as JS while remapping uncovered files.
      include: ["src/**/*.ts"],
      provider: "v8",

      /*
       * `text` is listed twice on purpose — the bare entry keeps the table in
       * the CI log, while the `file` variant writes the same table to
       * `coverage/coverage.txt`.
       *
       * - The file copy is what `post-coverage-pr-comment.ts` folds into the PR
       *   comment's `<details>` block; a reporter given a `file` writes only
       *   there, so dropping the bare entry would empty the log.
       */
      reporter: [
        "html",
        "json",
        "json-summary",
        "text",
        ["text", { file: "coverage.txt" }],
      ],
      reportsDirectory: "./coverage",
    },
    environment: "node",
    include: ["scripts/**/*.test.ts", "src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
