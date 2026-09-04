import { describe, expect, test } from "vitest";

import { wrapText } from "./wrap";

describe("wrapText", () => {
  test("fills each line greedily up to the budget", () => {
    // Given/When - three atoms against a budget two of them fit inside
    const wrapped = wrapText({
      continuationWidth: 10,
      firstLineWidth: 10,
      lines: ["alpha beta gamma"],
    });

    // Then - the third starts a new line rather than overflowing the first
    expect(wrapped).toEqual(["alpha beta", "gamma"]);
  });

  test("spends the first-line budget on the first line only", () => {
    // Given/When - a narrow opening line and a wider hanging indent below it
    const wrapped = wrapText({
      continuationWidth: 12,
      firstLineWidth: 5,
      lines: ["alpha beta gamma"],
    });

    // Then - the first line takes what fits in five columns, the rest in twelve
    expect(wrapped).toEqual(["alpha", "beta gamma"]);
  });

  test("rejoins lines before re-splitting them", () => {
    // Given/When - text already broken across lines, with runs of spaces
    const wrapped = wrapText({
      continuationWidth: 20,
      firstLineWidth: 20,
      lines: ["alpha   beta", "  gamma"],
    });

    // Then - the existing breaks and the extra spaces both give way to one line
    expect(wrapped).toEqual(["alpha beta gamma"]);
  });

  test("returns no lines when the text holds no atoms", () => {
    // Given/When/Then - an empty item or tag carries nothing to wrap
    expect(
      wrapText({ continuationWidth: 10, firstLineWidth: 10, lines: [""] }),
    ).toEqual([]);

    expect(
      wrapText({ continuationWidth: 10, firstLineWidth: 10, lines: [] }),
    ).toEqual([]);
  });
});

describe("wrapText atoms", () => {
  test("never splits an inline code span", () => {
    // Given/When - a code span carrying spaces, against a budget it fills
    const wrapped = wrapText({
      continuationWidth: 7,
      firstLineWidth: 7,
      lines: ["a `b c d` e"],
    });

    // Then - the span moves to its own line whole rather than breaking
    expect(wrapped).toEqual(["a", "`b c d`", "e"]);
  });

  test("closes a code span only on a run of the opening length", () => {
    // Given/When - a doubled run quoting a single backtick, as CommonMark allows
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["``a ` b``"],
    });

    // Then - the inner backtick does not end the span
    expect(wrapped).toEqual(["``a ` b``"]);
  });

  test("never splits an inline link", () => {
    // Given/When - link text carrying a space
    const wrapped = wrapText({
      continuationWidth: 8,
      firstLineWidth: 8,
      lines: ["see [a b](x) end"],
    });

    // Then - the whole link travels together
    expect(wrapped).toEqual(["see", "[a b](x)", "end"]);
  });

  test("never splits a reference link", () => {
    // Given/When - the two-bracket form
    const wrapped = wrapText({
      continuationWidth: 10,
      firstLineWidth: 10,
      lines: ["x [a b][c d] y"],
    });

    // Then - both bracket pairs belong to one atom
    expect(wrapped).toEqual(["x", "[a b][c d]", "y"]);
  });

  test("never splits an image, brackets nested inside it included", () => {
    // Given/When - an image inside a link's own text
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["[see ![img](y) here](x)"],
    });

    // Then - depth counting keeps the outer link whole
    expect(wrapped).toEqual(["[see ![img](y) here](x)"]);
  });

  test("does not let an escaped bracket close a link's label", () => {
    // Given/When - a label carrying an escaped closing bracket
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["[a \\] b](x)"],
    });

    // Then - the escape is honored, so the link is still one atom
    expect(wrapped).toEqual(["[a \\] b](x)"]);
  });

  test("treats a bare exclamation mark as an ordinary word", () => {
    // Given/When - a "!" that opens no image
    const wrapped = wrapText({
      continuationWidth: 4,
      firstLineWidth: 4,
      lines: ["wow! ok"],
    });

    // Then - it wraps as prose rather than looking for a link that is not there
    expect(wrapped).toEqual(["wow!", "ok"]);
  });

  test("falls back to words when a code span never closes", () => {
    // Given/When - a stray backtick, which is prose rather than markup
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["a `b c"],
    });

    // Then - it wraps like ordinary text instead of swallowing the rest
    expect(wrapped).toEqual(["a `b", "c"]);
  });

  test("falls back to words when a bracket never closes", () => {
    // Given/When - an unclosed bracket
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["a [b c"],
    });

    // Then - the same fallback, so malformed markup cannot become one long atom
    expect(wrapped).toEqual(["a [b", "c"]);
  });

  test("treats a bracketed run followed by no target as words", () => {
    // Given/When - brackets that are not a link at all
    const wrapped = wrapText({
      continuationWidth: 4,
      firstLineWidth: 4,
      lines: ["[a b] c"],
    });

    // Then - it breaks between words, because nothing here is unbreakable
    expect(wrapped).toEqual(["[a", "b] c"]);
  });
});

describe("wrapText block openers", () => {
  test("never breaks before a marker that would start a list", () => {
    // Given/When - a dash used as prose punctuation, right where a break falls
    const wrapped = wrapText({
      continuationWidth: 8,
      firstLineWidth: 8,
      lines: ["alpha beta - gamma delta"],
    });

    /*
     * Then - no line after the first begins with the dash. Starting one would
     * make the next parse read the rest of the prose as a bullet list.
     */
    expect(wrapped.slice(1).some((line) => line.startsWith("- "))).toBe(false);
  });

  test("pulls the preceding atom down to keep the break inside the budget", () => {
    // Given/When - room to move one atom rather than overflow the line
    const wrapped = wrapText({
      continuationWidth: 9,
      firstLineWidth: 9,
      lines: ["alpha bb - cc"],
    });

    // Then - "bb" comes down with the dash instead of the line running over
    expect(wrapped).toEqual(["alpha", "bb - cc"]);
  });

  test("overflows when there is nothing left to pull down", () => {
    // Given/When - a first atom that fills the line on its own
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["alpha - bb"],
    });

    // Then - overflowing beats changing what the next line parses as
    expect(wrapped).toEqual(["alpha -", "bb"]);
  });

  test("guards every marker the body layer recognizes", () => {
    // Given - one line per construct that changes meaning at a line start
    const markers = ["-", "*", "+", "1.", "---", "```", "@param"];

    // When - each is placed exactly where a greedy fill would break
    const wrapped = markers.map((marker) => ({
      lines: wrapText({
        continuationWidth: 8,
        firstLineWidth: 8,
        lines: [`alpha bb ${marker} cc dd`],
      }),
      marker,
    }));

    // Then - none of them ever leads a continuation line
    expect(
      wrapped
        .filter(({ lines, marker }) =>
          lines.slice(1).some((line) => line.startsWith(marker)),
        )
        .map(({ marker }) => marker),
    ).toEqual([]);
  });

  test("never completes a line that would read as a block on its own", () => {
    // Given/When - a budget that would cut this content at "- alpha"
    const wrapped = wrapText({
      continuationWidth: 8,
      firstLineWidth: 8,
      lines: ["- alpha beta"],
    });

    /*
     * Then - it overflows instead. Cutting there leaves a line that parses as
     * a bullet, and only the line being *completed* can go wrong this way:
     * every later line already had its opening atom vetted.
     */
    expect(wrapped).toEqual(["- alpha beta"]);
  });
});

describe("wrapText overflow", () => {
  test("overflows rather than breaking an atom wider than the budget", () => {
    // Given/When - a single atom no budget could hold
    const wrapped = wrapText({
      continuationWidth: 5,
      firstLineWidth: 5,
      lines: ["supercalifragilistic ok"],
    });

    /*
     * Then - it sits alone and over the column. A long line is something a
     * human can act on; a link or code span split in half is corrupted markup.
     */
    expect(wrapped).toEqual(["supercalifragilistic", "ok"]);
  });

  test("counts width in code points rather than UTF-16 units", () => {
    // Given/When - two emoji, each a surrogate pair, inside a nine-column budget
    const wrapped = wrapText({
      continuationWidth: 9,
      firstLineWidth: 9,
      lines: ["aa \u{1F642}\u{1F642} bb"],
    });

    /*
     * Then - the line is eight code points and fits. Counting `.length` would
     * charge the pair four columns it does not occupy and break early.
     */
    expect(wrapped).toEqual(["aa \u{1F642}\u{1F642} bb"]);
  });

  test("degrades to one atom per line on a budget of zero or less", () => {
    // Given/When - what a deep indent under a narrow width produces
    const wrapped = wrapText({
      continuationWidth: -5,
      firstLineWidth: 0,
      lines: ["a b c"],
    });

    // Then - it terminates with one atom per line rather than looping
    expect(wrapped).toEqual(["a", "b", "c"]);
  });
});
