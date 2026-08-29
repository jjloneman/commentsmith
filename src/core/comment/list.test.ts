import { describe, expect, test } from "vitest";

import { parseList, readListKind, renderList } from "./list";

describe("readListKind", () => {
  test("tells the two list markers apart", () => {
    // Given/When/Then
    expect(readListKind("- a bullet")).toBe("bulletList");
    expect(readListKind("1. a step")).toBe("orderedList");
    expect(readListKind("a sentence")).toBeUndefined();
  });

  test("does not read a thematic break as a bullet", () => {
    // Given/When/Then - a rule has no space after its marker run
    expect(readListKind("---")).toBeUndefined();
  });
});

describe("parseList", () => {
  test("hangs a continuation line under its item's content column", () => {
    // Given - an item wrapped across two lines
    const lines = ["- a point that", "  wraps once"];

    // When
    const { block } = parseList({ lines, listKind: "bulletList", start: 0 });

    // Then - the hanging indent is frame, not content
    expect(block.items).toStrictEqual([
      { indent: "", lines: ["a point that", "wraps once"], marker: "-" },
    ]);

    // And - a tight list is the default
    expect(block.isLoose).toBe(false);
  });

  test("reads a blank line between items as looseness, not an ending", () => {
    // Given - the shape this repo writes its own comments in
    const lines = ["- a point", "", "- another point"];

    // When
    const { block, nextIndex } = parseList({
      lines,
      listKind: "bulletList",
      start: 0,
    });

    // Then
    expect(block.isLoose).toBe(true);
    expect(block.items).toHaveLength(2);
    expect(nextIndex).toBe(3);
  });

  test("ends the list when the blank line is followed by prose", () => {
    // Given
    const lines = ["- a point", "", "a paragraph"];

    // When
    const { block, nextIndex } = parseList({
      lines,
      listKind: "bulletList",
      start: 0,
    });

    // Then - the index stops before the blank so the caller re-reads it
    expect(block.items).toHaveLength(1);
    expect(nextIndex).toBe(1);
  });

  test("ends the list when the next item is of the other kind", () => {
    // Given/When
    const { nextIndex } = parseList({
      lines: ["- a bullet", "1. a step"],
      listKind: "bulletList",
      start: 0,
    });

    // Then
    expect(nextIndex).toBe(1);
  });

  test("reads a deeper marker as a nested item rather than a continuation", () => {
    // Given
    const lines = ["- the outer item", "  - the inner item"];

    // When
    const { block } = parseList({ lines, listKind: "bulletList", start: 0 });

    // Then - nesting is carried by the item's own indent, not by a tree
    expect(block.items.map((item) => item.indent)).toStrictEqual(["", "  "]);
  });
});

describe("renderList", () => {
  test("renders a marker alone for an item with no text", () => {
    // Given - an item a transform emptied
    const items = [{ indent: "", lines: [], marker: "-" }];

    // When/Then - no trailing space is left behind the marker
    expect(
      renderList({ isLoose: false, items, type: "bulletList" }),
    ).toStrictEqual(["-"]);
  });

  test("hangs continuation lines under a multi-character marker", () => {
    // Given - an ordered marker is two characters wide, so its hang is three
    const items = [
      { indent: "", lines: ["a step that", "wraps"], marker: "1." },
    ];

    // When/Then
    expect(
      renderList({ isLoose: false, items, type: "orderedList" }),
    ).toStrictEqual(["1. a step that", "   wraps"]);
  });
});
