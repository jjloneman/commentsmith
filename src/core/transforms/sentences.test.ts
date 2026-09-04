import { describe, expect, test } from "vitest";

import { splitSentences } from "./sentences";

/**
 * One segmentation case: the prose and the sentences it must come back as.
 *
 * - Written as a table because the value of these tests is the corpus of
 *   inputs, not the assertion, which is the same every time.
 */
type SentenceCase = {
  /** The sentences the text must split into. @example ["One.", "Two."] */
  expected: string[];

  /** The prose to split. @example "One. Two." */
  text: string;
};

/**
 * Cases `Intl.Segmenter` already handles, pinned so a repair rule cannot break
 * them.
 */
const SEGMENTER_CASES: SentenceCase[] = [
  {
    expected: ["A sentence.", "Another one."],
    text: "A sentence. Another one.",
  },
  {
    expected: ["Use e.g. this.", "Then that."],
    text: "Use e.g. this. Then that.",
  },
  {
    expected: ["i.e. the U.S. thing.", "Done."],
    text: "i.e. the U.S. thing. Done.",
  },
  {
    expected: ["Version 1.2.3 ships.", "Next."],
    text: "Version 1.2.3 ships. Next.",
  },
  {
    expected: ["A ratio of 3.5 to 1.", "Next."],
    text: "A ratio of 3.5 to 1. Next.",
  },
  {
    expected: ["Wait... really?", "Yes!", "Fine."],
    text: "Wait... really? Yes! Fine.",
  },
  {
    expected: ["An em dash — not a terminator.", "Yes."],
    text: "An em dash — not a terminator. Yes.",
  },
  {
    expected: ["See `a. b` here.", "Next one."],
    text: "See `a. b` here. Next one.",
  },
  { expected: ["A [a. b](x) link.", "Next."], text: "A [a. b](x) link. Next." },
  {
    expected: ["Approx. 5 items.", "Next."],
    text: "Approx. 5 items. Next.",
  },
];

/** Cases that only pass because of a repair rule, each naming the rule. */
const REPAIR_CASES: ({ rule: string } & SentenceCase)[] = [
  {
    expected: ['He said "Stop. Now." loudly.', "Done."],
    rule: "unbalanced quotation",
    text: 'He said "Stop. Now." loudly. Done.',
  },
  {
    expected: ["See (a. b. c) here.", "Next."],
    rule: "unbalanced parenthesis",
    text: "See (a. b. c) here. Next.",
  },
  {
    expected: ["Mr. Smith Jr. arrived.", "Next."],
    rule: "abbreviation",
    text: "Mr. Smith Jr. arrived. Next.",
  },
  {
    expected: ['He said ("John is coming due for services!") loudly.', "Done."],
    rule: "lowercase continuation",
    text: 'He said ("John is coming due for services!") loudly. Done.',
  },
];

describe("splitSentences", () => {
  test.each(SEGMENTER_CASES)("splits $text", ({ expected, text }) => {
    // Given/When - prose the platform segmenter already reads correctly
    // Then - it is passed through, so a repair rule regressing one fails here
    expect(splitSentences(text)).toEqual(expected);
  });

  test.each(REPAIR_CASES)(
    "repairs a $rule split in $text",
    ({ expected, text }) => {
      // Given/When - prose the platform segmenter splits in the wrong place
      // Then - the merge pass puts it back together
      expect(splitSentences(text)).toEqual(expected);
    },
  );

  test("keeps a sentence whole when a code span never closes", () => {
    // Given/When - an unclosed span is a construct still open, not absent
    const sentences = splitSentences("A `run. that never closes. End.");

    // Then - nothing after the backtick is treated as a boundary
    expect(sentences).toEqual(["A `run. that never closes. End."]);
  });

  test("does not treat a stray closer as an open construct", () => {
    // Given/When - a `)` that opened nowhere, as prose written by hand
    const sentences = splitSentences("Done) already. Next one.");

    // Then - the depth is clamped, so the following sentence still splits
    expect(sentences).toEqual(["Done) already.", "Next one."]);
  });

  test("keeps a sentence whole when a bracket never closes", () => {
    // Given/When - a bare bracket the link reader declines, left open
    const sentences = splitSentences("See [the docs. Next.");

    // Then - an open bracket says the sentence is not over
    expect(sentences).toEqual(["See [the docs. Next."]);
  });

  test("splits after a bare bracket that closes", () => {
    // Given/When - `[a. b]` is not a link, so it is counted rather than skipped
    const sentences = splitSentences("See [a. b] here. Next.");

    // Then - the brackets balance, so the boundary after them stands
    expect(sentences).toEqual(["See [a. b] here.", "Next."]);
  });

  test("does not count an escaped delimiter", () => {
    // Given/When - a parenthesis the author escaped rather than opened
    const sentences = splitSentences("Costs 5 \\( or so. Next.");

    // Then - the escape is skipped, so no construct is left open
    expect(sentences).toEqual(["Costs 5 \\( or so.", "Next."]);
  });

  test("does not merge on an apostrophe", () => {
    // Given/When - single quotes are not tracked, because prose is full of them
    const sentences = splitSentences("It's fine. Truly.");

    // Then
    expect(sentences).toEqual(["It's fine.", "Truly."]);
  });

  test("returns one sentence for prose with no terminator", () => {
    // Given/When/Then - a fragment is still a sentence for bulletizing
    expect(splitSentences("no terminator here")).toEqual([
      "no terminator here",
    ]);
  });

  test("trims the whitespace a segment carries", () => {
    // Given/When - the segmenter attaches the separating space to the segment
    const sentences = splitSentences("  One.   Two.  ");

    // Then - each sentence is delivered ready to place in a list item
    expect(sentences).toEqual(["One.", "Two."]);
  });

  test("yields nothing for text holding no words", () => {
    // Given/When/Then - an empty result rather than one empty string
    expect(splitSentences("   ")).toEqual([]);
    expect(splitSentences("")).toEqual([]);
  });
});
