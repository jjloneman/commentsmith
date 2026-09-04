/**
 * Markdown-ish inline constructs — where a code span, link, or image ends.
 *
 * - A construct that carries spaces has to be treated as **one indivisible
 *   run**, and two different questions need that same answer: the wrapper asks
 *   so it never breaks a line inside one, and the sentence splitter asks so it
 *   never counts a bracket or quote that a code span was quoting.
 *
 * - It lives in its own module because it belongs to neither caller. Leaving it
 *   inside the wrapping engine would have made the sentence splitter import
 *   "the wrapper" to ask a question that has nothing to do with columns.
 *
 * - Every reader is a single left-to-right pass rather than a pattern with
 *   alternating quantifiers, which is what keeps a pathological input from
 *   backtracking.
 */

/**
 * Escapes the character after it, inside a link's brackets.
 *
 * - Exported because a caller counting delimiters has to skip an escaped one
 *   the same way the readers here do.
 */
export const BACKSLASH = "\\";

/**
 * Opens and closes an inline code span.
 *
 * - Exported so a caller can tell a run that never closes from text where no
 *   construct started at all — {@link readSpanEnd} reports both as
 *   `undefined`, and they are not the same answer.
 */
export const BACKTICK = "`";

/** Precedes a link's opening bracket to make it an image. */
const BANG = "!";

/**
 * The index just past a backtick-delimited code span.
 *
 * - A span closes on a backtick run of **exactly** the opening run's length,
 *   which is CommonMark's rule and the reason a longer run can be used to
 *   quote a shorter one.
 *
 * @returns the end index, or `undefined` when the run never closes.
 */
const readCodeSpanEnd = ({
  start,
  text,
}: {
  /** Index of the first backtick. @example 4 */
  start: number;

  /** The text being scanned. @example "see `foo` here" */
  text: string;
}): number | undefined => {
  let opening = start;

  while (text[opening] === BACKTICK) {
    opening += 1;
  }

  const fenceLength = opening - start;

  let index = opening;

  while (index < text.length) {
    if (text[index] !== BACKTICK) {
      index += 1;
      continue;
    }

    let closing = index;

    while (text[closing] === BACKTICK) {
      closing += 1;
    }

    if (closing - index === fenceLength) {
      return closing;
    }

    index = closing;
  }

  return undefined;
};

/**
 * The index just past a bracketed run, honoring nesting and escapes.
 *
 * - Nesting matters because an image can sit inside a link's text, so counting
 *   depth is the difference between one atom and a truncated one.
 *
 * @returns the end index, or `undefined` when the bracket never closes.
 */
const readBracketedEnd = ({
  close,
  open,
  start,
  text,
}: {
  /** The closing character. @example "]" */
  close: string;

  /** The opening character, expected at `start`. @example "[" */
  open: string;

  /** Index of the opening character. @example 0 */
  start: number;

  /** The text being scanned. @example "[a link](target)" */
  text: string;
}): number | undefined => {
  let depth = 0;
  let index = start;

  while (index < text.length) {
    const character = text[index];

    if (character === BACKSLASH) {
      index += 2;
      continue;
    }

    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }

    index += 1;
  }

  return undefined;
};

/**
 * The index just past a Markdown link or image.
 *
 * - Covers the inline form and both reference forms. A bare `[text]` followed
 *   by neither is **not** a link, so it falls back to ordinary word splitting
 *   rather than swallowing the rest of the paragraph.
 *
 * @returns the end index, or `undefined` when this is not a link.
 */
const readLinkEnd = ({
  start,
  text,
}: {
  /** Index of the `!` or `[` that opens it. @example 0 */
  start: number;

  /** The text being scanned. @example "[a link](target)" */
  text: string;
}): number | undefined => {
  const labelStart = text[start] === BANG ? start + 1 : start;

  if (text[labelStart] !== "[") {
    return undefined;
  }

  const labelEnd = readBracketedEnd({
    close: "]",
    open: "[",
    start: labelStart,
    text,
  });

  if (labelEnd === undefined) {
    return undefined;
  }

  if (text[labelEnd] === "(") {
    return readBracketedEnd({ close: ")", open: "(", start: labelEnd, text });
  }

  if (text[labelEnd] === "[") {
    return readBracketedEnd({ close: "]", open: "[", start: labelEnd, text });
  }

  return undefined;
};

/**
 * The index just past whichever unbreakable construct starts here.
 *
 * @returns the end index, or `undefined` when no construct starts here.
 */
export const readSpanEnd = ({
  start,
  text,
}: {
  /** Where to look. @example 0 */
  start: number;

  /** The text being scanned. @example "`code`" */
  text: string;
}): number | undefined => {
  if (text[start] === BACKTICK) {
    return readCodeSpanEnd({ start, text });
  }

  if (text[start] === "[" || text[start] === BANG) {
    return readLinkEnd({ start, text });
  }

  return undefined;
};
