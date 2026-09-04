import type {
  Block,
  CodeFence,
  Paragraph,
  TagSection,
  ThematicBreak,
} from "./types";

import { parseList, readListKind, renderList } from "./list";
import { isTableRow, isTableStart, parseTable, renderTable } from "./table";

/**
 * The body layer — a comment's contents, segmented into blocks.
 *
 * - This module never sees a delimiter or an indent. Everything it receives has
 *   already had its frame stripped, which is what lets reframing and
 *   restructuring compose rather than special-case each other.
 *
 * - Blocks are separated by exactly one blank line on render. Source with two
 *   blank lines between blocks is outside canonical form and collapses, which
 *   is the documented boundary of the round-trip guarantee.
 */

/** A fence opener, capturing the fence run and its info string. */
const CODE_FENCE = /^(?<fence>`{3,}|~{3,})(?<info>.*)$/;

/**
 * A JSDoc tag at the start of a line, and whatever follows it.
 *
 * - The lookahead is load-bearing. Without it a scoped package or an ESLint
 *   rule name opening a line — `@anthropic-ai/sdk`, `@typescript-eslint/…` —
 *   parses as a tag whose text starts at the slash, and rendering rejoins them
 *   with a space that the author never wrote.
 *
 * - `\p{Letter}` rather than `[A-Za-z]` because a tag name is prose: a French
 *   or Japanese codebase writing `@paramètre` should get a tag, not a
 *   paragraph. The sibling patterns keep `\s` and `\d`, which are the right
 *   tools there — `\s` is already Unicode-aware, and a Markdown ordered-list
 *   marker really is ASCII digits, so `\p{Decimal_Number}` would admit markers
 *   no renderer treats as a list.
 */
const JSDOC_TAG =
  /^(?<name>@\p{Letter}[\p{Letter}\p{Decimal_Number}_-]*)(?=\s|$)(?<text>.*)$/u;

/**
 * The indent a tag's continuation lines hang at.
 *
 * - Exported so a transform can budget for it rather than re-spelling the
 *   width, which is how the two would drift apart.
 */
export const TAG_HANGING_INDENT = "  ";

/** A rule made of dashes, asterisks, or underscores. */
const THEMATIC_BREAK = /^(?<marker>-{3,}|\*{3,}|_{3,})\s*$/;

/** One block and the index just past it. */
type ParsedBlock = {
  /** The block that was read. */
  block: Block;

  /** Where the next block starts. @example 3 */
  nextIndex: number;
};

/** Whether a fence line closes a run opened with `fence`. */
const isClosingFence = ({
  fence,
  line,
}: {
  /** The opening fence run. @example "```" */
  fence: string;

  /** The candidate closing line. @example "```" */
  line: string;
}): boolean => {
  const closing = CODE_FENCE.exec(line.trim());

  return (
    closing !== null &&
    closing.groups!.fence[0] === fence[0] &&
    closing.groups!.fence.length >= fence.length &&
    closing.groups!.info.trim() === ""
  );
};

/**
 * Parse a fenced block, or nothing when the fence never closes.
 *
 * - An unclosed fence falls back to a paragraph rather than inventing a closing
 *   fence, because inventing one would silently add a line the author never
 *   wrote.
 *
 * @returns the fence, or `undefined` when it is unterminated.
 */
const parseCodeFence = ({
  lines,
  opening,
  start,
}: {
  /** Every body line. */
  lines: string[];

  /** The already-matched opening fence, passed in so it is matched once. */
  opening: RegExpExecArray;

  /** Index of the opening fence. @example 0 */
  start: number;
}): ParsedBlock | undefined => {
  const { fence, info } = opening.groups!;
  const content: string[] = [];

  let index = start + 1;

  while (
    index < lines.length &&
    !isClosingFence({ fence, line: lines[index] })
  ) {
    content.push(lines[index]);
    index += 1;
  }

  if (index >= lines.length) {
    return undefined;
  }

  const block: CodeFence = { fence, info, lines: content, type: "codeFence" };

  return { block, nextIndex: index + 1 };
};

/** Parse a run of consecutive JSDoc tags. */
const parseTagSection = ({
  lines,
  start,
}: {
  /** Every body line. */
  lines: string[];

  /** Index of the first tag. @example 0 */
  start: number;
}): ParsedBlock => {
  const block: TagSection = { tags: [], type: "tagSection" };

  let index = start;
  let match = JSDOC_TAG.exec(lines[index]);

  while (match !== null) {
    const { name, text } = match.groups!;
    const firstLine = text.startsWith(" ") ? text.slice(1) : text;
    const tagLines = firstLine === "" ? [] : [firstLine];

    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      lines[index].startsWith(" ")
    ) {
      tagLines.push(
        lines[index].startsWith(TAG_HANGING_INDENT)
          ? lines[index].slice(TAG_HANGING_INDENT.length)
          : lines[index].trimStart(),
      );

      index += 1;
    }

    block.tags.push({ lines: tagLines, name });
    match = index < lines.length ? JSDOC_TAG.exec(lines[index]) : null;
  }

  return { block, nextIndex: index };
};

/**
 * Whether a line, read on its own, opens a block other than a paragraph.
 *
 * - Exported because a transform that moves line breaks has to know which text
 *   changes meaning at the start of a line. Reflowing a paragraph can push a
 *   `-` from mid-sentence to column zero, and prose silently becomes a list on
 *   the next parse — so the wrapper asks the parser rather than keeping its own
 *   copy of these rules.
 *
 * - A table is deliberately absent: it is recognized from its delimiter row,
 *   so no single line opens one.
 *
 * @returns `true` when the line would be read as a block opener.
 * @example opensBlock("- a bullet") // true
 */
export const opensBlock = (line: string): boolean =>
  CODE_FENCE.test(line) ||
  THEMATIC_BREAK.test(line) ||
  JSDOC_TAG.test(line) ||
  readListKind(line) !== undefined;

/**
 * Stands in for whatever text might follow, when probing a line's opening.
 *
 * - A list marker opens a list only when something follows it, so asking
 *   whether a bare `-` opens a block answers the wrong question.
 */
const FOLLOWING_TEXT_PROBE = "x";

/**
 * Whether beginning a line with this text could change what the body parses as.
 *
 * - This is {@link opensBlock}'s question asked from a transform's side, and it
 *   is deliberately wider in two ways. It probes with a following word, because
 *   a marker alone opens nothing but a marker with text after it does. And it
 *   rejects a leading pipe, because a table is recognized from a **pair** of
 *   lines — so a reflow that puts one pipe line under another manufactures a
 *   table, which no single-line predicate can see coming.
 *
 * - Conservative on purpose: a caller cannot know at break time what else will
 *   land on the line. The cost of a false positive is a line kept one atom
 *   longer than it had to be; the cost of a false negative is prose silently
 *   becoming a list.
 *
 * @returns `true` when starting a line with this text would risk a new block.
 * @example couldOpenBlock("-") // true
 */
export const couldOpenBlock = (text: string): boolean =>
  isTableRow(text) ||
  opensBlock(text) ||
  opensBlock(`${text} ${FOLLOWING_TEXT_PROBE}`);

/** Whether a line opens a block other than a paragraph, tables included. */
const startsBlock = ({
  index,
  lines,
}: {
  /** The line to classify. @example 2 */
  index: number;

  /** Every body line. */
  lines: string[];
}): boolean => opensBlock(lines[index]) || isTableStart({ index, lines });

/** Parse prose up to the next blank line or block opener. */
const parseParagraph = ({
  lines,
  start,
}: {
  /** Every body line. */
  lines: string[];

  /** Index of the paragraph's first line. @example 0 */
  start: number;
}): ParsedBlock => {
  const content = [lines[start]];

  let index = start + 1;

  while (
    index < lines.length &&
    lines[index].trim() !== "" &&
    !startsBlock({ index, lines })
  ) {
    content.push(lines[index]);
    index += 1;
  }

  const block: Paragraph = { lines: content, type: "paragraph" };

  return { block, nextIndex: index };
};

/** Read whichever block starts at `start`. */
const parseNextBlock = ({
  lines,
  start,
}: {
  /** Every body line. */
  lines: string[];

  /** Where the block starts. @example 0 */
  start: number;
}): ParsedBlock => {
  const line = lines[start];

  const opening = CODE_FENCE.exec(line);

  if (opening !== null) {
    const fenced = parseCodeFence({ lines, opening, start });

    if (fenced !== undefined) {
      return fenced;
    }
  }

  const rule = THEMATIC_BREAK.exec(line);

  if (rule !== null) {
    const block: ThematicBreak = {
      marker: rule.groups!.marker,
      type: "thematicBreak",
    };

    return { block, nextIndex: start + 1 };
  }

  if (isTableStart({ index: start, lines })) {
    return parseTable({ lines, start });
  }

  if (JSDOC_TAG.test(line)) {
    return parseTagSection({ lines, start });
  }

  const listKind = readListKind(line);

  if (listKind !== undefined) {
    return parseList({ lines, listKind, start });
  }

  return parseParagraph({ lines, start });
};

/**
 * Segment a comment's content lines into blocks.
 *
 * - Blank lines are separators, not content, so they carry no block of their
 *   own and are re-inserted on render.
 *
 * @returns the body's blocks, in source order.
 * @example parseBody(["a sentence"]) // [{ lines: ["a sentence"], type: "paragraph" }]
 */
export const parseBody = (lines: string[]): Block[] => {
  const blocks: Block[] = [];

  let index = 0;

  while (index < lines.length) {
    if (lines[index].trim() === "") {
      index += 1;
      continue;
    }

    const parsed = parseNextBlock({ lines, start: index });

    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }

  return blocks;
};

/** Render one block back to its lines. */
const renderBlock = (block: Block): string[] => {
  switch (block.type) {
    case "bulletList":
    case "orderedList":
      return renderList(block);

    case "codeFence":
      return [`${block.fence}${block.info}`, ...block.lines, block.fence];

    case "paragraph":
      return block.lines;

    case "table":
      return renderTable(block);

    case "tagSection":
      return block.tags.flatMap((tag) => {
        const [firstLine, ...continuation] = tag.lines;

        return [
          firstLine === undefined ? tag.name : `${tag.name} ${firstLine}`,
          ...continuation.map((line) => `${TAG_HANGING_INDENT}${line}`),
        ];
      });

    case "thematicBreak":
      return [block.marker];
  }
};

/**
 * Render a body's blocks, separated by exactly one blank line.
 *
 * @returns the content lines, ready for the frame to wrap.
 * @example renderBody([{ lines: ["a sentence"], type: "paragraph" }]) // ["a sentence"]
 */
export const renderBody = (blocks: Block[]): string[] =>
  blocks.flatMap((block, index) =>
    index === 0 ? renderBlock(block) : ["", ...renderBlock(block)],
  );
