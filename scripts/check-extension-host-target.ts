/**
 * Verifies that the extension bundle's esbuild `target` still matches the Node
 * version the oldest supported VS Code actually runs.
 *
 * - Building for a **newer** Node than the host emits syntax it cannot parse,
 *   which fails at activation for exactly the users the `engines.vscode` floor
 *   exists to include — a failure no test here would catch.
 *
 * - Building for an **older** Node is safe but leaves capability on the table,
 *   so a drift in either direction is reported.
 *
 * - An **upstream** failure is a warning, not an error: GitHub or Electron
 *   being unreachable must not fail CI, and must not fail an offline
 *   `pnpm check` either.
 *
 * - Every **other** error propagates and fails the run. A bare catch here would
 *   turn a broken `engines.vscode` field, or a bug in this script, into a
 *   silent pass — a guard that has stopped guarding is worse than no guard,
 *   because nobody knows to look.
 */

import {
  EXTENSION_HOST_TARGET,
  resolveExtensionHostTarget,
  resolveVsCodeFloorTag,
  UpstreamUnavailableError,
} from "./lib/extension-host-target";

const main = async (): Promise<number> => {
  const tag = resolveVsCodeFloorTag();

  const { electronVersion, nodeVersion, target } =
    await resolveExtensionHostTarget({ tag });

  if (target === EXTENSION_HOST_TARGET) {
    console.log(
      `✅ Extension host target is current: VS Code ${tag} → ` +
        `Electron ${electronVersion} → Node ${nodeVersion} → ${target}`,
    );

    return 0;
  }

  console.error(
    `❌ Extension host target is stale.\n` +
      `   VS Code ${tag} ships Electron ${electronVersion}, which bundles ` +
      `Node ${nodeVersion}.\n` +
      `   Expected: ${target}\n` +
      `   Declared: ${EXTENSION_HOST_TARGET} ` +
      `(scripts/lib/extension-host-target.ts)\n` +
      `   Update EXTENSION_HOST_TARGET and the note in CLAUDE.md together.`,
  );

  return 1;
};

try {
  process.exitCode = await main();
} catch (error: unknown) {
  if (!(error instanceof UpstreamUnavailableError)) {
    throw error;
  }

  console.warn(
    "[CI] Could not verify the extension host target — treating as a pass:",
    error.message,
  );
}
