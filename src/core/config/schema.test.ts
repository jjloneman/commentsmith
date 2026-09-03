import { describe, expect, test } from "vitest";

import type { JsonSchemaNode } from "./schema";

import { CONFIG_JSON_SCHEMA, TRANSFORM_ENTRY_SCHEMA } from "./schema";
import { DEFAULT_PRINT_WIDTH } from "./types";

/**
 * Flatten a schema into every node it contains, itself included.
 *
 * @returns the nodes, in no meaningful order.
 */
const collectNodes = (node: JsonSchemaNode): JsonSchemaNode[] => [
  node,
  ...Object.values(node.properties ?? {}).flatMap(collectNodes),
  ...(node.items === undefined ? [] : collectNodes(node.items)),
];

describe("CONFIG_JSON_SCHEMA", () => {
  test("declares exactly the configuration's own fields", () => {
    /*
     * Given/When/Then - the runtime half of the guarantee. `satisfies` already
     * makes a missing or extra key a compile error; this catches a rename that
     * happened to stay type-correct.
     */
    expect(Object.keys(CONFIG_JSON_SCHEMA.properties)).toEqual([
      "extends",
      "printWidth",
      "transforms",
    ]);
  });

  test("advertises the same default the resolver applies", () => {
    // Given/When/Then - one constant, read by both, cannot disagree
    expect(CONFIG_JSON_SCHEMA.properties.printWidth.default).toBe(
      DEFAULT_PRINT_WIDTH,
    );
  });

  test("closes both objects to keys they do not declare", () => {
    // Given/When/Then - an editor should flag a typo rather than accept it
    expect(CONFIG_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(TRANSFORM_ENTRY_SCHEMA.additionalProperties).toBe(false);
  });

  test("requires a transform entry to name its transform", () => {
    // Given/When/Then - an entry without a name configures nothing
    expect(TRANSFORM_ENTRY_SCHEMA.required).toEqual(["name"]);
  });

  test("constrains the strings the validator would reject", () => {
    /*
     * Given/When/Then - `parseConfig` rejects an empty name and an empty
     * preset name, so a schema that accepts one green-lights, in an editor,
     * config the runtime throws on.
     */
    expect(TRANSFORM_ENTRY_SCHEMA.properties.name.minLength).toBe(1);
    expect(CONFIG_JSON_SCHEMA.properties.extends.items.minLength).toBe(1);
  });

  test("gives every node, nested ones included, prose worth showing", () => {
    // Given - every node an editor might surface on hover
    const nodes = collectNodes(CONFIG_JSON_SCHEMA);

    // When
    const undescribed = nodes.filter((node) => node.description.trim() === "");

    /*
     * Then - the schema is the settings UI's only prose, so a node without it
     * is a setting the user has to guess at.
     *
     * - `JsonSchemaNode` already requires `description`, so the compiler
     *   catches a missing one. What it cannot catch is an empty or
     *   whitespace-only string, which type-checks and documents nothing — that
     *   is the case this test exists for.
     */
    expect(nodes.length).toBeGreaterThan(1);
    expect(undescribed).toEqual([]);
  });
});
