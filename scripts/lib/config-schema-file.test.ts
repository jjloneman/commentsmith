import { describe, expect, test } from "vitest";

import { CONFIG_JSON_SCHEMA } from "#core/config/schema";

import {
  CONFIG_SCHEMA_PATH,
  readConfigSchemaFile,
  renderConfigSchemaFile,
} from "./config-schema-file";

describe("renderConfigSchemaFile", () => {
  test("serializes the schema the way Prettier would leave it", () => {
    // Given/When - the exact bytes the checked-in file should hold
    const rendered = renderConfigSchemaFile();

    // Then - JSON.stringify's own shape, which `.prettierignore` keeps
    // Prettier from rewriting into something this checker would reject
    expect(rendered).toBe(`${JSON.stringify(CONFIG_JSON_SCHEMA, null, 2)}\n`);
    expect(rendered.endsWith("\n")).toBe(true);
  });

  test("round-trips back to the schema it came from", () => {
    // Given/When/Then
    expect(JSON.parse(renderConfigSchemaFile())).toEqual(CONFIG_JSON_SCHEMA);
  });
});

describe("readConfigSchemaFile", () => {
  test("finds the published schema where the writer puts it", () => {
    // Given/When/Then
    expect(CONFIG_SCHEMA_PATH.endsWith("schema/commentsmith.schema.json")).toBe(
      true,
    );
  });

  test("matches what the types currently produce", () => {
    /*
     * Given/When/Then - the same drift `pnpm check:schema` guards, asserted
     * here too so a stale schema fails the test suite rather than only the
     * separate CI step.
     */
    expect(readConfigSchemaFile()).toBe(renderConfigSchemaFile());
  });
});
