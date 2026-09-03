/**
 * The published configuration schema file, and how its contents are derived.
 *
 * - The schema itself lives in `src/core/config/schema.ts`; this module only
 *   decides where it is written and exactly what bytes go there. Keeping that
 *   here rather than in either entry script is what lets the writer and the
 *   checker agree by construction instead of by copied code.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_JSON_SCHEMA } from "#core/config/schema";

/** Where the published schema is checked in. */
export const CONFIG_SCHEMA_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "schema",
  "commentsmith.schema.json",
);

/**
 * Serialize the schema exactly as the checked-in file should read.
 *
 * - `JSON.stringify` is the authority on this file's shape, and `schema/` is in
 *   `.prettierignore` so it stays that way. The two disagree — Prettier
 *   collapses a short array onto one line where `JSON.stringify` always expands
 *   it — and letting both format the file leaves `pnpm format` and
 *   `pnpm check:schema` each undoing the other on every run.
 *
 * @returns the file's full contents.
 * @example renderConfigSchemaFile().endsWith("\n") // true
 */
export const renderConfigSchemaFile = (): string =>
  `${JSON.stringify(CONFIG_JSON_SCHEMA, null, 2)}\n`;

/**
 * Read the checked-in schema file.
 *
 * @returns its contents, or `undefined` when it has not been written yet.
 * @example readConfigSchemaFile() === renderConfigSchemaFile() // true
 */
export const readConfigSchemaFile = (): string | undefined =>
  existsSync(CONFIG_SCHEMA_PATH)
    ? readFileSync(CONFIG_SCHEMA_PATH, "utf8")
    : undefined;
