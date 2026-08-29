import { describe, expect, test } from "vitest";

import { parseComment } from "./parse";
import { renderComment } from "./render";

describe("renderComment", () => {
  test("joins the comment with the line ending it was parsed from", () => {
    // Given - a CRLF comment, whose ending is carried on the document
    const doc = parseComment("// a lead\r\n// a follow-up");

    // When/Then
    expect(renderComment(doc)).toBe("// a lead\r\n// a follow-up");
  });

  test("tidies a comment that was not already in canonical form", () => {
    // Given - ragged spacing, which carries no round-trip guarantee
    const doc = parseComment(
      "/**\n *   a summary.\n *\n *\n * a follow-up.\n */",
    );

    // When
    const rendered = renderComment(doc);

    // Then - the doubled blank line collapses; the paragraph's own indentation
    // is content and is left alone
    expect(rendered).toBe("/**\n *   a summary.\n *\n * a follow-up.\n */");
  });
});
