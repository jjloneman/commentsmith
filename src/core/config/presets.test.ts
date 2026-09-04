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

  test("gives the wrap preset the transform it is named for", () => {
    // Given/When/Then - Rewrap parity is askable for before restructuring lands
    expect(BUILT_IN_PRESETS.wrap.transforms).toEqual([{ name: "body/rewrap" }]);
  });

  test("states the flagship preset's own order rather than inheriting it", () => {
    /*
     * Given/When/Then - `bullets` runs the same list as `wrap` today but must
     * not extend it. Resolution keeps an inherited entry at its inherited
     * position, so inheriting would pin wrapping ahead of the sentence
     * bulletizing that has yet to land, and the bullets it produced would never
     * be wrapped.
     */
    expect(BUILT_IN_PRESETS.bullets.extends).not.toContain("wrap");
  });

  test("bulletizes before wrapping in the flagship preset", () => {
    // Given/When - the order is the whole reason this preset states its own list
    const names = BUILT_IN_PRESETS.bullets.transforms.map(
      (entry) => entry.name,
    );

    // Then - wrapping last is what wraps the bullets bulletizing just produced
    expect(names).toEqual(["body/bulletize-sentences", "body/rewrap"]);
  });

  test("resolves every built-in preset to a pipeline that cannot reframe", () => {
    // Given - every preset a user can name without writing one
    const names = Object.keys(BUILT_IN_PRESETS);

    // When - each is resolved on its own
    const configured = names.flatMap((name) =>
      resolveConfig({ config: { extends: [name] } }).transforms.map(
        (entry) => entry.name,
      ),
    );

    /*
     * Then - none of them reframes. This guards the rule rather than a count:
     * adding a frame transform to a built-in preset must fail here, because
     * silently converting an author's line comments into a block comment is
     * what makes a formatter untrustworthy.
     */
    expect(names.length).toBeGreaterThan(0);
    expect(configured.filter((name) => name.startsWith("frame/"))).toEqual([]);
  });
});
