import type { CommentDoc } from "./types";

import { renderBody } from "./body";

/** The two characters that end a block comment. */
const BLOCK_TERMINATOR = "*/";

/**
 * Whether this body would end a block comment early if framed as one.
 *
 * - A body containing the terminator cannot be safely reframed into a block or
 *   doc comment: the result silently changes what the surrounding file parses
 *   as, which compiles and misbehaves rather than erroring. It cost this repo a
 *   broken build during scaffolding, when a glob inside a block comment closed
 *   it early.
 *
 * - This is a **predicate, not an escaper**. Escaping would change the text the
 *   author wrote, and inside a code fence it would be flatly wrong; a transform
 *   that finds the sequence should refuse the conversion and report it.
 *
 * - The check runs over the **rendered** body rather than the blocks, because
 *   that is precisely the question being asked: would putting this text between
 *   block delimiters break?
 *
 * @returns `true` when reframing as a block comment would be unsafe.
 * @example containsBlockTerminator(parseComment("// a glob with a star and a slash")) // true
 */
export const containsBlockTerminator = (doc: CommentDoc): boolean =>
  renderBody(doc.body).some((line) => line.includes(BLOCK_TERMINATOR));
