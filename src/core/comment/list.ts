import type { BulletList, ListItem, OrderedList } from "./types";

/**
 * Bullet and ordered list items.
 *
 * - Items are a **flat** list carrying their own `indent` rather than a tree.
 *   Nesting is still representable, no transform yet needs to walk a hierarchy,
 *   and a tree would be structure added ahead of a call site that wants it.
 */

/** A `-`, `*`, or `+` item: indent, marker, gap, then its first line. */
const BULLET_ITEM = /^(?<indent>\s*)(?<marker>[-*+])(?<gap> +)(?<text>.*)$/;

/** A numbered item, whose marker ends in a dot or a parenthesis. */
const ORDERED_ITEM =
  /^(?<indent>\s*)(?<marker>\d{1,9}[.)])(?<gap> +)(?<text>.*)$/;

/** Which list a line opens, or `undefined` when it opens neither. */
export type ListKind = BulletList["type"] | OrderedList["type"];

const ITEM_PATTERNS: Record<ListKind, RegExp> = {
  bulletList: BULLET_ITEM,
  orderedList: ORDERED_ITEM,
};

/** How many characters of leading whitespace a line has. */
const indentLength = (line: string): number =>
  line.length - line.trimStart().length;

/**
 * Which kind of list item a line is, if any.
 *
 * @returns the list kind, or `undefined` when the line is not an item.
 * @example readListKind("- a bullet") // "bulletList"
 */
export const readListKind = (line: string): ListKind | undefined => {
  if (ORDERED_ITEM.test(line)) {
    return "orderedList";
  }

  return BULLET_ITEM.test(line) ? "bulletList" : undefined;
};

/**
 * Parse one run of list items of a single kind.
 *
 * - A blank line between items keeps the list going and marks it **loose**;
 *   anything else after the blank ends it. That is Markdown's own tight/loose
 *   distinction, and the shape this repo writes its own comments in.
 *
 * @returns the list and the index just past it.
 * @example parseList({ lines: ["- a"], listKind: "bulletList", start: 0 })
 */
export const parseList = ({
  lines,
  listKind,
  start,
}: {
  /** Every body line. @example ["- a", "- b"] */
  lines: string[];

  /** Which item pattern to read. @example "bulletList" */
  listKind: ListKind;

  /** Index of the line opening the list. @example 0 */
  start: number;
}): { block: BulletList | OrderedList; nextIndex: number } => {
  const pattern = ITEM_PATTERNS[listKind];
  const items: ListItem[] = [];

  let index = start;
  let isLoose = false;
  let match = pattern.exec(lines[index]);

  while (match !== null) {
    const { gap, indent, marker, text } = match.groups!;
    const contentColumn = indent.length + marker.length + gap.length;
    const itemLines = [text];

    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      lines[index].startsWith(" ") &&
      readListKind(lines[index]) === undefined
    ) {
      itemLines.push(
        lines[index].slice(Math.min(contentColumn, indentLength(lines[index]))),
      );

      index += 1;
    }

    items.push({ indent, lines: itemLines, marker });

    let lookahead = index;
    let sawBlank = false;

    while (lookahead < lines.length && lines[lookahead].trim() === "") {
      sawBlank = true;
      lookahead += 1;
    }

    if (
      lookahead >= lines.length ||
      readListKind(lines[lookahead]) !== listKind
    ) {
      break;
    }

    isLoose = isLoose || sawBlank;
    index = lookahead;
    match = pattern.exec(lines[index]);
  }

  return { block: { isLoose, items, type: listKind }, nextIndex: index };
};

/**
 * The indent an item's continuation lines hang at.
 *
 * - The marker and the space after it are what the continuation lines have to
 *   clear, so the hanging width is derived from the marker rather than fixed.
 *   Exported so a transform can budget for it instead of re-deriving it, which
 *   is how the two would drift apart.
 *
 * @returns the whitespace continuation lines are indented by.
 * @example listHangingIndent({ indent: "", lines: [], marker: "-" }) // "  "
 */
export const listHangingIndent = (item: ListItem): string =>
  " ".repeat(item.marker.length + 1);

/** Render one item, hanging its continuation lines under its first. */
const renderItem = (item: ListItem): string[] => {
  const hanging = listHangingIndent(item);
  const [firstLine, ...continuation] = item.lines;

  return [
    firstLine === undefined || firstLine === ""
      ? `${item.indent}${item.marker}`
      : `${item.indent}${item.marker} ${firstLine}`,
    ...continuation.map((line) => `${item.indent}${hanging}${line}`),
  ];
};

/**
 * Render a list, blank-separating its items when it is loose.
 *
 * @returns the list's lines.
 * @example renderList({ isLoose: false, items, type: "bulletList" })
 */
export const renderList = (list: BulletList | OrderedList): string[] =>
  list.isLoose
    ? list.items.flatMap((item, index) =>
        index === 0 ? renderItem(item) : ["", ...renderItem(item)],
      )
    : list.items.flatMap(renderItem);
