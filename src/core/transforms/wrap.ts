import { couldOpenBlock, opensBlock } from "#core/comment/body";

/**
 * The wrapping engine — atoms, measurement, and greedy line filling.
 *
 * - It takes and returns **plain strings**, never a `CommentDoc`. Keeping the
 *   engine free of the intermediate representation is what lets a later
 *   transform wrap the text it generates without importing another transform.
 *
 * - It also never sees a frame. The caller resolves indentation, line
 *   prefixes, and hanging indents into a plain column budget, so this module
 *   stays as delimiter-blind as the body layer it serves.
 *
 * - It does know one thing about the body layer: which text opens a block. A
 *   line break is not a neutral act in Markdown-ish prose, so the rule is
 *   borrowed from the parser rather than reimplemented here.
 *
 * - Filling is **greedy first-fit**, not optimal paragraph filling. Every
 *   formatter in this space wraps greedily, and greedy is what makes
 *   re-wrapping an already-wrapped block reproduce it exactly.
 */

/** Escapes the character after it, inside a link's brackets. */
const BACKSLASH = "\\";

/** Opens and closes an inline code span. */
const BACKTICK = "`";

/** Precedes a link's opening bracket to make it an image. */
const BANG = "!";

/**
 * Whitespace, which is what separates one atom from the next.
 *
 * - `\s` rather than `\p{White_Space}` because `\s` is already Unicode-aware,
 *   so the property escape would buy nothing here.
 */
const WHITESPACE = /\s/;

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
const readSpanEnd = ({
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

/**
 * Split text into the units a line is filled with.
 *
 * - An atom is a run of non-whitespace, **extended through any code span or
 *   link it meets** so a construct carrying spaces stays one unit. Splitting
 *   one across lines produces text that no longer renders as what it was.
 *
 * - The scan is a single left-to-right pass rather than a pattern with
 *   alternating quantifiers, which is what keeps a pathological input from
 *   backtracking.
 *
 * @returns the atoms, in order, none of them empty.
 * @example splitAtoms("see `a b` now") // ["see", "`a b`", "now"]
 */
const splitAtoms = (text: string): string[] => {
  const atoms: string[] = [];

  let index = 0;

  while (index < text.length) {
    if (WHITESPACE.test(text[index])) {
      index += 1;
      continue;
    }

    const start = index;

    while (index < text.length && !WHITESPACE.test(text[index])) {
      index = readSpanEnd({ start: index, text }) ?? index + 1;
    }

    atoms.push(text.slice(start, index));
  }

  return atoms;
};

/**
 * How many columns a string occupies.
 *
 * - Counted in **code points, not terminal columns** — the same deliberate
 *   limitation the table layer documents and measures the same way. Counting
 *   display width needs an east-asian-width table this repo has no dependency
 *   for; counting UTF-16 units, which is what `.length` returns, would charge
 *   an emoji two columns it does not occupy.
 *
 * @returns the string's width in code points.
 * @example measureWidth("ab") // 2
 */
export const measureWidth = (text: string): number => [...text].length;

/**
 * How wide these atoms render as one line, separating spaces included.
 *
 * @returns the line's width in code points.
 */
const measureLine = (atoms: string[]): number =>
  atoms.reduce(
    (width, atom) => width + measureWidth(atom),
    Math.max(atoms.length - 1, 0),
  );

/**
 * Reflow lines to a column budget, filling each line greedily.
 *
 * - The two budgets exist because a JSDoc tag's first line starts after its
 *   name while its continuations hang at a fixed indent. A paragraph passes
 *   the same value twice.
 *
 * - **An atom wider than the budget overflows its own line rather than being
 *   broken.** A line a few columns long is something a human can act on; a
 *   code span or link split in half is corrupted markup.
 *
 * - **A break may not change what either line parses as.** The line being
 *   started must not begin with something that opens a block, or prose becomes
 *   a list on the next parse. The line being *completed* must not become one
 *   either — a thematic break is anchored to the end of its line, so cutting
 *   `--- alpha` after `---` creates a rule out of prose that was not one. Where
 *   a break is unsafe, the preceding atom is pulled down to keep the budget if
 *   it can be, and the line overflows if it cannot.
 *
 * - A budget of zero or less degrades to one atom per line rather than
 *   looping, which is what a deep indent under a narrow width produces.
 *
 * @returns the wrapped lines, empty when the text holds no atoms.
 * @example
 * wrapText({ continuationWidth: 5, firstLineWidth: 5, lines: ["a b c d"] })
 * // ["a b c", "d"]
 */
export const wrapText = ({
  continuationWidth,
  firstLineWidth,
  lines,
}: {
  /**
   * The budget for every line after the first.
   *
   * @example 74
   */
  continuationWidth: number;

  /**
   * The budget for the first line, which a hanging construct narrows.
   *
   * @example 66
   */
  firstLineWidth: number;

  /**
   * The lines to reflow, joined before they are re-split.
   *
   * @example ["a sentence that", "wraps once"]
   */
  lines: string[];
}): string[] => {
  const atoms = splitAtoms(lines.join(" "));
  const wrapped: string[] = [];

  let current: string[] = [];

  for (const atom of atoms) {
    const width = wrapped.length === 0 ? firstLineWidth : continuationWidth;

    if (current.length === 0 || measureLine([...current, atom]) <= width) {
      current.push(atom);
      continue;
    }

    /*
     * The break would start the next line with `atom`. Walk back over the
     * current line until the atom that would lead the new one is safe there,
     * always leaving at least one atom behind.
     */
    let cut = current.length;
    let head = atom;

    while (cut > 1 && couldOpenBlock(head)) {
      cut -= 1;
      head = current[cut];
    }

    /*
     * Walking back cannot rescue the line being completed — a shorter one is
     * only more likely to read as a bare marker — so overflow instead.
     */
    if (couldOpenBlock(head) || opensBlock(current.slice(0, cut).join(" "))) {
      current.push(atom);
      continue;
    }

    wrapped.push(current.slice(0, cut).join(" "));
    current = [...current.slice(cut), atom];
  }

  if (current.length > 0) {
    wrapped.push(current.join(" "));
  }

  return wrapped;
};
