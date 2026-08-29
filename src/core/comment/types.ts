/**
 * The comment intermediate representation's vocabulary — the two layers every
 * transform operates on.
 *
 * - The **frame** and the **body** are deliberately independent. The frame owns
 *   delimiters, indentation, and the per-line marker; the body owns structure.
 *   Converting a line comment into a doc comment is then a frame edit and
 *   rewrapping is a body edit, so the two compose instead of fighting.
 *
 * - Frame strings are stored **exactly as they appear after the indent**, so
 *   rendering is concatenation rather than derivation. That is what lets
 *   `renderComment(parseComment(x))` return `x` with no normalization pass in
 *   between.
 *
 * - The block vocabulary is Markdown-*ish*, not CommonMark-complete. Comments
 *   are prose plus a few structures, and a full parser would be a large
 *   dependency for constructs that never appear in a docblock.
 */

/**
 * Every comment shape the frame layer recognizes.
 *
 * - This is the *semantic* question — is this a docblock? — while
 *   {@link CommentFrame.open} and friends are the rendering detail. Keeping
 *   them separate is what leaves room for a triple-slash doc stack to become
 *   `kind: "doc"` carrying a line comment's delimiters.
 *
 * - **The parser cannot make that call yet.** A `///` stack is SassDoc in
 *   SCSS, XML doc in C#, and rustdoc in Rust, but a compiler directive in
 *   TypeScript — so the answer is language-dependent, and every slash run is
 *   reported as `kind: "line"` until the frame layer knows the language.
 *
 * @example "doc"
 */
export type CommentKind = "block" | "doc" | "line";

/** The delimiters, indentation, and per-line marker wrapping a comment body. */
export type CommentFrame = {
  /**
   * The closing delimiter **as it appears after the indent**, including the
   * space that aligns it under the opener — so the closing line is exactly
   * `indent + close`. Empty for line comments, which have no closer.
   *
   * - The literal value cannot be written in this example, because a doc
   *   comment containing it would end here rather than at the intended place.
   *   That hazard is the whole reason {@link containsBlockTerminator} exists.
   */
  close: string;

  /**
   * Whitespace before the opener on the comment's first line.
   *
   * @example "  "
   */
  indent: string;

  /**
   * Whether the whole comment renders on one line.
   *
   * - The renderer honors this **only when the body is structurally
   *   collapsible** — exactly one content line. Otherwise it renders the
   *   expanded form and ignores the flag, so a transform that grows the body
   *   and forgets to clear this cannot crush a paragraph and its bullets onto
   *   one line.
   *
   * - It never collapses unbidden: declining an impossible request is
   *   correctness, while collapsing something the frame did not ask to collapse
   *   is a transform's decision.
   *
   * - Always `false` for `kind: "line"` — a stack of one is just a stack of
   *   one.
   *
   * @example true
   */
  isSingleLine: boolean;

  /**
   * The semantic category, independent of the delimiter strings.
   *
   * @example "doc"
   */
  kind: CommentKind;

  /**
   * Everything each body line carries before its content, after the indent —
   * alignment space, marker, and the single separating space.
   *
   * - Storing the separator here is what makes rendering uniform across every
   *   shape: a non-empty line is `indent + linePrefix + content`, and a blank
   *   one is the same string with its trailing whitespace removed.
   *
   * @example " * "
   * @example "// "
   */
  linePrefix: string;

  /**
   * The opening delimiter, as it appears after the indent.
   *
   * - For a line comment this is the same marker every line repeats, so
   *   rendering reads it from {@link CommentFrame.linePrefix}; it is recorded
   *   here so a transform converting between kinds can read the delimiter pair
   *   without picking the prefix apart.
   *
   * @example "//"
   */
  open: string;
};

/** One item of a bullet or ordered list, with its hanging indent resolved. */
export type ListItem = {
  /**
   * Whitespace before the marker, which is how nesting is represented.
   *
   * @example "  "
   */
  indent: string;

  /**
   * The item's content, already stripped of the hanging indent — the first
   * entry follows the marker, the rest are continuation lines.
   *
   * @example ["a bullet that", "wraps once"]
   */
  lines: string[];

  /**
   * The list marker itself, without its trailing space.
   *
   * @example "-"
   * @example "1."
   */
  marker: string;
};

/** A `-`, `*`, or `+` list. */
export type BulletList = {
  /**
   * Whether items are separated by blank lines — Markdown's own tight/loose
   * distinction, and the shape this repo's own comments are written in.
   *
   * @example true
   */
  isLoose: boolean;

  /** The items, in source order. */
  items: ListItem[];

  type: "bulletList";
};

/** A numbered list. */
export type OrderedList = {
  /**
   * Whether items are separated by blank lines.
   *
   * @example false
   */
  isLoose: boolean;

  /** The items, in source order. */
  items: ListItem[];

  type: "orderedList";
};

/** A fenced code block, held verbatim. */
export type CodeFence = {
  /**
   * The fence characters that opened and will close the block.
   *
   * @example "```"
   */
  fence: string;

  /**
   * The info string following the opening fence, usually a language tag.
   *
   * @example "ts"
   */
  info: string;

  /**
   * The fenced content, untouched — nothing inside a fence is ever
   * reinterpreted as another block.
   *
   * @example ["const x = 1;"]
   */
  lines: string[];

  type: "codeFence";
};

/** One JSDoc tag and the text belonging to it. */
export type JsdocTag = {
  /**
   * The tag's text, stripped of the two-space hanging indent. Empty for a tag
   * that carries none.
   *
   * @example ["a sink suitable for setLogSink."]
   */
  lines: string[];

  /**
   * The tag name, including its `@`.
   *
   * @example "@returns"
   */
  name: string;
};

/** A run of consecutive JSDoc tags. */
export type TagSection = {
  /**
   * The tags, in source order.
   *
   * - A blank line between tags simply starts a **new** section, which is why
   *   no tight/loose flag is needed here.
   */
  tags: JsdocTag[];

  type: "tagSection";
};

/**
 * One column's alignment, as declared by the delimiter row.
 *
 * @example "center"
 */
export type TableAlignment = "center" | "default" | "left" | "right";

/** A pipe table. */
export type Table = {
  /** One entry per column, positionally matching {@link Table.header}. */
  alignments: TableAlignment[];

  /**
   * The header cells, trimmed.
   *
   * @example ["Type", "Gitmoji"]
   */
  header: string[];

  /**
   * The body rows, each normalized to the header's column count.
   *
   * @example [["feat", "sparkles"]]
   */
  rows: string[][];

  type: "table";
};

/** A horizontal rule. */
export type ThematicBreak = {
  /**
   * The rule as written, so a `---` does not come back as a `***`.
   *
   * @example "---"
   */
  marker: string;

  type: "thematicBreak";
};

/**
 * One structural element of a comment body.
 *
 * @example { lines: ["a sentence"], type: "paragraph" }
 */
export type Block =
  | BulletList
  | CodeFence
  | OrderedList
  | Paragraph
  | Table
  | TagSection
  | ThematicBreak;

/** A run of prose lines. */
export type Paragraph = {
  /**
   * The lines as written. Storing the lines rather than one joined string is
   * what round-trips an already-wrapped paragraph; rewrapping is the transform
   * that joins and re-splits them.
   *
   * @example ["a sentence that", "wraps once"]
   */
  lines: string[];

  type: "paragraph";
};

/** A parsed comment — the unit every transform takes and returns. */
export type CommentDoc = {
  /** The body's blocks, in source order. */
  body: Block[];

  /** The delimiters and indentation wrapping {@link CommentDoc.body}. */
  frame: CommentFrame;

  /**
   * The line ending to render with, detected from the source rather than
   * normalized, so a CRLF file does not silently become LF.
   *
   * @example "\n"
   */
  lineEnding: "\n" | "\r\n";
};
