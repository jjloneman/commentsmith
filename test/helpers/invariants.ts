import type { Block } from "#core/comment/types";

/**
 * Support for the two invariants every transform's tests carry.
 *
 * - Idempotency needs no helper — it is an equality against a second
 *   application — but **no word loss** needs one, because "the same words" is a
 *   claim about tokens rather than about text. A transform is free to move a
 *   line break or collapse a run of spaces; it is not free to drop, add, or
 *   rewrite a word.
 */

/** Any run of whitespace, which is all a reflow is allowed to change. */
const WHITESPACE_RUN = /\s+/u;

/**
 * Split text into the tokens a transform must preserve exactly.
 *
 * - Splitting on whitespace rather than on words is deliberate: a construct
 *   that carries a space, such as an inline code span, contributes several
 *   tokens, and the invariant still holds because reflowing never changes a
 *   non-whitespace character.
 *
 * @returns the non-empty whitespace-separated tokens, in order.
 * @example readWordTokens(" a  b ") // ["a", "b"]
 */
export const readWordTokens = (text: string): string[] =>
  text.split(WHITESPACE_RUN).filter((token) => token !== "");

/**
 * The text one block carries, with its markers left out.
 *
 * - A list's markers, a fence's backticks, and a table's pipes are *rendering*,
 *   not content. A transform that adds a bullet has not added a word, so a
 *   token reader that counted the marker would report word loss where there is
 *   none.
 *
 * @returns the block's text runs, in order.
 */
const readBlockText = (block: Block): string[] => {
  switch (block.type) {
    case "bulletList":
    case "orderedList":
      return block.items.flatMap((item) => item.lines);

    case "codeFence":
      return [block.info, ...block.lines];

    case "paragraph":
      return block.lines;

    case "table":
      return [...block.header, ...block.rows.flat()];

    case "tagSection":
      return block.tags.flatMap((tag) => [tag.name, ...tag.lines]);

    case "thematicBreak":
      return [block.marker];
  }
};

/**
 * Split a body's blocks into the tokens a transform must preserve exactly.
 *
 * - This is {@link readWordTokens} asked of the intermediate representation
 *   rather than of rendered text, and it is what lets a transform that
 *   **restructures** still be held to the no-word-loss invariant. Bulletizing a
 *   paragraph adds a marker to every rendered line; reading tokens from the
 *   block content never sees one.
 *
 * @returns the non-empty tokens carried by the blocks, in order.
 * @example readBlockTokens([{ lines: ["a b"], type: "paragraph" }]) // ["a", "b"]
 */
export const readBlockTokens = (blocks: Block[]): string[] =>
  blocks.flatMap(readBlockText).flatMap(readWordTokens);
