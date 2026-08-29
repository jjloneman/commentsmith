import { describe, expect, test } from "vitest";

import { isTableStart, parseTable, renderTable } from "./table";

describe("isTableStart", () => {
  test("needs a delimiter row under the header", () => {
    // Given/When/Then
    expect(isTableStart({ index: 0, lines: ["| a | b |", "| - | - |"] })).toBe(
      true,
    );
  });

  test("does not read a thematic break as a delimiter row", () => {
    // Given/When/Then - requiring a pipe is what keeps a rule from qualifying
    expect(isTableStart({ index: 0, lines: ["| a |", "---"] })).toBe(false);
  });

  test("does not run off the end of the body", () => {
    // Given/When/Then - a header row with nothing under it is just prose
    expect(isTableStart({ index: 0, lines: ["| a |"] })).toBe(false);
  });
});

describe("parseTable", () => {
  test("reads every alignment the delimiter row can declare", () => {
    // Given
    const lines = ["| w | x | y | z |", "| - | :- | -: | :-: |"];

    // When
    const { block } = parseTable({ lines, start: 0 });

    // Then
    expect(block.alignments).toStrictEqual([
      "default",
      "left",
      "right",
      "center",
    ]);
  });

  test("pads a short row out to the header's column count", () => {
    // Given - a row the author left ragged
    const lines = ["| a | b |", "| - | - |", "| only |"];

    // When
    const { block, nextIndex } = parseTable({ lines, start: 0 });

    // Then - rows stay positionally aligned with the header
    expect(block.rows).toStrictEqual([["only", ""]]);
    expect(nextIndex).toBe(3);
  });
});

describe("renderTable", () => {
  test("pads every column to its widest cell", () => {
    // Given - a ragged table, which canonical padding tidies
    const { block } = parseTable({
      lines: ["|a|b|", "|-|-|", "|a much wider cell|x|"],
      start: 0,
    });

    // When
    const rendered = renderTable(block);

    // Then
    expect(rendered).toStrictEqual([
      "| a                 | b   |",
      "| ----------------- | --- |",
      "| a much wider cell | x   |",
    ]);
  });

  test("renders each alignment's colons", () => {
    // Given
    const { block } = parseTable({
      lines: ["| w | x | y | z |", "| - | :- | -: | :-: |"],
      start: 0,
    });

    // When/Then - the colons are what a Markdown renderer reads the alignment
    // from, so they have to survive the round trip
    expect(renderTable(block)[1]).toBe("| --- | :-- | --: | :-: |");
  });
});
