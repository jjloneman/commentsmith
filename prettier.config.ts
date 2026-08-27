import type { Config } from "prettier";

import { LangVariant } from "sh-syntax";

/*
 * Prettier defaults, unmodified — the house rule across these repos is never to
 * override them.
 *
 * - The default `printWidth` of 80 is also Commentsmith's own default wrap
 *   column, so the repo formats its own comments to the shape the tool emits.
 */
const config: Config = {
  overrides: [
    /*
     * The git hooks are POSIX shell scripts but have no extension, so Prettier
     * can't infer the parser from the filename — route them to
     * `prettier-plugin-sh` explicitly.
     *
     * - Matched by `!(*.*)` (extensionless files only), not `.githooks/*`, so a
     *   non-shell file added later (e.g. a `.githooks/README.md`) isn't forced
     *   through the `sh` parser and mangled.
     *
     * - `LangBash` (also mvdan/sh's default) parses POSIX `#!/bin/sh`
     *   correctly.
     */
    {
      files: ".githooks/!(*.*)",
      options: { parser: "sh", variant: LangVariant.LangBash },
    },
  ],

  plugins: ["prettier-plugin-sh"],
  /*
   * The one deliberate override, and only because it *is* this repo's subject.
   *
   * - Prettier's default `proseWrap: "preserve"` leaves Markdown prose at
   *   whatever width it was typed, so `format:check` cannot catch an
   *   800-column paragraph.
   *
   * - Commentsmith exists to hard-wrap prose at a column. Shipping docs that
   *   ignore their own product's premise is the wrong look, and hand-wrapping
   *   is exactly the manual toil the tool removes.
   *
   * - `"always"` reflows to the default `printWidth` of 80 — the same column
   *   the formatter defaults to — so the docs and the output agree.
   */
  proseWrap: "always",
};

export default config;
