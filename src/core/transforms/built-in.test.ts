import { describe, expect, test } from "vitest";

import { createTransformRegistry } from "#core/config/registry";

import { BUILT_IN_TRANSFORMS } from "./built-in";

describe("BUILT_IN_TRANSFORMS", () => {
  test("registers without a duplicate name", () => {
    // Given/When - the transforms Commentsmith ships, built into a registry
    const registry = createTransformRegistry(BUILT_IN_TRANSFORMS);

    // Then - every shipped transform is addressable by the name a config uses
    expect(registry.size).toBe(BUILT_IN_TRANSFORMS.length);
  });

  test("ships the transform the built-in presets name", () => {
    // Given/When - the presets refer to transforms by name, not by reference
    const registry = createTransformRegistry(BUILT_IN_TRANSFORMS);

    // Then - a preset naming an unregistered transform would fail at run time
    expect(registry.has("body/rewrap")).toBe(true);
  });
});
