import { BACKSLASH, BACKTICK, readSpanEnd } from "#core/transforms/inline";

/**
 * Sentence segmentation — where one sentence ends and the next begins.
 *
 * - Plain strings in and out, in the same posture as `wrap.ts`: this module
 *   never sees a `CommentDoc` and never sees a frame, so the transform that
 *   uses it composes rather than depends.
 *
 * - **`Intl.Segmenter` does the segmenting**, not a regular expression. It is
 *   built into the platform, costs no dependency, and already handles the cases
 *   a hand-rolled terminator pattern gets wrong: `e.g.`, `i.e.`, `U.S.`, the
 *   decimal in `3.5`, the version in `1.2.3`, the ellipsis in `Wait...`, and an
 *   em dash, which is not a terminator.
 *
 * - What it does **not** get right is repaired by a small merge pass, not by
 *   replacing it. Each rule below cites the input that motivated it, because a
 *   repair rule with no failing example is a rule nobody can safely delete.
 *
 * - **The bias is toward under-splitting.** A false merge costs one bullet
 *   carrying two sentences; a false split cuts a quotation or a parenthetical
 *   in half and changes what the author wrote. Where the two trade off, this
 *   module merges.
 */

/**
 * Words that end in a period without ending a sentence.
 *
 * - Only the ones `Intl.Segmenter` actually splits on need to be here. It
 *   already keeps `e.g.`, `i.e.`, and `U.S.` attached, because a period inside
 *   the word tells it what the word is; a single-dot abbreviation followed by a
 *   capital — `Mr. Smith` — is the case it cannot see.
 *
 * - Stored lowercased and compared lowercased, so `Dr.` and `dr.` behave alike.
 *
 * - **`no.` is deliberately absent.** A sentence really can end with the word
 *   "no", and merging every one of those is a worse trade than splitting the
 *   rare "No. 5".
 */
const ABBREVIATIONS = new Set([
  "approx.",
  "cf.",
  "dr.",
  "e.g.",
  "etc.",
  "i.e.",
  "jr.",
  "mr.",
  "mrs.",
  "ms.",
  "sr.",
  "st.",
  "u.s.",
  "vs.",
]);

/**
 * A segment that opens with a lowercase letter, and so continues the previous.
 *
 * - The long property name, per the repo's rule, and `u` because `\p{…}`
 *   requires it.
 */
const LOWERCASE_START = /^\p{Lowercase_Letter}/u;

/**
 * Quotation characters a sentence can be left open inside.
 *
 * - The straight `"` and the curly pair, which is what prose actually carries.
 *   Each is treated as a **toggle** rather than as an opener or a closer: the
 *   straight quote gives no direction to read, and one rule covering all three
 *   beats a second rule only the curly pair could use.
 *
 * - **The apostrophe is deliberately absent.** It is far more common in prose
 *   than a single-quoted quotation, so tracking it would leave almost every
 *   sentence looking unclosed and merge nearly everything.
 */
const QUOTATION_MARKS = new Set(['"', "“", "”"]);

/** The last whitespace-separated word, ignoring trailing whitespace. */
const TRAILING_WORD = /(?<word>\S+)\s*$/u;

/**
 * The locale sentence segmentation is performed in.
 *
 * - Hard-coded because segmentation is locale-dependent and this repo is
 *   American English throughout. A locale option before a second locale exists
 *   would be configuration nobody can act on.
 */
const SENTENCE_LOCALE = "en";

/** Reused across calls — building a segmenter per paragraph is pure overhead. */
const SENTENCE_SEGMENTER = new Intl.Segmenter(SENTENCE_LOCALE, {
  granularity: "sentence",
});

/**
 * Whether text ends with a construct still waiting to be closed.
 *
 * - This is the first repair rule. `He said "Stop. Now." loudly.` segments
 *   after `He said "Stop. `, cutting the quotation in half; the unclosed `"`
 *   is what says the sentence is not over.
 *
 * - Code spans and links are skipped **whole**, using the same reader the
 *   wrapper uses, so a bracket or quotation character that a code span was
 *   quoting is never counted as a delimiter of its own.
 *
 * - Depths are clamped at zero so a stray closer — a `)` in prose that opened
 *   nowhere — cannot drive the count negative and mask a later opener.
 *
 * @returns `true` when a code span, bracket, parenthesis, or quotation is open.
 * @example hasOpenConstruct('He said "Stop. ') // true
 */
const hasOpenConstruct = (text: string): boolean => {
  let bracketDepth = 0;
  let index = 0;
  let isQuoted = false;
  let parenDepth = 0;

  while (index < text.length) {
    const character = text[index];
    const spanEnd = readSpanEnd({ start: index, text });

    if (spanEnd !== undefined) {
      index = spanEnd;
      continue;
    }

    /*
     * `readSpanEnd` reports "no construct started" and "the construct never
     * closed" identically, so a backtick it declined is a code span still open.
     */
    if (character === BACKTICK) {
      return true;
    }

    if (character === BACKSLASH) {
      index += 2;
      continue;
    }

    if (character === "(") {
      parenDepth += 1;
    } else if (character === ")") {
      parenDepth = Math.max(parenDepth - 1, 0);
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth = Math.max(bracketDepth - 1, 0);
    } else if (QUOTATION_MARKS.has(character)) {
      isQuoted = !isQuoted;
    }

    index += 1;
  }

  return bracketDepth > 0 || isQuoted || parenDepth > 0;
};

/**
 * Whether text ends in a word whose period does not end a sentence.
 *
 * - This is the second repair rule, motivated by `Mr. Smith Jr. arrived.`,
 *   which segments after `Mr. `.
 *
 * @returns `true` when the trailing word is a known abbreviation.
 * @example endsWithAbbreviation("Mr. ") // true
 */
const endsWithAbbreviation = (text: string): boolean => {
  const word = TRAILING_WORD.exec(text)?.groups?.word;

  return word !== undefined && ABBREVIATIONS.has(word.toLowerCase());
};

/**
 * Whether a segment continues the one before it rather than starting its own.
 *
 * - The three rules are `or`ed rather than ranked because they catch disjoint
 *   failures, and any one of them firing is enough to say "not a boundary".
 *
 * @returns `true` when the two segments belong to one sentence.
 */
const continuesSentence = ({
  segment,
  sentence,
}: {
  /** The segment being considered. @example "loudly. " */
  segment: string;

  /** The sentence accumulated so far. @example 'He said ("Stop!") ' */
  sentence: string;
}): boolean =>
  /*
   * The third repair rule, and the one the issue's own example needs:
   * `He said ("John is coming due for services!") loudly.` segments after the
   * closing parenthesis, where the text is balanced and ends in no
   * abbreviation, so neither rule above sees it. English sentences do not open
   * lowercase — except for an identifier, which is the accepted false merge.
   */
  LOWERCASE_START.test(segment) ||
  hasOpenConstruct(sentence) ||
  endsWithAbbreviation(sentence);

/**
 * Split prose into sentences.
 *
 * - Each returned sentence is trimmed, and a run that holds no words at all
 *   yields nothing rather than an empty string.
 *
 * @returns the sentences, in order, none of them empty.
 * @example splitSentences("One. Two.") // ["One.", "Two."]
 */
export const splitSentences = (
  /**
   * The prose to split, already joined into one string.
   *
   * @example "A lead sentence. A second one."
   */
  text: string,
): string[] => {
  const sentences: string[] = [];

  for (const { segment } of SENTENCE_SEGMENTER.segment(text)) {
    const sentence = sentences.at(-1);

    if (sentence !== undefined && continuesSentence({ segment, sentence })) {
      sentences[sentences.length - 1] = `${sentence}${segment}`;
      continue;
    }

    sentences.push(segment);
  }

  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
};
