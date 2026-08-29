import { describe, expect, test } from "vitest";

import { parseBody, renderBody } from "./body";

describe("parseBody", () => {
  test("treats blank lines as separators rather than content", () => {
    // Given/When
    const blocks = parseBody(["a lead", "", "a follow-up"]);

    // Then - two paragraphs, and the blank belongs to neither
    expect(blocks).toStrictEqual([
      { lines: ["a lead"], type: "paragraph" },
      { lines: ["a follow-up"], type: "paragraph" },
    ]);
  });

  test("ends a paragraph at the line that opens another block", () => {
    // Given - prose running straight into a list with no blank between
    const blocks = parseBody(["a lead", "- a bullet"]);

    // When/Then
    expect(blocks.map((block) => block.type)).toStrictEqual([
      "paragraph",
      "bulletList",
    ]);
  });

  test("keeps a fence's contents from being re-read as other blocks", () => {
    // Given - fenced lines that would otherwise parse as a list and a rule
    const lines = ["```sh", "- not a bullet", "---", "```"];

    // When
    const blocks = parseBody(lines);

    // Then
    expect(blocks).toStrictEqual([
      {
        fence: "```",
        info: "sh",
        lines: ["- not a bullet", "---"],
        type: "codeFence",
      },
    ]);
  });

  test("falls back to a paragraph when a fence never closes", () => {
    // Given - an unclosed fence, where inventing a closer would add a line the
    // author never wrote
    const blocks = parseBody(["```ts", "const x = 1;"]);

    // When/Then
    expect(blocks).toStrictEqual([
      { lines: ["```ts", "const x = 1;"], type: "paragraph" },
    ]);
  });

  test("closes a fence only on a bare run of its own character", () => {
    // Given - a tilde fence, closed by a longer tilde run
    const blocks = parseBody(["~~~", "text", "~~~~"]);

    // When/Then - a backtick run would not have closed it
    expect(blocks).toStrictEqual([
      { fence: "~~~", info: "", lines: ["text"], type: "codeFence" },
    ]);
  });

  test("reads a run of tags as one section", () => {
    // Given - tags with a wrapped one among them
    const lines = [
      "@param channel - the channel to write to.",
      "@returns a sink that forwards to whatever sink is",
      "  active at call time.",
      "@internal",
    ];

    // When
    const blocks = parseBody(lines);

    // Then - a tag with no text carries no lines at all
    expect(blocks).toStrictEqual([
      {
        tags: [
          {
            lines: ["channel - the channel to write to."],
            name: "@param",
          },
          {
            lines: [
              "a sink that forwards to whatever sink is",
              "active at call time.",
            ],
            name: "@returns",
          },
          { lines: [], name: "@internal" },
        ],
        type: "tagSection",
      },
    ]);
  });

  test("takes a continuation line indented less than the hanging column", () => {
    // Given - a tag whose wrap the author under-indented
    const blocks = parseBody(["@returns a value that", " wraps short"]);

    // When/Then - it still belongs to the tag, at the canonical hang
    expect(blocks).toStrictEqual([
      {
        tags: [{ lines: ["a value that", "wraps short"], name: "@returns" }],
        type: "tagSection",
      },
    ]);
  });

  test("leaves an at-sign that is not a tag alone", () => {
    // Given - a scoped package and an ESLint rule name, which are ordinary
    // prose despite starting with an at-sign
    const lines = [
      "@anthropic-ai/sdk is the package.",
      "@typescript-eslint/no-explicit-any is disabled below.",
    ];

    // When
    const blocks = parseBody(lines);

    // Then - reading these as tags would rejoin name and text with a space the
    // author never wrote
    expect(blocks).toStrictEqual([{ lines, type: "paragraph" }]);
  });

  test("starts a new section when tags are separated by a blank line", () => {
    // Given/When - which is why no tight/loose flag is needed on a section
    const blocks = parseBody(["@alpha", "", "@beta"]);

    // Then
    expect(blocks).toHaveLength(2);
  });

  test("keeps a rule as written rather than normalizing its marker", () => {
    // Given/When
    const blocks = parseBody(["***"]);

    // Then - a rule written with asterisks does not come back as dashes
    expect(blocks).toStrictEqual([{ marker: "***", type: "thematicBreak" }]);
  });
});

describe("renderBody", () => {
  test("separates blocks with exactly one blank line", () => {
    // Given
    const blocks = parseBody(["a lead", "", "", "a follow-up"]);

    // When/Then - two blank lines collapse to one, which is the documented
    // edge of the round-trip guarantee
    expect(renderBody(blocks)).toStrictEqual(["a lead", "", "a follow-up"]);
  });

  test("renders every block type it can parse", () => {
    // Given - one of each, so a new block type cannot be added without a
    // renderer arm
    const lines = [
      "a paragraph",
      "",
      "- a bullet",
      "",
      "1. a step",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "| a   | b   |",
      "| --- | --- |",
      "",
      "@returns nothing",
      "@internal",
      "",
      "---",
    ];

    // When/Then
    expect(renderBody(parseBody(lines))).toStrictEqual(lines);
  });
});
