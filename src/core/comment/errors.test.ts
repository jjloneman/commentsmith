import { describe, expect, test } from "vitest";

import { CommentParseError } from "./errors";

describe("CommentParseError", () => {
  test("carries its own name so a caller can tell it apart", () => {
    // Given/When
    const error = new CommentParseError("unterminated block comment");

    // Then - the name is what distinguishes it from a generic Error at a
    // catch site that has to decide whether to report or rethrow
    expect(error.name).toBe("CommentParseError");
    expect(error.message).toBe("unterminated block comment");
    expect(error).toBeInstanceOf(Error);
  });
});
