import type { BuildOptions, Plugin } from "esbuild";

import { build, context } from "esbuild";
import { chmodSync, readFileSync } from "node:fs";

import { EXTENSION_HOST_TARGET } from "./scripts/lib/extension-host-target";

/**
 * Both bundles are CommonJS.
 *
 * - The extension host loads `main` with `require`, so an ESM bundle would fail
 *   to load outright. The CLI matches it for consistency and so a single
 *   `format` setting can't drift between the two.
 *
 * - Source stays ESM TypeScript (`"type": "module"`), which is why the outputs
 *   carry an explicit `.cjs` extension rather than `.js`.
 */
const OUTPUT_FORMAT = "cjs";

const CLI_OUTFILE = "dist/cli.cjs";

/**
 * Owner read/write/execute, group and other read/execute — the conventional
 * mode for an executable file (`rwxr-xr-x`).
 *
 * - The shebang banner alone doesn't make the bundle runnable: npm sets the
 *   exec bit when it links a `bin` entry, but a developer running
 *   `./dist/cli.cjs` directly (or a CI step doing the same) gets `EACCES`
 *   without it.
 */
const CLI_FILE_MODE = 0o755;

/**
 * Mark the emitted CLI bundle executable, once per successful build.
 *
 * - This runs as an `onEnd` plugin rather than after the top-level build call
 *   because `ctx.watch()` resolves as soon as watching *starts*, before the
 *   first bundle is written — chmod'ing there throws `ENOENT` on a clean tree
 *   and kills the watch process.
 *
 * - `onEnd` also fires on every rebuild, so the bit survives each edit in watch
 *   mode instead of being set only once.
 */
const makeCliExecutablePlugin: Plugin = {
  name: "make-cli-executable",
  setup: (pluginBuild): void => {
    pluginBuild.onEnd((result): void => {
      if (result.errors.length > 0) {
        return;
      }

      chmodSync(CLI_OUTFILE, CLI_FILE_MODE);
    });
  },
};

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

/**
 * Options common to both bundles.
 *
 * - `target` tracks the **extension host's** Node, not the dev machine's; see
 *   [scripts/lib/extension-host-target.ts](scripts/lib/extension-host-target.ts)
 *   for how it is derived and verified.
 */
const shared: BuildOptions = {
  bundle: true,
  define: { __VERSION__: JSON.stringify(version) },
  format: OUTPUT_FORMAT,
  logLevel: "info",
  minify: false,
  platform: "node",
  sourcemap: true,
  target: EXTENSION_HOST_TARGET,
};

const builds: BuildOptions[] = [
  {
    ...shared,
    entryPoints: ["src/extension/main.ts"],

    /*
     * `vscode` is injected by the extension host at runtime and has no
     * installable implementation — bundling it would fail the build, and
     * shimming it would break activation.
     */
    external: ["vscode"],
    outfile: "dist/extension.cjs",
  },
  {
    ...shared,

    // Makes the emitted bundle directly executable via the package.json `bin`
    // entry.
    banner: { js: "#!/usr/bin/env node" },
    entryPoints: ["src/cli/main.ts"],
    outfile: CLI_OUTFILE,
    plugins: [makeCliExecutablePlugin],
  },
];

const watch = process.argv.includes("--watch");

if (watch) {
  await Promise.all(
    builds.map(async (options) => {
      const ctx = await context(options);

      return ctx.watch();
    }),
  );
} else {
  await Promise.all(builds.map((options) => build(options)));
}
