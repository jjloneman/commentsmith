import type { CommentDoc } from "./types";

import { renderBody } from "./body";
import { renderFramedLines } from "./frame";

/**
 * Render the intermediate representation back to comment source text.
 *
 * - `renderComment(parseComment(x)) === x` for any comment already in canonical
 *   form. Anything outside canonical form still parses, but comes back tidied
 *   rather than byte-identical.
 *
 * @returns the comment's source text.
 * @example renderComment(parseComment("// hi")) // "// hi"
 */
export const renderComment = (doc: CommentDoc): string =>
  renderFramedLines({
    contentLines: renderBody(doc.body),
    frame: doc.frame,
  }).join(doc.lineEnding);
