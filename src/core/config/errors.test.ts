import { describe, expect, test } from "vitest";

import { ConfigError, TransformError } from "./errors";

describe("ConfigError", () => {
  test("names itself so a caller can tell it from any other failure", () => {
    // Given/When - an error describing an unusable configuration
    const error = new ConfigError("unknown preset");

    // Then - it is an ordinary Error carrying a distinguishable name
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("unknown preset");
    expect(error.name).toBe("ConfigError");
  });
});

describe("TransformError", () => {
  test("names the failing transform and keeps the original throwable", () => {
    // Given - whatever the transform actually threw
    const mockCause = new TypeError("cannot read properties of undefined");

    // When - the runner wraps it
    const error = new TransformError({
      cause: mockCause,
      transformName: "body/rewrap",
    });

    // Then - the message names the step a user would disable
    expect(error.message).toBe('the "body/rewrap" transform failed');
    expect(error.name).toBe("TransformError");
    expect(error.transformName).toBe("body/rewrap");

    // And - the stack that explains the failure survives the wrapping
    expect(error.cause).toBe(mockCause);
  });
});
