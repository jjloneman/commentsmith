import { describe, expect, test } from "vitest";

import { ConfigError } from "./errors";
import { parseConfig } from "./validate";

describe("parseConfig", () => {
  test("accepts a fully populated configuration", () => {
    // Given - every field a user can write
    const mockConfig = {
      extends: ["bullets"],
      printWidth: 100,
      transforms: [
        { enabled: false, name: "body/rewrap", options: { marker: "-" } },
      ],
    };

    // When/Then - the value comes back typed, not rebuilt
    expect(parseConfig(mockConfig)).toEqual(mockConfig);
  });

  test("accepts an empty configuration without defaulting it", () => {
    /*
     * Given/When/Then - defaulting belongs to resolveConfig. Doing it in both
     * places is how the two come to disagree.
     */
    expect(parseConfig({})).toEqual({});
  });

  test("rejects a root that is not an object", () => {
    // Given/When/Then - each wrong shape names what it actually got
    expect(() => parseConfig(null)).toThrow(ConfigError);
    expect(() => parseConfig(null)).toThrow(
      "config: expected an object, received null",
    );
    expect(() => parseConfig([])).toThrow(
      "config: expected an object, received an array",
    );
    expect(() => parseConfig("bullets")).toThrow(
      "config: expected an object, received a string",
    );
    expect(() => parseConfig(undefined)).toThrow(
      "config: expected an object, received nothing",
    );
  });

  test("rejects a key the schema does not declare", () => {
    // Given/When - a plausible casing mistake
    const parse = () => parseConfig({ printwidth: 100 });

    /*
     * Then - ignoring it would make a typo look exactly like a setting that
     * had no effect.
     */
    expect(parse).toThrow(ConfigError);
    expect(parse).toThrow(
      'config: unknown key "printwidth". ' +
        "Known keys: extends, printWidth, transforms",
    );
  });

  test("pluralizes when several keys are unknown", () => {
    // Given/When/Then - the message is read by a human, not a parser
    expect(() => parseConfig({ a: 1, b: 2 })).toThrow(
      'config: unknown keys "a", "b".',
    );
  });

  test("rejects an extends list that is not a list of names", () => {
    // Given/When/Then - the index says which entry to look at
    expect(() => parseConfig({ extends: "bullets" })).toThrow(
      "config.extends: expected an array, received a string",
    );
    expect(() => parseConfig({ extends: [1] })).toThrow(
      "config.extends[0]: expected a non-empty preset name, received a number",
    );
    expect(() => parseConfig({ extends: [""] })).toThrow(
      "config.extends[0]: expected a non-empty preset name, received a string",
    );
  });

  test("rejects a width that cannot be a column", () => {
    // Given/When/Then - a wrong type and a wrong value read differently
    expect(() => parseConfig({ printWidth: "80" })).toThrow(
      "config.printWidth: expected a number, received a string",
    );
    expect(() => parseConfig({ printWidth: 79.5 })).toThrow(
      "config.printWidth: expected a positive integer, received 79.5",
    );
    expect(() => parseConfig({ printWidth: 0 })).toThrow(
      "config.printWidth: expected a positive integer, received 0",
    );
  });

  test("rejects a transform list that is not a list of entries", () => {
    // Given/When/Then
    expect(() => parseConfig({ transforms: {} })).toThrow(
      "config.transforms: expected an array, received an object",
    );
    expect(() => parseConfig({ transforms: ["body/rewrap"] })).toThrow(
      "config.transforms[0]: expected an object, received a string",
    );
  });

  test("rejects a transform entry with a bad field", () => {
    // Given/When/Then - each path points at the exact field to fix
    expect(() => parseConfig({ transforms: [{}] })).toThrow(
      "config.transforms[0].name: expected a non-empty transform name, " +
        "received nothing",
    );
    expect(() => parseConfig({ transforms: [{ name: "" }] })).toThrow(
      "config.transforms[0].name: expected a non-empty transform name, " +
        "received a string",
    );
    expect(() =>
      parseConfig({ transforms: [{ enabled: "no", name: "body/rewrap" }] }),
    ).toThrow(
      "config.transforms[0].enabled: expected a boolean, received a string",
    );
    expect(() =>
      parseConfig({ transforms: [{ name: "body/rewrap", options: [] }] }),
    ).toThrow(
      "config.transforms[0].options: expected an object, received an array",
    );
    expect(() =>
      parseConfig({ transforms: [{ marker: "-", name: "body/rewrap" }] }),
    ).toThrow(
      'config.transforms[0]: unknown key "marker". ' +
        "Known keys: enabled, name, options",
    );
  });

  test("keeps a transform entry that omits its optional fields", () => {
    // Given/When - the shortest entry a user can write
    const parsed = parseConfig({ transforms: [{ name: "body/rewrap" }] });

    // Then - nothing is invented on its behalf
    expect(parsed.transforms).toEqual([{ name: "body/rewrap" }]);
  });
});
