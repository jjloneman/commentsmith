import { describe, expect, test } from "vitest";

import { parseComment } from "#core/comment/parse";
import { renderComment } from "#core/comment/render";
import { loadCommentFixtures } from "#test/helpers/fixtures";

const fixtures = loadCommentFixtures();

describe("comment intermediate representation round trip", () => {
  test("the corpus is not empty", () => {
    // Given/When/Then - an empty glob would make every property below vacuous
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test.each(fixtures)("returns $name byte for byte", ({ text }) => {
    // Given/When - a comment already in canonical form
    const rendered = renderComment(parseComment(text));

    // Then - nothing about it was normalized on the way through
    expect(rendered).toBe(text);
  });

  test.each(fixtures)("preserves CRLF endings in $name", ({ text }) => {
    // Given - the same comment as it would appear in a CRLF file
    const source = text.replaceAll("\n", "\r\n");

    // When
    const rendered = renderComment(parseComment(source));

    // Then - the endings are detected and restored, not normalized to LF
    expect(rendered).toBe(source);
  });
});
