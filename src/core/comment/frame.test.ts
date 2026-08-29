import { describe, expect, test } from "vitest";

import type { CommentFrame } from "./types";

import { CommentParseError } from "./errors";
import { parseFrame, renderFramedLines } from "./frame";

describe("parseFrame", () => {
  test("reads a line comment stack's marker and separator", () => {
    // Given/When - a stack whose lines each repeat the opener
    const parsed = parseFrame(["// a lead", "//", "// a follow-up"]);

    // Then - the separator is folded into the prefix so rendering can concat
    expect(parsed.frame).toStrictEqual({
      close: "",
      indent: "",
      isSingleLine: false,
      kind: "line",
      linePrefix: "// ",
      open: "//",
    } satisfies CommentFrame);

    // And - the blank line survives as an empty content line
    expect(parsed.contentLines).toStrictEqual(["a lead", "", "a follow-up"]);
  });

  test("keeps a stack that never separates its content with a space", () => {
    // Given/When
    const parsed = parseFrame(["//tight"]);

    // Then - the prefix carries no space, so the round trip stays faithful
    expect(parsed.frame.linePrefix).toBe("//");
    expect(parsed.contentLines).toStrictEqual(["tight"]);
  });

  test("rejects a stack whose marker shrinks partway", () => {
    // Given/When/Then - a mixed stack is malformed, not silently reinterpreted
    expect(() => parseFrame(["/// a doc line", "// a plain line"])).toThrow(
      CommentParseError,
    );
  });

  test("rejects a stack whose marker grows partway", () => {
    // Given/When/Then - the mirror of the case above, which used to slip
    // through and re-prefix the extra slash into the middle of the text
    expect(() => parseFrame(["// a plain line", "/// a doc line"])).toThrow(
      CommentParseError,
    );
  });

  test("collapses a doc comment written on one line", () => {
    // Given/When
    const parsed = parseFrame(["/** a summary. */"]);

    // Then - the flag records the layout choice the renderer cannot recover
    expect(parsed.frame.isSingleLine).toBe(true);
    expect(parsed.frame.kind).toBe("doc");
    expect(parsed.contentLines).toStrictEqual(["a summary."]);

    // And - it carries the prefix and closer a later expansion would need
    expect(parsed.frame.linePrefix).toBe(" * ");
  });

  test("reads an empty one-line doc comment", () => {
    // Given/When/Then - the degenerate case still has to parse
    expect(parseFrame(["/** */"]).contentLines).toStrictEqual([]);
  });

  test("rejects a one-line block comment that never closes", () => {
    // Given/When/Then
    expect(() => parseFrame(["/** unterminated"])).toThrow(
      "unterminated block comment",
    );
  });

  test("rejects a multi-line block comment that never closes", () => {
    // Given/When/Then
    expect(() => parseFrame(["/**", " * unterminated"])).toThrow(
      "unterminated block comment",
    );
  });

  test("keeps content sharing the closing line", () => {
    // Given - a comment whose last line is text and closer together
    const lines = ["/**", " * a summary. */"];

    // When
    const parsed = parseFrame(lines);

    // Then - the text is body, not frame
    expect(parsed.contentLines).toStrictEqual(["a summary."]);
  });

  test("keeps content trailing the opening delimiter", () => {
    // Given/When - a comment whose opener carries its first words
    const parsed = parseFrame(["/** a lead", " * a follow-up", " */"]);

    // Then - the lead is the body's first line
    expect(parsed.contentLines).toStrictEqual(["a lead", "a follow-up"]);
  });

  test("reads an unstarred block comment's shared indent as its prefix", () => {
    // Given/When
    const parsed = parseFrame(["/*", "  a lead", "", "  a follow-up", "*/"]);

    // Then - with no marker, the common indent is what each line carries
    expect(parsed.frame.linePrefix).toBe("  ");
    expect(parsed.contentLines).toStrictEqual(["a lead", "", "a follow-up"]);
  });

  test("falls back to the canonical prefix when the body is empty", () => {
    // Given/When - there is no line to infer a prefix from
    const parsed = parseFrame(["/*", "", "*/"]);

    // Then - an inferred empty prefix round-trips only while the body is
    // empty, and renders a malformed comment as soon as a transform fills it
    expect(parsed.frame.linePrefix).toBe(" * ");
  });

  test("ignores a bare asterisk line when inferring the separator", () => {
    // Given/When - a blank body line proves the body is starred, and nothing
    // whatsoever about the space that separates prefix from content
    const parsed = parseFrame(["/**", " *", " */"]);

    // Then
    expect(parsed.frame.linePrefix).toBe(" * ");
  });

  test("keeps a starred body written without a separating space", () => {
    // Given/When - here a populated line does show the separator's absence
    const parsed = parseFrame(["/**", " *tight", " */"]);

    // Then - honoring it is what keeps the round trip faithful
    expect(parsed.frame.linePrefix).toBe(" *");
    expect(parsed.contentLines).toStrictEqual(["tight"]);
  });

  test("keeps a body line that is missing its asterisk", () => {
    // Given/When - one line of a starred block was written without its marker
    const parsed = parseFrame(["/**", " * a lead", "a stray line", " */"]);

    // Then - it is kept verbatim rather than having its first character eaten
    expect(parsed.contentLines).toStrictEqual(["a lead", "a stray line"]);
  });

  test("collapses a plain block comment written on one line", () => {
    // Given/When - the non-doc form of the same layout
    const parsed = parseFrame(["/* a note */"]);

    // Then
    expect(parsed.frame.kind).toBe("block");
    expect(parsed.frame.isSingleLine).toBe(true);
  });

  test("keeps a body line indented less than the opener", () => {
    // Given - a body line flush against the margin under an indented opener
    const parsed = parseFrame(["  /**", "* a stray line", "  */"]);

    // Then - stripping a fixed indent would have eaten its marker
    expect(parsed.contentLines).toStrictEqual(["a stray line"]);
  });

  test("rejects empty input rather than dying on the first line", () => {
    // Given/When/Then - the caller gets this parser's diagnostic, not a
    // TypeError from indexing nothing
    expect(() => parseFrame([])).toThrow(CommentParseError);
  });

  test("rejects text that is not a comment", () => {
    // Given/When/Then
    expect(() => parseFrame(["const x = 1;"])).toThrow(CommentParseError);
  });
});

describe("renderFramedLines", () => {
  const collapsedFrame: CommentFrame = {
    close: " */",
    indent: "",
    isSingleLine: true,
    kind: "doc",
    linePrefix: " * ",
    open: "/**",
  };

  test("collapses a single-line frame carrying one content line", () => {
    // Given/When/Then
    expect(
      renderFramedLines({
        contentLines: ["a summary."],
        frame: collapsedFrame,
      }),
    ).toStrictEqual(["/** a summary. */"]);
  });

  test("renders an empty comment for a single-line frame with no content", () => {
    // Given/When/Then
    expect(
      renderFramedLines({ contentLines: [], frame: collapsedFrame }),
    ).toStrictEqual(["/** */"]);
  });

  test("expands a single-line frame whose body has outgrown it", () => {
    // Given - the state a transform leaves behind when it grows the body and
    // forgets to clear the flag; parsing can never produce it
    const contentLines = ["a summary.", "", "- a bullet"];

    // When
    const rendered = renderFramedLines({ contentLines, frame: collapsedFrame });

    // Then - declining the impossible request beats crushing it onto one line
    expect(rendered).toStrictEqual([
      "/**",
      " * a summary.",
      " *",
      " * - a bullet",
      " */",
    ]);
  });

  test("renders a bare marker for a line comment with no content", () => {
    // Given - an emptied body, which renders as the marker alone
    const frame: CommentFrame = {
      close: "",
      indent: "  ",
      isSingleLine: false,
      kind: "line",
      linePrefix: "// ",
      open: "//",
    };

    // When/Then - the separator is trimmed so no trailing space is emitted
    expect(renderFramedLines({ contentLines: [], frame })).toStrictEqual([
      "  //",
    ]);
  });
});
