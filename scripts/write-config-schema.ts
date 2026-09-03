/**
 * Writes the published configuration schema from the types that define it.
 *
 * - Run via `pnpm schema:write` after changing the `Config` type. CI never runs
 *   this; it runs `pnpm check:schema`, which only reports drift.
 *
 * - Nothing here catches a write failure, deliberately. A catch is worth adding
 *   where there is a specific recovery — the way the extension host check
 *   tolerates an upstream outage and rethrows everything else — and there is
 *   none here: a stack trace and a non-zero exit are exactly the right outcome
 *   for a full disk or a read-only checkout. The one failure worth preventing
 *   rather than reporting is a missing directory, which is why the write is
 *   preceded by a create.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  CONFIG_SCHEMA_PATH,
  renderConfigSchemaFile,
} from "./lib/config-schema-file";

mkdirSync(dirname(CONFIG_SCHEMA_PATH), { recursive: true });
writeFileSync(CONFIG_SCHEMA_PATH, renderConfigSchemaFile(), "utf8");

console.log(`✅ Wrote ${CONFIG_SCHEMA_PATH}`);
