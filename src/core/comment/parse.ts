import type { CommentDoc } from "./types";

import { parseBody } from "./body";
import { parseFrame } from "./frame";

/** Parse a comment's source text into its intermediate representation. */

/**
 * Parse one comment into its frame and body.
 *
 * - The input is the comment's source text and nothing else. Finding comments
 *   inside a file is the caller's job, which keeps this module free of any
 *   dependency on a TypeScript parser.
 *
 * - The line ending is detected rather than normalized, so a CRLF file does not
 *   silently become LF on the way back out.
 *
 * @returns the parsed comment.
 * @throws CommentParseError when the text is not a comment, or never closes.
 * @example parseComment("// hi").body // [{ lines: ["hi"], type: "paragraph" }]
 */
export const parseComment = (text: string): CommentDoc => {
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const { contentLines, frame } = parseFrame(text.split(lineEnding));

  return { body: parseBody(contentLines), frame, lineEnding };
};
