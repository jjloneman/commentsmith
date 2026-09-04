import type {
  Block,
  CommentFrame,
  JsdocTag,
  ListItem,
} from "#core/comment/types";
import type { ResolvedConfig } from "#core/config/types";

import { renderBody, TAG_HANGING_INDENT } from "#core/comment/body";
import { renderFramedLines } from "#core/comment/frame";
import { listHangingIndent } from "#core/comment/list";
import { defineTransform } from "#core/config/registry";
import { DEFAULT_PRINT_WIDTH } from "#core/config/types";
import { measureWidth, wrapText } from "#core/transforms/wrap";

/**
 * `body/rewrap` — reflow a comment's prose to a target column.
 *
 * - This is the transform that turns the width budget into block-level
 *   decisions. The arithmetic lives here rather than in `wrap.ts` because it
 *   needs the frame, and rather than in the body layer because that layer has
 *   deliberately never seen a delimiter.
 *
 * - **It does not reframe.** Delimiters, indentation, and the line prefix are
 *   read for their widths and handed back untouched. The one frame field it
 *   may change is `isSingleLine`, and only ever to stop honoring a request to
 *   collapse that no longer fits — see {@link resolveCollapse}.
 */

/**
 * Tags whose text is code, and so is never reflowed.
 *
 * - `@example` is defined to carry a code sample. Reflowing it breaks the
 *   sample for exactly the reason a code fence is left verbatim, and this
 *   repo's own sources carry `@example` lines past the column deliberately.
 *
 * - A set of one rather than a special case, because JSDoc has other
 *   code-bearing tags and #7 is where the rest of the tag vocabulary lands.
 */
const VERBATIM_TAGS = new Set(["@example"]);

/** The options `body/rewrap` understands. */
export type RewrapOptions = {
  /**
   * The column a **rendered** line is wrapped to, indent and prefix included.
   *
   * - The declared default below is a floor that never survives the pipeline:
   *   the runner seeds the configured width over it, and a per-entry option
   *   wins over both. It earns its place only for a direct call outside the
   *   pipeline, such as a unit test.
   *
   * @example 80
   */
  printWidth: ResolvedConfig["printWidth"];
};

/**
 * How many columns of content one body line may carry.
 *
 * - Measured against the **expanded** form even for a comment currently marked
 *   collapsed. The collapsed line is narrower, but budgeting for it is what
 *   breaks idempotency: wrapping to the narrow budget expands the comment, and
 *   the next pass reads a frame that is no longer collapsed and rejoins to the
 *   wider one. {@link resolveCollapse} handles the overflow instead, once,
 *   where it does not feed back into the measurement.
 *
 * @returns the content budget, which may be zero or negative on a deep indent.
 * @example contentWidth({ frame, printWidth: 80 }) // 77
 */
const contentWidth = ({
  frame,
  printWidth,
}: {
  /** The frame whose indent and prefix the content shares its line with. */
  frame: CommentFrame;

  /** The column a rendered line is wrapped to. @example 80 */
  printWidth: RewrapOptions["printWidth"];
}): number => printWidth - frame.indent.length - frame.linePrefix.length;

/**
 * Stop honoring a request to collapse when the one line would not fit.
 *
 * - A collapsed comment is the one shape whose rendered width is not
 *   `indent + linePrefix + content`, so it is the one shape wrapping the body
 *   cannot bring under `printWidth` on its own.
 *
 * - Clearing the flag is a wrapping decision rather than a framing one: the
 *   comment is being expanded because its content does not fit on a line, which
 *   is the same judgment the renderer already makes when a body grows past one
 *   line. Nothing else about the frame is touched, and a comment that still
 *   fits keeps its collapsed form.
 *
 * - The width comes from **rendering** the collapsed line rather than from a
 *   formula for it. The two spaces around the content shrink to one when the
 *   body is empty, and any second copy of that rule is a copy that can drift.
 *
 * @returns the frame, expanded only when the collapsed line would overflow.
 */
const resolveCollapse = ({
  body,
  frame,
  printWidth,
}: {
  /** The body as this transform just reflowed it. */
  body: Block[];

  /** The frame to reconsider. */
  frame: CommentFrame;

  /** The column a rendered line is wrapped to. @example 80 */
  printWidth: RewrapOptions["printWidth"];
}): CommentFrame => {
  /*
   * A line comment has no collapsed form, so nothing here needs deciding —
   * checked before the body is rendered, since rendering it would be thrown
   * away for every line comment and every already-expanded block.
   */
  if (frame.kind === "line" || !frame.isSingleLine) {
    return frame;
  }

  const contentLines = renderBody(body);

  // A body of several lines already renders expanded whatever the flag says.
  if (contentLines.length > 1) {
    return frame;
  }

  const [collapsed] = renderFramedLines({ contentLines, frame });

  return measureWidth(collapsed) <= printWidth
    ? frame
    : { ...frame, isSingleLine: false };
};

/**
 * Reflow one list item under its hanging indent.
 *
 * - The item's marker and the hanging indent that replaces it on continuation
 *   lines are the same width, so one budget covers every line of the item.
 *
 * - The wrapped lines are stored **still stripped** of that indent, because
 *   `renderList` re-adds it. Storing them indented would double the indent on
 *   the next pass, which is exactly what the idempotency invariant catches.
 *
 * @returns the item with its lines reflowed.
 */
const rewrapItem = ({
  item,
  width,
}: {
  /** The item to reflow. @example { indent: "", lines: ["a"], marker: "-" } */
  item: ListItem;

  /** The body's content budget, before the item's own indent. @example 74 */
  width: number;
}): ListItem => {
  const itemWidth = width - item.indent.length - listHangingIndent(item).length;

  return {
    ...item,
    lines: wrapText({
      continuationWidth: itemWidth,
      firstLineWidth: itemWidth,
      lines: item.lines,
    }),
  };
};

/**
 * Reflow one JSDoc tag's text.
 *
 * - This is the one block whose first line and continuations have different
 *   budgets: the first starts after the tag's name and a space, the rest hang
 *   at a fixed indent. That asymmetry is why `wrapText` takes two widths.
 *
 * @returns the tag with its text reflowed, or unchanged when it carries code.
 */
const rewrapTag = ({
  tag,
  width,
}: {
  /** The tag to reflow. @example { lines: ["the sink."], name: "@returns" } */
  tag: JsdocTag;

  /** The body's content budget. @example 74 */
  width: number;
}): JsdocTag =>
  VERBATIM_TAGS.has(tag.name)
    ? tag
    : {
        ...tag,
        lines: wrapText({
          continuationWidth: width - TAG_HANGING_INDENT.length,
          firstLineWidth: width - tag.name.length - 1,
          lines: tag.lines,
        }),
      };

/**
 * Reflow whichever blocks carry prose, leaving the rest alone.
 *
 * @returns the block, reflowed or unchanged.
 */
const rewrapBlock = ({
  block,
  width,
}: {
  /** The block to consider. */
  block: Block;

  /** The body's content budget. @example 74 */
  width: number;
}): Block => {
  switch (block.type) {
    case "bulletList":
    case "orderedList":
      return {
        ...block,
        items: block.items.map((item) => rewrapItem({ item, width })),
      };

    // Fenced content is held verbatim; reflowing it would rewrite code.
    case "codeFence":
      return block;

    case "paragraph":
      return {
        ...block,
        lines: wrapText({
          continuationWidth: width,
          firstLineWidth: width,
          lines: block.lines,
        }),
      };

    // A table's shape is its meaning — its cells are padded, not reflowed.
    case "table":
      return block;

    case "tagSection":
      return {
        ...block,
        tags: block.tags.map((tag) => rewrapTag({ tag, width })),
      };

    // A rule is a single marker with nothing to reflow.
    case "thematicBreak":
      return block;
  }
};

/**
 * Hard-wrap a comment's body to `printWidth`, respecting block structure.
 *
 * - Wrapping is measured against the **rendered** line, so the frame's indent
 *   and line prefix and a list item's marker all count against the budget.
 *
 * - Reflowing joins each block's lines before re-splitting them, which
 *   collapses a run of spaces to one. That is a normalization, and it sits
 *   inside the documented boundary that non-canonical input comes back tidied
 *   rather than byte-identical.
 *
 * - It cannot create the block terminator out of two lines, because joining
 *   always inserts a separating space between them.
 *
 * @example runPipeline({ config, doc, registry: createTransformRegistry([rewrap]) })
 */
export const rewrap = defineTransform<RewrapOptions>({
  defaultOptions: { printWidth: DEFAULT_PRINT_WIDTH },
  name: "body/rewrap",
  run: ({ doc, options }) => {
    const width = contentWidth({
      frame: doc.frame,
      printWidth: options.printWidth,
    });

    const body = doc.body.map((block) => rewrapBlock({ block, width }));

    return {
      ...doc,
      body,
      frame: resolveCollapse({
        body,
        frame: doc.frame,
        printWidth: options.printWidth,
      }),
    };
  },
});
