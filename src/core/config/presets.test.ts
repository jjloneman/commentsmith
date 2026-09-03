import { describe, expect, test } from "vitest";

import { BUILT_IN_PRESETS } from "./presets";
import { resolveConfig } from "./resolve";

describe("BUILT_IN_PRESETS", () => {
  test("builds the flagship preset on top of the round-tripping baseline", () => {
    // Given/When/Then - the inheritance is the documentation
    expect(BUILT_IN_PRESETS.bullets.extends).toEqual(["preserve"]);
  });

  test("gives the baseline preset nothing to inherit", () => {
    // Given/When/Then - parse then render already round-trips
    expect(BUILT_IN_PRESETS.preserve).toEqual({ transforms: [] });
  });

  test("resolves every built-in preset to a pipeline that cannot reframe", () => {
    // Given - every preset a user can name without writing one
    const names = Object.keys(BUILT_IN_PRESETS);

    // When - each is resolved on its own
    const pipelines = names.map(
      (name) => resolveConfig({ config: { extends: [name] } }).transforms,
    );

    /*
     * Then - none runs a transform. This guards the rule rather than the
     * current emptiness: adding a frame transform to a built-in preset must
     * fail here, because silently converting an author's line comments into a
     * block comment is what makes a formatter untrustworthy.
     */
    expect(names.length).toBeGreaterThan(0);
    expect(pipelines).toEqual(names.map(() => []));
  });
});
