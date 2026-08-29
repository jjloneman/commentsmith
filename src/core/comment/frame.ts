import type { CommentFrame } from "./types";

import { CommentParseError } from "./errors";

/**
 * The frame layer — the delimiters and per-line markers around a body.
 *
 * - This module knows nothing about blocks, and the body layer knows nothing
 *   about delimiters. That independence is the point of the two-layer
 *   intermediate representation:
 *   reframing and restructuring compose because neither can reach into the
 *   other.
 *
 * - Prefixes are captured as literal strings rather than derived from `kind`,
 *   so rendering is concatenation and the round trip needs no normalization
 *   pass.
 */

const BLOCK_CLOSER = "*/";

/**
 * A block opener, preferring the doc form.
 *
 * - The lookahead keeps a degenerate empty block comment from being read as a
 *   doc comment whose body starts with a slash.
 */
const BLOCK_OPENER = /^(?<open>\/\*\*(?!\/)|\/\*)/;

/** The starred prefix and closer a collapsed doc comment expands into. */
const DEFAULT_STARRED_CLOSER = ` ${BLOCK_CLOSER}`;
const DEFAULT_STARRED_PREFIX = " * ";

/** Leading slashes of a line comment, however many were written. */
const LINE_MARKER = /^(?<marker>\/{2,})/;

/**
 * A body line's alignment space, asterisk, and the single space after it.
 *
 * - Deliberately group-free: only the whole match is ever read, and a capture
 *   nothing consumes is a claim about intent that the code does not keep.
 */
const STARRED_PREFIX = /^\s*\* ?/;

/** A frame paired with the body lines it was stripped from. */
export type ParsedFrame = {
  /** The body's lines, with indent and per-line prefix removed. */
  contentLines: string[];

  /** The delimiters and markers those lines were wrapped in. */
  frame: CommentFrame;
};

/** The leading whitespace of a line. */
const readIndent = (line: string): string =>
  line.slice(0, line.length - line.trimStart().length);

/** Drop the frame's indent from a line, tolerating a line indented less. */
const stripIndent = ({
  indent,
  line,
}: {
  /** The frame's indent. @example "  " */
  indent: string;

  /** The raw source line. @example "   * text" */
  line: string;
}): string =>
  line.startsWith(indent) ? line.slice(indent.length) : line.trimStart();

/** The longest leading whitespace shared by every value. */
const commonIndent = (values: string[]): string =>
  values.reduce((shared, value) => {
    const candidate = readIndent(value);

    let length = 0;

    while (
      length < shared.length &&
      length < candidate.length &&
      shared[length] === candidate[length]
    ) {
      length += 1;
    }

    return shared.slice(0, length);
  }, readIndent(values[0]));

/** Strip one body line's prefix, given how the block was framed. */
const readContent = ({
  isStarred,
  linePrefix,
  rest,
}: {
  /** Whether body lines carry an asterisk marker. @example true */
  isStarred: boolean;

  /** The frame's per-line prefix. @example " * " */
  linePrefix: string;

  /** The line with the frame's indent already removed. @example "* text" */
  rest: string;
}): string => {
  if (rest.trim() === "") {
    return "";
  }

  if (isStarred) {
    const starred = STARRED_PREFIX.exec(rest);

    return starred === null ? rest : rest.slice(starred[0].length);
  }

  // Unstarred bodies take the indent every populated line shares, so each of
  // them starts with it by construction.
  return rest.slice(linePrefix.length);
};

/** Parse a stack of line comments, whose opener repeats on every line. */
const parseLineFrame = ({
  indent,
  lines,
  marker,
}: {
  /** Leading whitespace of the first line. @example "  " */
  indent: string;

  /** Every source line of the stack. */
  lines: string[];

  /** The slash run each line repeats. @example "//" */
  marker: string;
}): ParsedFrame => {
  const rests = lines.map((line) => {
    const trimmed = line.trimStart();

    // Comparing the whole marker run, not just its start, so a stack that
    // *grows* its marker is rejected as loudly as one that shrinks. Letting the
    // extra slashes through as content re-prefixes them into mangled text.
    if (LINE_MARKER.exec(trimmed)?.groups?.marker !== marker) {
      throw new CommentParseError(
        `line comment stack changes marker at ${JSON.stringify(line)}`,
      );
    }

    return trimmed.slice(marker.length);
  });

  const hasSeparator = rests.some((rest) => rest.startsWith(" "));

  return {
    contentLines: rests.map((rest) =>
      rest.startsWith(" ") ? rest.slice(1) : rest,
    ),
    frame: {
      close: "",
      indent,
      isSingleLine: false,
      kind: "line",
      linePrefix: hasSeparator ? `${marker} ` : marker,
      open: marker,
    },
  };
};

/** Parse a block or doc comment that opens and closes on the same line. */
const parseCollapsedBlockFrame = ({
  afterIndent,
  indent,
  open,
}: {
  /** The first line with its indent removed. @example "/** text star-slash" */
  afterIndent: string;

  /** Leading whitespace of the comment. @example "  " */
  indent: string;

  /** The opening delimiter. @example "/**" */
  open: string;
}): ParsedFrame => {
  const closeIndex = afterIndent.lastIndexOf(BLOCK_CLOSER);

  if (closeIndex < open.length) {
    throw new CommentParseError("unterminated block comment");
  }

  const inner = afterIndent.slice(open.length, closeIndex).trim();

  return {
    contentLines: inner === "" ? [] : [inner],
    frame: {
      close: DEFAULT_STARRED_CLOSER,
      indent,
      isSingleLine: true,
      kind: open === "/**" ? "doc" : "block",
      linePrefix: DEFAULT_STARRED_PREFIX,
      open,
    },
  };
};

/** Parse a block or doc comment spanning several lines. */
const parseExpandedBlockFrame = ({
  afterIndent,
  indent,
  lines,
  open,
}: {
  /** The first line with its indent removed. @example "/**" */
  afterIndent: string;

  /** Leading whitespace of the comment. @example "  " */
  indent: string;

  /** Every source line of the comment. */
  lines: string[];

  /** The opening delimiter. @example "/**" */
  open: string;
}): ParsedFrame => {
  const lastLine = lines.at(-1)!;
  const closeIndex = lastLine.lastIndexOf(BLOCK_CLOSER);

  if (closeIndex === -1) {
    throw new CommentParseError("unterminated block comment");
  }

  const beforeClose = lastLine.slice(0, closeIndex);
  const hasOwnCloseLine = beforeClose.trim() === "";

  const bodySource = lines.slice(1, -1);

  if (!hasOwnCloseLine) {
    // Trailing whitespace here is an artefact of the closer sharing the line,
    // never something the author typed, and keeping it would render a line
    // ending in a space.
    bodySource.push(beforeClose.trimEnd());
  }

  const rests = bodySource.map((line) => stripIndent({ indent, line }));
  const populated = rests.filter((rest) => rest.trim() !== "");

  const starredMatches = populated
    .map((rest) => STARRED_PREFIX.exec(rest))
    .filter((match): match is RegExpExecArray => match !== null);

  const isStarred = starredMatches.length > 0;

  /*
   * Only a line with content after its marker says anything about the
   * separator.
   *
   * - A bare asterisk line proves the body is starred and nothing more, and an
   *   empty body proves nothing at all. Inferring a prefix from either yields
   *   one with no separating space, which round-trips today only because there
   *   is no content — and renders a malformed comment the moment a transform
   *   adds some.
   */
  const informative = starredMatches.find(
    (match) => match[0].length < match.input.length,
  );

  const linePrefix = isStarred
    ? (informative?.[0] ?? DEFAULT_STARRED_PREFIX)
    : populated.length === 0
      ? DEFAULT_STARRED_PREFIX
      : commonIndent(populated);

  const trailingOpenContent = afterIndent.slice(open.length).trim();

  return {
    contentLines: [
      ...(trailingOpenContent === "" ? [] : [trailingOpenContent]),
      ...rests.map((rest) => readContent({ isStarred, linePrefix, rest })),
    ],
    frame: {
      close: hasOwnCloseLine
        ? lastLine.slice(Math.min(indent.length, beforeClose.length))
        : DEFAULT_STARRED_CLOSER,
      indent,
      isSingleLine: false,
      kind: open === "/**" ? "doc" : "block",
      linePrefix,
      open,
    },
  };
};

/**
 * Split a comment's source lines into its frame and its body lines.
 *
 * @returns the frame, and the body with every prefix removed.
 * @example parseFrame(["// hi"]).contentLines // ["hi"]
 */
export const parseFrame = (lines: string[]): ParsedFrame => {
  if (lines.length === 0) {
    throw new CommentParseError("expected a comment, found nothing");
  }

  const firstLine = lines[0];
  const indent = readIndent(firstLine);
  const afterIndent = firstLine.slice(indent.length);

  const lineMatch = LINE_MARKER.exec(afterIndent);

  if (lineMatch !== null) {
    return parseLineFrame({ indent, lines, marker: lineMatch.groups!.marker });
  }

  const blockMatch = BLOCK_OPENER.exec(afterIndent);

  if (blockMatch === null) {
    throw new CommentParseError(
      `expected a comment, found ${JSON.stringify(firstLine.slice(0, 20))}`,
    );
  }

  const open = blockMatch.groups!.open;

  return lines.length === 1
    ? parseCollapsedBlockFrame({ afterIndent, indent, open })
    : parseExpandedBlockFrame({ afterIndent, indent, lines, open });
};

/** Render one body line, or the bare prefix when it carries no content. */
const renderBodyLine = ({
  content,
  indent,
  linePrefix,
}: {
  /** The line's text, empty for a blank line. @example "a sentence" */
  content: string;

  /** The frame's indent. @example "  " */
  indent: string;

  /** The frame's per-line prefix. @example " * " */
  linePrefix: string;
}): string =>
  content === ""
    ? `${indent}${linePrefix}`.trimEnd()
    : `${indent}${linePrefix}${content}`;

/**
 * Wrap already-rendered body lines back in their frame.
 *
 * - A collapsed frame is honored **only** when the body is structurally
 *   collapsible, meaning at most one content line. A transform that grew the
 *   body and forgot to clear `isSingleLine` gets the expanded form rather than
 *   a paragraph crushed onto one line.
 *
 * @returns the comment's source lines, ready to join with the line ending.
 * @example renderFramedLines({ contentLines: ["hi"], frame }) // ["// hi"]
 */
export const renderFramedLines = ({
  contentLines,
  frame,
}: {
  /** The body's lines, without indent or prefix. @example ["a sentence"] */
  contentLines: string[];

  /** The frame to wrap them in. */
  frame: CommentFrame;
}): string[] => {
  const { close, indent, isSingleLine, kind, linePrefix, open } = frame;

  if (kind === "line") {
    return contentLines.length === 0
      ? [renderBodyLine({ content: "", indent, linePrefix })]
      : contentLines.map((content) =>
          renderBodyLine({ content, indent, linePrefix }),
        );
  }

  if (isSingleLine && contentLines.length <= 1) {
    const content = contentLines[0] ?? "";
    const closer = close.trimStart();

    return [
      content === ""
        ? `${indent}${open} ${closer}`
        : `${indent}${open} ${content} ${closer}`,
    ];
  }

  return [
    `${indent}${open}`,
    ...contentLines.map((content) =>
      renderBodyLine({ content, indent, linePrefix }),
    ),
    `${indent}${close}`,
  ];
};
