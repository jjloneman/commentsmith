/**
 * Verifies the checked-in configuration schema still matches the types.
 *
 * - The schema is what a settings UI and an rc file validate against, so a
 *   stale one accepts configuration the formatter rejects, or rejects
 *   configuration it accepts. Both fail at the user, far from the change that
 *   caused them.
 *
 * - Unlike the extension host check, this has no upstream to be unavailable:
 *   everything it compares is in the tree, so any mismatch is a real failure
 *   and exits non-zero.
 */

import {
  CONFIG_SCHEMA_PATH,
  readConfigSchemaFile,
  renderConfigSchemaFile,
} from "./lib/config-schema-file";

const expected = renderConfigSchemaFile();
const published = readConfigSchemaFile();

if (published === expected) {
  console.log(`✅ Configuration schema is current: ${CONFIG_SCHEMA_PATH}`);
} else {
  console.error(
    `❌ Configuration schema is stale.\n` +
      `   ${CONFIG_SCHEMA_PATH} no longer matches src/core/config/schema.ts.\n` +
      `   Run: pnpm schema:write`,
  );

  process.exitCode = 1;
}
