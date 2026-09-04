import type { Table, TableAlignment } from "./types";

/**
 * Pipe tables.
 *
 * - Columns are padded to their widest cell, which is what makes the round trip
 *   hold: a canonical table renders back byte for byte, and a ragged one is
 *   tidied rather than preserved.
 *
 * - Width is counted in **code points, not terminal columns**. A full-width
 *   character therefore pads narrower than it displays; getting that right
 *   needs an east-asian-width table, and adding a dependency for it is a
 *   decision the release moratorium makes deliberate rather than incidental.
 */

/** One delimiter cell, with optional alignment colons. */
const DELIMITER_CELL = /^:?-+:?$/;

/** The narrowest a column may render, so an alignment marker always fits. */
const MINIMUM_COLUMN_WIDTH = 3;

/** Any line that could be a table row. */
const TABLE_ROW = /^\s*\|/;

/**
 * Whether a line could serve as a table's row or its delimiter line.
 *
 * - Exported for the wrapper rather than for the parser: a table is the one
 *   block recognized from a *pair* of lines, so a reflow that puts a pipe line
 *   under another one manufactures a table nobody wrote.
 *
 * @returns `true` when the line begins a pipe-delimited row.
 * @example isTableRow("| a | b |") // true
 */
export const isTableRow = (line: string): boolean => TABLE_ROW.test(line);

/** Split a row into trimmed cells, dropping its outer pipes. */
const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

/** Whether a line is the `---` row that turns two rows into a table. */
const isDelimiterRow = (line: string): boolean => {
  if (!line.includes("|")) {
    return false;
  }

  const cells = splitRow(line);

  return cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell));
};

/**
 * Whether a table starts at `index`.
 *
 * - Requiring the delimiter row to contain a pipe is what keeps a thematic
 *   break from being read as one.
 *
 * @returns `true` when this line and the next open a table.
 * @example isTableStart({ index: 0, lines: ["| a |", "| - |"] }) // true
 */
export const isTableStart = ({
  index,
  lines,
}: {
  /** The candidate header row's index. @example 0 */
  index: number;

  /** Every body line. */
  lines: string[];
}): boolean =>
  TABLE_ROW.test(lines[index]) &&
  index + 1 < lines.length &&
  isDelimiterRow(lines[index + 1]);

/** Read one column's alignment from its delimiter cell. */
const readAlignment = (cell: string): TableAlignment => {
  const isLeft = cell.startsWith(":");
  const isRight = cell.endsWith(":");

  if (isLeft && isRight) {
    return "center";
  }

  if (isLeft) {
    return "left";
  }

  return isRight ? "right" : "default";
};

/** Force a row to the header's column count. */
const toColumnCount = ({
  cells,
  count,
}: {
  /** The row's cells as parsed. @example ["a"] */
  cells: string[];

  /** The header's column count. @example 2 */
  count: number;
}): string[] =>
  Array.from({ length: count }, (_unused, column) => cells[column] ?? "");

/**
 * Parse a pipe table.
 *
 * @returns the table and the index just past it.
 * @example parseTable({ lines: ["| a |", "| - |"], start: 0 })
 */
export const parseTable = ({
  lines,
  start,
}: {
  /** Every body line. */
  lines: string[];

  /** Index of the header row. @example 0 */
  start: number;
}): { block: Table; nextIndex: number } => {
  const header = splitRow(lines[start]);

  const alignments = toColumnCount({
    cells: splitRow(lines[start + 1]),
    count: header.length,
  }).map(readAlignment);

  const rows: string[][] = [];

  let index = start + 2;

  while (index < lines.length && TABLE_ROW.test(lines[index])) {
    rows.push(
      toColumnCount({ cells: splitRow(lines[index]), count: header.length }),
    );

    index += 1;
  }

  return {
    block: { alignments, header, rows, type: "table" },
    nextIndex: index,
  };
};

/** A cell's width in code points. */
const cellWidth = (cell: string): number => [...cell].length;

/** Pad a cell out to a column's width. */
const padCell = ({
  cell,
  width,
}: {
  /** The cell's text. @example "feat" */
  cell: string;

  /** The column's rendered width. @example 6 */
  width: number;
}): string => `${cell}${" ".repeat(Math.max(0, width - cellWidth(cell)))}`;

const DELIMITER_RENDERERS: Record<TableAlignment, (width: number) => string> = {
  center: (width) => `:${"-".repeat(width - 2)}:`,
  default: (width) => "-".repeat(width),
  left: (width) => `:${"-".repeat(width - 1)}`,
  right: (width) => `${"-".repeat(width - 1)}:`,
};

/**
 * Render a table with every column padded to its widest cell.
 *
 * @returns the table's lines, header first.
 * @example renderTable({ alignments: ["default"], header: ["a"], rows: [], type: "table" })
 */
export const renderTable = (table: Table): string[] => {
  const widths = table.header.map((cell, column) =>
    Math.max(
      MINIMUM_COLUMN_WIDTH,
      cellWidth(cell),
      ...table.rows.map((row) => cellWidth(row[column])),
    ),
  );

  const renderRow = (cells: string[]): string =>
    `| ${cells.map((cell, column) => padCell({ cell, width: widths[column] })).join(" | ")} |`;

  const delimiter = `| ${widths
    .map((width, column) =>
      DELIMITER_RENDERERS[table.alignments[column]](width),
    )
    .join(" | ")} |`;

  return [renderRow(table.header), delimiter, ...table.rows.map(renderRow)];
};
