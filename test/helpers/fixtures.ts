import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loader for the golden comment corpus.
 *
 * - The corpus is the evidence for the round-trip invariant, so it is read from
 *   disk rather than inlined: a fixture is easier to eyeball as a file than as
 *   an escaped string, and adding one needs no test edit.
 */

const FIXTURES_DIRECTORY = join(import.meta.dirname, "..", "fixtures");

/** One comment fixture, read from `test/fixtures`. */
export type CommentFixture = {
  /**
   * The file's name without its extension, used as the test's label.
   *
   * @example "doc-tags"
   */
  name: string;

  /**
   * The comment's source text, without the file's trailing newline.
   *
   * @example "// a single line comment"
   */
  text: string;
};

/**
 * Read every comment fixture in the corpus.
 *
 * - The trailing newline every file ends with is stripped, because it belongs
 *   to the file rather than to the comment.
 *
 * @returns the fixtures, in filename order.
 * @example loadCommentFixtures()[0].name // "block-paragraph"
 */
export const loadCommentFixtures = (): CommentFixture[] =>
  readdirSync(FIXTURES_DIRECTORY)
    .filter((entry) => entry.endsWith(".txt"))
    .sort()
    .map((entry) => ({
      name: entry.replace(/\.txt$/, ""),
      text: readFileSync(join(FIXTURES_DIRECTORY, entry), "utf8").replace(
        /\r?\n$/,
        "",
      ),
    }));
