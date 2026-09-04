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
