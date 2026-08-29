import { describe, expect, test } from "vitest";

import { parseComment } from "./parse";
import { containsBlockTerminator } from "./safety";

describe("containsBlockTerminator", () => {
  test("finds the terminator in prose", () => {
    // Given - the glob that broke this repo's build during scaffolding
    const doc = parseComment("// matches src/**/*.ts");

    // When/Then - reframing this as a block comment would end it early
    expect(containsBlockTerminator(doc)).toBe(true);
  });

  test("finds the terminator inside a fenced block", () => {
    // Given - a fence, where escaping the sequence would be flatly wrong
    const doc = parseComment("// ```sh\n// rm -rf src/**/*.ts\n// ```");

    // When/Then
    expect(containsBlockTerminator(doc)).toBe(true);
  });

  test("passes a body that carries no terminator", () => {
    // Given/When/Then
    expect(containsBlockTerminator(parseComment("// a plain comment"))).toBe(
      false,
    );
  });
});
