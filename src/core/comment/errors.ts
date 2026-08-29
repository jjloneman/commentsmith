/** Thrown when input is not a comment this parser can represent. */
export class CommentParseError extends Error {
  constructor(
    /**
     * What was wrong with the input, phrased for a CLI diagnostic.
     *
     * @example "unterminated block comment"
     */
    message: string,
  ) {
    super(message);
    this.name = "CommentParseError";
  }
}
