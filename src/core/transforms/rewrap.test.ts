import { describe, expect, test } from "vitest";

import type { CommentDoc } from "#core/comment/types";

import { renderBody } from "#core/comment/body";
import { parseComment } from "#core/comment/parse";
import { renderComment } from "#core/comment/render";
import { DEFAULT_PRINT_WIDTH } from "#core/config/types";
import { loadCommentFixtures } from "#test/helpers/fixtures";
import { readWordTokens } from "#test/helpers/invariants";

import type { RewrapOptions } from "./rewrap";

import { rewrap } from "./rewrap";

const fixtures = loadCommentFixtures();

/** A width narrow enough to force the corpus to actually reflow. */
const NARROW_WIDTH = 40;

/**
 * Reflow a comment's source text, the way the pipeline would.
 *
 * @returns the rewrapped comment's source text.
 */
const applyRewrap = ({
  printWidth,
  text,
}: {
  /** The column to wrap to. @example 80 */
  printWidth: RewrapOptions["printWidth"];

  /** The comment's source text. @example "// a comment" */
  text: string;
}): string =>
  renderComment(
    rewrap.run({ doc: parseComment(text), options: { printWidth } }),
  );

/**
 * The tokens a reflow must preserve, taken from the body rather than the
 * source — the frame's own delimiters multiply with the line count, which is
 * the one thing wrapping is supposed to change.
 *
 * @returns the body's whitespace-separated tokens.
 */
const bodyWordTokens = (doc: CommentDoc): string[] =>
  readWordTokens(renderBody(doc.body).join("\n"));

describe("rewrap budgets", () => {
  test("counts a line comment's marker against the width", () => {
    // Given/When - four words behind a three-column "// " prefix
    const rewrapped = applyRewrap({
      printWidth: 20,
      text: "// alpha beta gamma delta",
    });

    // Then - the break lands where the rendered line would have passed 20
    expect(rewrapped).toBe("// alpha beta gamma\n// delta");
  });

  test("counts a doc comment's indent and starred prefix against the width", () => {
    // Given - a doc comment indented two columns inside a block
    const source = [
      "  /**",
      "   * alpha beta gamma delta epsilon",
      "   */",
    ].join("\n");

    // When
    const rewrapped = applyRewrap({ printWidth: 20, text: source });

    // Then - both the indent and the " * " come out of the content's budget
    expect(rewrapped).toBe(
      [
        "  /**",
        "   * alpha beta",
        "   * gamma delta",
        "   * epsilon",
        "   */",
      ].join("\n"),
    );
  });

  test("counts a bullet's marker against the width and hangs the rest", () => {
    // Given/When - a bullet whose text outgrows the line
    const rewrapped = applyRewrap({
      printWidth: 24,
      text: "// - alpha beta gamma delta",
    });

    // Then - the continuation hangs under the text, not under the marker
    expect(rewrapped).toBe("// - alpha beta gamma\n//   delta");
  });

  test("budgets a nested item for its own indent", () => {
    // Given - a second item indented under the first
    const source = ["// - alpha", "//   - beta gamma delta"].join("\n");

    // When
    const rewrapped = applyRewrap({ printWidth: 20, text: source });

    // Then - the nested item wraps sooner, by exactly its own indent
    expect(rewrapped).toBe(
      ["// - alpha", "//   - beta gamma", "//     delta"].join("\n"),
    );
  });

  test("budgets an ordered item for its wider marker", () => {
    // Given/When - "1." plus its space is one column wider than "-" plus one
    const rewrapped = applyRewrap({
      printWidth: 20,
      text: "// 1. alpha beta gamma",
    });

    // Then - the hanging indent matches the marker rather than a fixed width
    expect(rewrapped).toBe("// 1. alpha beta\n//    gamma");
  });

  test("gives a tag's first line and its continuations different budgets", () => {
    // Given - a tag whose name eats into the line it starts on
    const source = ["/**", " * @returns alpha beta gamma delta", " */"].join(
      "\n",
    );

    // When
    const rewrapped = applyRewrap({ printWidth: 20, text: source });

    // Then - the first line pays for "@returns ", the rest for the hanging indent
    expect(rewrapped).toBe(
      ["/**", " * @returns alpha", " *   beta gamma", " *   delta", " */"].join(
        "\n",
      ),
    );
  });

  test("degrades to one atom per line rather than looping on a spent budget", () => {
    // Given/When - a width the prefix alone already exceeds
    const rewrapped = applyRewrap({ printWidth: 1, text: "// alpha beta" });

    // Then - it terminates, with each atom overflowing its own line
    expect(rewrapped).toBe("// alpha\n// beta");
  });
});

describe("rewrap block handling", () => {
  test("leaves a fenced block verbatim", () => {
    // Given - a fence whose content is far past the width
    const source = [
      "/**",
      " * ```ts",
      " * const formatted = renderComment(parseComment(source));",
      " * ```",
      " */",
    ].join("\n");

    // When
    const rewrapped = applyRewrap({ printWidth: 12, text: source });

    // Then - reflowing it would rewrite code, so nothing moves
    expect(rewrapped).toBe(source);
  });

  test("leaves a table's rows alone", () => {
    // Given - a table wider than the width it is wrapped against
    const source = [
      "/**",
      " * | Type | Gitmoji | Use for     |",
      " * | ---- | :-----: | ----------- |",
      " * | feat | sparkle | new feature |",
      " * | fix  | wrench  | bug fix     |",
      " */",
    ].join("\n");

    // When
    const rewrapped = applyRewrap({ printWidth: 12, text: source });

    // Then - a table's shape is its meaning; its cells are padded, not wrapped
    expect(rewrapped).toBe(source);
  });

  test("leaves a thematic break alone", () => {
    // Given/When - a rule has no prose to reflow
    const source = ["/**", " * ---", " */"].join("\n");

    // Then
    expect(applyRewrap({ printWidth: 5, text: source })).toBe(source);
  });

  test("keeps a loose list loose", () => {
    // Given/When - blank-separated items, at a width that forces no reflow
    const source = ["// - alpha", "//", "// - beta"].join("\n");

    // Then - the blank lines that make the list loose survive the reflow
    expect(applyRewrap({ printWidth: 40, text: source })).toBe(source);
  });
});

describe("rewrap overflow and framing", () => {
  test("overflows rather than breaking an atom wider than the budget", () => {
    // Given/When - one word no width could hold
    const rewrapped = applyRewrap({
      printWidth: 10,
      text: "// supercalifragilisticexpialidocious ok",
    });

    // Then - it keeps the word intact and takes the long line
    expect(rewrapped).toBe("// supercalifragilisticexpialidocious\n// ok");
  });

  test("keeps a collapsed doc comment collapsed while it still fits", () => {
    // Given/When - a one-line docblock inside the width
    const source = "/** alpha beta */";

    // Then - collapsing was the author's decision and it still holds
    expect(applyRewrap({ printWidth: 20, text: source })).toBe(source);
  });

  test("expands a collapsed doc comment whose one line no longer fits", () => {
    // Given - the same comment against a width its collapsed form overflows
    const source = "/** alpha beta */";

    // When
    const rewrapped = applyRewrap({ printWidth: 14, text: source });

    /*
     * Then - the collapsed line is the one shape whose width is not
     * `indent + linePrefix + content`, so wrapping the body cannot bring it
     * under the column. Expanding is the only way to honor the width.
     */
    expect(rewrapped).toBe(["/**", " * alpha beta", " */"].join("\n"));
  });

  test("does not reflow prose into a list", () => {
    // Given - a dash used as prose punctuation, near where the break falls
    const source = "// aaaaaaaaaaaaaaaaa - bb cc";

    // When
    const once = applyRewrap({ printWidth: 20, text: source });

    // And - the output is fed back through
    const twice = applyRewrap({ printWidth: 20, text: once });

    /*
     * Then - the dash never leads a line, so the next parse still reads one
     * paragraph. Left alone it becomes a bullet list, and the pass after that
     * inserts a blank line above it.
     */
    expect(once).toBe("// aaaaaaaaaaaaaaaaa -\n// bb cc");
    expect(twice).toBe(once);
  });

  test("does not reflow a list item into a nested one", () => {
    // Given - the same hazard inside a bullet, where it splits the item in two
    const source = "// - aaaaaaaaaaaaaaa - bb cc dd ee ff";

    // When
    const once = applyRewrap({ printWidth: 20, text: source });

    // And
    const twice = applyRewrap({ printWidth: 20, text: once });

    // Then - one item stays one item, and the reflow settles on the first pass
    expect(once).toBe("// - aaaaaaaaaaaaaaa -\n//   bb cc dd ee ff");
    expect(twice).toBe(once);
  });

  test("does not reflow prose into a thematic break", () => {
    // Given - a dash run opening a paragraph, which is prose until it is alone
    const source = "// --- alpha beta gamma";

    // When
    const once = applyRewrap({ printWidth: 10, text: source });

    // And
    const twice = applyRewrap({ printWidth: 10, text: once });

    /*
     * Then - the marker never ends up alone on its line. A thematic break is
     * anchored to the end of its line, so this is the one construct a *prefix*
     * of a safe line can turn into.
     */
    expect(once.split("\n")[0]).toBe("// --- alpha");
    expect(twice).toBe(once);
  });

  test("does not manufacture a table out of prose containing pipes", () => {
    // Given - pipes in prose, positioned so a greedy fill would stack them
    const source = "// | a | | --- | rest of it here";

    // When
    const once = applyRewrap({ printWidth: 12, text: source });

    // And
    const twice = applyRewrap({ printWidth: 12, text: once });

    /*
     * Then - no pipe line lands directly under another. A table is the one
     * block recognized from a pair of lines, so wrapping is the only thing
     * that could ever build one by accident.
     */
    expect(twice).toBe(once);
    expect(once).not.toContain("|\n// |");
  });

  test("leaves an @example tag's code verbatim", () => {
    // Given - a tag whose body is a code sample rather than prose
    const source = [
      "/**",
      " * @example runPipeline({ config, doc, registry })",
      " */",
    ].join("\n");

    // When
    const rewrapped = applyRewrap({ printWidth: 20, text: source });

    // Then - reflowing it would break the sample, exactly as for a code fence
    expect(rewrapped).toBe(source);
  });

  test("keeps an empty collapsed comment collapsed when it fits exactly", () => {
    /*
     * Given/When/Then - an empty body renders with one space between the
     * delimiters, not two, so this fits in six columns and must not expand.
     */
    expect(applyRewrap({ printWidth: 6, text: "/** */" })).toBe("/** */");
  });

  test("cannot join two lines into a block terminator", () => {
    // Given - a star ending one line and a slash opening the next
    const source = ["// alpha *", "// /beta"].join("\n");

    // When
    const rewrapped = applyRewrap({ printWidth: 40, text: source });

    // Then - joining always inserts a space, so the sequence cannot appear
    expect(rewrapped).toBe("// alpha * /beta");
    expect(rewrapped).not.toContain("*/");
  });

  test("preserves CRLF endings", () => {
    // Given - a comment as it appears in a CRLF file
    const source = "// alpha beta\r\n// gamma delta";

    // When
    const rewrapped = applyRewrap({ printWidth: 20, text: source });

    // Then - the reflow re-splits on the ending it found, not on a line feed
    expect(rewrapped).toBe("// alpha beta gamma\r\n// delta");
  });
});

describe("rewrap invariants", () => {
  test("the corpus is not empty", () => {
    // Given/When/Then - an empty glob would make every property below vacuous
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test.each(fixtures)(
    "is idempotent over $name at a narrow width",
    ({ text }) => {
      // Given - a width narrow enough that the corpus genuinely reflows
      const once = applyRewrap({ printWidth: NARROW_WIDTH, text });

      // When - the output is fed back through
      const twice = applyRewrap({ printWidth: NARROW_WIDTH, text: once });

      // Then - wrapping settles on the first pass
      expect(twice).toBe(once);
    },
  );

  test.each(fixtures)(
    "is idempotent over $name at the default width",
    ({ text }) => {
      // Given/When - the width the corpus is already written to
      const once = applyRewrap({ printWidth: DEFAULT_PRINT_WIDTH, text });
      const twice = applyRewrap({
        printWidth: DEFAULT_PRINT_WIDTH,
        text: once,
      });

      // Then
      expect(twice).toBe(once);
    },
  );

  test.each(fixtures)("loses no word of $name", ({ text }) => {
    // Given - the comment's body before anything reflows it
    const before = parseComment(text);

    // When - it is wrapped tightly enough to move most of its breaks
    const after = rewrap.run({
      doc: before,
      options: { printWidth: NARROW_WIDTH },
    });

    // Then - only whitespace moved; every token survives in order
    expect(bodyWordTokens(after)).toEqual(bodyWordTokens(before));
  });
});
