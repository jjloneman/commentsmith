import { describe, expect, test } from "vitest";

import type { PresetTable } from "./types";

import { ConfigError } from "./errors";
import { BUILT_IN_PRESETS } from "./presets";
import { resolveConfig } from "./resolve";
import { DEFAULT_PRINT_WIDTH } from "./types";

const mockPresets: PresetTable = {
  base: {
    printWidth: 100,
    transforms: [{ name: "first" }, { name: "second" }],
  },
  derived: {
    extends: ["base"],
    printWidth: 120,
  },
  left: { extends: ["shared"], transforms: [{ name: "left" }] },
  right: { extends: ["shared"], transforms: [{ name: "right" }] },
  shared: { transforms: [{ name: "shared" }] },
};

const mockCyclicPresets: PresetTable = {
  itself: { extends: ["itself"] },
  ping: { extends: ["pong"] },
  pong: { extends: ["ping"] },
};

describe("resolveConfig", () => {
  test("fills in every default for an empty configuration", () => {
    // Given/When - a user who configured nothing at all
    const resolved = resolveConfig({ config: {}, presets: mockPresets });

    // Then - nothing downstream has to re-apply a default
    expect(resolved).toEqual({
      printWidth: DEFAULT_PRINT_WIDTH,
      transforms: [],
    });
  });

  test("inherits a preset's width and pipeline", () => {
    // Given/When - a config that only names a preset
    const resolved = resolveConfig({
      config: { extends: ["base"] },
      presets: mockPresets,
    });

    // Then
    expect(resolved).toEqual({
      printWidth: 100,
      transforms: [
        { name: "first", options: {} },
        { name: "second", options: {} },
      ],
    });
  });

  test("lets the config outrank the preset it extends", () => {
    // Given/When - a scalar set in both places
    const resolved = resolveConfig({
      config: { extends: ["base"], printWidth: 72 },
      presets: mockPresets,
    });

    // Then - the config is the last layer, so it wins
    expect(resolved.printWidth).toBe(72);
  });

  test("applies a chain ancestors first", () => {
    // Given/When - derived extends base, and overrides its width
    const resolved = resolveConfig({
      config: { extends: ["derived"] },
      presets: mockPresets,
    });

    // Then - the deeper ancestor's pipeline survives, its width does not
    expect(resolved.printWidth).toBe(120);
    expect(resolved.transforms.map((entry) => entry.name)).toEqual([
      "first",
      "second",
    ]);
  });

  test("keeps an overridden transform in its inherited position", () => {
    // Given/When - the second inherited transform is reconfigured
    const resolved = resolveConfig({
      config: {
        extends: ["base"],
        transforms: [{ name: "second", options: { marker: "*" } }],
      },
      presets: mockPresets,
    });

    /*
     * Then - an override reconfigures a step; it does not promote it. Silently
     * reordering a pipeline changes behavior nobody asked to change.
     */
    expect(resolved.transforms).toEqual([
      { name: "first", options: {} },
      { name: "second", options: { marker: "*" } },
    ]);
  });

  test("merges options shallowly, so a nested value can be cleared", () => {
    // Given - a preset whose transform carries a nested option
    const presets: PresetTable = {
      nested: {
        transforms: [
          {
            name: "first",
            options: { keep: true, span: { end: 2, start: 1 } },
          },
        ],
      },
    };

    // When - the override replaces the nested value
    const resolved = resolveConfig({
      config: {
        extends: ["nested"],
        transforms: [{ name: "first", options: { span: { start: 5 } } }],
      },
      presets,
    });

    // Then - sibling keys survive, but the nested object is replaced whole
    expect(resolved.transforms).toEqual([
      { name: "first", options: { keep: true, span: { start: 5 } } },
    ]);
  });

  test("appends a transform no preset declared", () => {
    // Given/When - a name the inherited pipeline has never seen
    const resolved = resolveConfig({
      config: { extends: ["base"], transforms: [{ name: "third" }] },
      presets: mockPresets,
    });

    // Then - it runs last, in declaration order
    expect(resolved.transforms.map((entry) => entry.name)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  test("drops a transform an override disables", () => {
    // Given/When - an inherited step switched off rather than restated
    const resolved = resolveConfig({
      config: {
        extends: ["base"],
        transforms: [{ enabled: false, name: "first" }],
      },
      presets: mockPresets,
    });

    // Then - the runner never sees it, flag and all
    expect(resolved.transforms).toEqual([{ name: "second", options: {} }]);
  });

  test("keeps an inherited disabled flag when the override omits it", () => {
    // Given - a preset that ships a step switched off
    const presets: PresetTable = {
      off: { transforms: [{ enabled: false, name: "first" }] },
    };

    // When - an override touches only its options
    const resolved = resolveConfig({
      config: {
        extends: ["off"],
        transforms: [{ name: "first", options: { marker: "*" } }],
      },
      presets,
    });

    // Then - configuring a disabled step does not re-enable it
    expect(resolved.transforms).toEqual([]);
  });

  test("refuses a transform listed twice in one configuration", () => {
    // Given - the same step written twice in one list
    const resolve = () =>
      resolveConfig({
        config: { transforms: [{ name: "first" }, { name: "first" }] },
        presets: mockPresets,
      });

    /*
     * Then - refused, the way the registry refuses two transforms answering to
     * one name. Merging them instead would silently lose a step.
     */
    expect(resolve).toThrow(ConfigError);
    expect(resolve).toThrow(
      'transform "first" is listed twice in one configuration, ' +
        "at entries 0 and 1",
    );
  });

  test("refuses a duplicate that would have emptied the pipeline", () => {
    /*
     * Given/When/Then - before this was refused, a second entry carrying
     * `enabled: false` switched off the first, so asking to run a transform
     * twice produced no pipeline at all.
     */
    expect(() =>
      resolveConfig({
        config: {
          transforms: [{ name: "first" }, { enabled: false, name: "first" }],
        },
        presets: mockPresets,
      }),
    ).toThrow(ConfigError);
  });

  test("refuses a duplicate inside a preset, not only a user config", () => {
    // Given - a preset that repeats one of its own steps
    const presets: PresetTable = {
      repeated: { transforms: [{ name: "first" }, { name: "first" }] },
    };

    // When/Then - every layer is checked, not just the one a user wrote
    expect(() =>
      resolveConfig({ config: { extends: ["repeated"] }, presets }),
    ).toThrow('transform "first" is listed twice');
  });

  test("never hands back a preset's own options object", () => {
    // Given - options no override touches, so nothing copies them on the way
    const mockOptions = { marker: "-" };
    const presets: PresetTable = {
      seed: { transforms: [{ name: "first", options: mockOptions }] },
    };

    // When
    const resolved = resolveConfig({ config: { extends: ["seed"] }, presets });

    // Then - equal in value, but a distinct object: sharing the reference
    // would let a resolved config mutate the preset table for the life of the
    // process
    expect(resolved.transforms[0].options).toEqual(mockOptions);
    expect(resolved.transforms[0].options).not.toBe(mockOptions);
  });

  test("applies a shared ancestor once across a diamond", () => {
    // Given/When - two presets that both extend a third
    const resolved = resolveConfig({
      config: { extends: ["left", "right"] },
      presets: mockPresets,
    });

    // Then - the shared transform appears once, at its first position
    expect(resolved.transforms.map((entry) => entry.name)).toEqual([
      "shared",
      "left",
      "right",
    ]);
  });

  test("reports a preset that extends itself", () => {
    // Given/When/Then - the whole path, since the offending edge is rarely
    // the one the user is looking at
    expect(() =>
      resolveConfig({
        config: { extends: ["itself"] },
        presets: mockCyclicPresets,
      }),
    ).toThrow('preset "itself" extends itself: itself -> itself');
  });

  test("reports a cycle between two presets", () => {
    // Given/When/Then
    expect(() =>
      resolveConfig({
        config: { extends: ["ping"] },
        presets: mockCyclicPresets,
      }),
    ).toThrow('preset "ping" extends itself: ping -> pong -> ping');
  });

  test("reports an unknown preset, listing the ones that exist", () => {
    // Given/When - a plausible typo
    const resolve = () =>
      resolveConfig({ config: { extends: ["bass"] }, presets: mockPresets });

    // Then - the message carries the candidates, sorted for scanning
    expect(resolve).toThrow(ConfigError);
    expect(resolve).toThrow(
      'unknown preset "bass". Available presets: base, derived, left, ' +
        "right, shared",
    );
  });

  test("says so when there are no presets at all", () => {
    // Given/When/Then - an empty list would read as a truncated message
    expect(() =>
      resolveConfig({ config: { extends: ["anything"] }, presets: {} }),
    ).toThrow("Available presets: none");
  });

  test("defaults to the built-in presets", () => {
    // Given/When - no preset table supplied
    const resolved = resolveConfig({ config: { extends: ["bullets"] } });

    /*
     * Then - the built-ins resolved without the caller naming them. The
     * pipeline is compared against the preset rather than spelled out, so
     * populating a built-in stays a preset change rather than a test failure.
     */
    expect(resolved.printWidth).toBe(DEFAULT_PRINT_WIDTH);
    expect(resolved.transforms.map((entry) => entry.name)).toEqual(
      BUILT_IN_PRESETS.bullets.transforms.map((entry) => entry.name),
    );
  });
});
