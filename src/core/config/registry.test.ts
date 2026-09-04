import { describe, expect, test } from "vitest";

import { createMockTransform } from "#test/helpers/transforms";

import type { Transform } from "./types";

import { ConfigError } from "./errors";
import {
  createTransformRegistry,
  defineTransform,
  describeRegistered,
} from "./registry";

describe("defineTransform", () => {
  test("preserves the definition it was given", () => {
    // Given - a transform declared with its own options shape
    const run: Transform<{ marker: string }> = ({ doc }) => doc;

    // When - it is erased to the registry's form
    const definition = defineTransform({
      defaultOptions: { marker: "-" },
      name: "body/bulletize",
      run,
    });

    // Then - nothing about it changes on the way through
    expect(definition.defaultOptions).toEqual({ marker: "-" });
    expect(definition.name).toBe("body/bulletize");
    expect(definition.run).toBe(run);
  });
});

describe("createTransformRegistry", () => {
  test("indexes definitions by name", () => {
    // Given - two distinct transforms
    const first = createMockTransform({ name: "body/rewrap" });
    const second = createMockTransform({ name: "frame/convert" });

    // When - they are registered
    const registry = createTransformRegistry([
      first.definition,
      second.definition,
    ]);

    // Then - each is reachable by the name a config would use
    expect(registry.size).toBe(2);
    expect(registry.get("body/rewrap")).toBe(first.definition);
    expect(registry.get("frame/convert")).toBe(second.definition);
  });

  test("rejects two definitions sharing a name", () => {
    // Given - a name claimed twice
    const definitions = [
      createMockTransform({ name: "body/rewrap" }).definition,
      createMockTransform({ name: "body/rewrap" }).definition,
    ];

    /*
     * When/Then - registering throws rather than silently dropping one, which
     * would make a config's meaning depend on array order.
     */
    expect(() => createTransformRegistry(definitions)).toThrow(ConfigError);
    expect(() => createTransformRegistry(definitions)).toThrow(
      'duplicate transform "body/rewrap"',
    );
  });
});

describe("describeRegistered", () => {
  test("sorts the names, because the reader is comparing against a typo", () => {
    // Given - transforms registered in an order nobody chose
    const registry = createTransformRegistry([
      createMockTransform({ name: "frame/convert" }).definition,
      createMockTransform({ name: "body/rewrap" }).definition,
    ]);

    // When/Then
    expect(describeRegistered(registry)).toBe("body/rewrap, frame/convert");
  });

  test("says so when nothing is registered", () => {
    // Given/When/Then - an empty list would read as a truncated message
    expect(describeRegistered(createTransformRegistry([]))).toBe("none");
  });
});
