import js from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import perfectionistPlugin from "eslint-plugin-perfectionist";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { configs as tsConfigs } from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**"],
  },

  // Base JS rules
  js.configs.recommended,

  /*
   * TypeScript rules, type-aware.
   *
   * - `projectService` is what makes the type-checked rules below available
   *   (`dot-notation`, `prefer-nullish-coalescing`, `prefer-optional-chain`);
   *   they are unavailable without type information.
   *
   * - It costs a program build per lint run, which is acceptable at this
   *   repo's size and buys rules that catch real bugs rather than style.
   */
  ...tsConfigs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // import-x: recommended + TypeScript flat configs
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  /*
   * Resolver settings: TypeScript-aware, with Node fallback.
   *
   * - The `#core/*` and `#test/*` aliases are package.json `imports` subpaths,
   *   which this resolver reads natively — no per-tsconfig `paths` wiring.
   */
  {
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver(),
        createNodeResolver(),
      ],
    },
  },

  // Everything here is Node — the extension host and the CLI both.
  {
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports", prefer: "type-imports" },
      ],

      // Type-aware rules — see the `projectService` note above.
      "@typescript-eslint/dot-notation": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",

      // Braces always, even on one-statement blocks.
      curly: ["error", "all"],

      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
      "object-shorthand": ["error", "always"],

      /*
       * Breathing room between statements — a blank line before a control-flow
       * block or a `return`, and after a control-flow block closes.
       */
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          next: ["if", "for", "while", "switch", "try", "return"],
          prev: "*",
        },
        {
          blankLine: "always",
          next: "*",
          prev: ["if", "for", "while", "switch", "try"],
        },
      ],
    },
  },

  /*
   * All application logging goes through the logger port (src/core/logger.ts)
   * so it can be routed to a LogOutputChannel in the extension and to stderr in
   * the CLI.
   *
   * - An error, not a warn: a stray `console.log` in the CLI would write to
   *   stdout and corrupt piped `--stdin` output, which is a correctness bug
   *   rather than a style slip.
   */
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },

  /*
   * CI helper scripts print to the job log by design — that *is* their output,
   * and they never run inside the extension host or the CLI's stdout contract.
   */
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Perfectionist sorting — applied everywhere
  {
    plugins: {
      perfectionist: perfectionistPlugin,
    },
    rules: {
      "perfectionist/sort-imports": [
        "error",
        /*
         * `#core/*` and `#test/*` are our own modules (package.json `imports`
         * subpaths), not third-party packages.
         *
         * - Classify them as internal so they sort into their own group rather
         *   than among the external deps.
         */
        {
          internalPattern: ["^#"],
          order: "asc",
          type: "alphabetical",
        },
      ],
      "perfectionist/sort-interfaces": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
      "perfectionist/sort-intersection-types": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
      "perfectionist/sort-named-exports": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
      "perfectionist/sort-named-imports": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
      "perfectionist/sort-object-types": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
      "perfectionist/sort-objects": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
      "perfectionist/sort-union-types": [
        "error",
        { order: "asc", type: "alphabetical" },
      ],
    },
  },
);
