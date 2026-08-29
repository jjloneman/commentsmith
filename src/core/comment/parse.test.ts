import { describe, expect, test } from "vitest";

import { CommentParseError } from "./errors";
import { parseComment } from "./parse";

describe("parseComment", () => {
  test("defaults to a line feed when the source has no CRLF", () => {
    // Given/When/Then
    expect(parseComment("// a comment").lineEnding).toBe("\n");
  });

  test("detects CRLF rather than normalizing it away", () => {
    // Given - a comment as it appears in a CRLF file
    const source = "// a lead\r\n// a follow-up";

    // When
    const doc = parseComment(source);

    // Then - the ending is recorded so rendering cannot silently rewrite it
    expect(doc.lineEnding).toBe("\r\n");

    // And - no carriage return leaks into the body
    expect(doc.body).toStrictEqual([
      { lines: ["a lead", "a follow-up"], type: "paragraph" },
    ]);
  });

  test("composes the frame and the body into one document", () => {
    // Given/When
    const doc = parseComment("/** a summary. */");

    // Then
    expect(doc.frame.kind).toBe("doc");
    expect(doc.body).toStrictEqual([
      { lines: ["a summary."], type: "paragraph" },
    ]);
  });

  test("reports text that is not a comment rather than guessing", () => {
    // Given/When/Then
    expect(() => parseComment("const x = 1;")).toThrow(CommentParseError);
  });
});
