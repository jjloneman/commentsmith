import type {
  Block,
  BulletList,
  ListItem,
  Paragraph,
} from "#core/comment/types";

import { defineTransform } from "#core/config/registry";
import { splitSentences } from "#core/transforms/sentences";

/**
 * `body/bulletize-sentences` — one bullet per sentence, after the lead.
 *
 * - The flagship transform, and the shape this repo's own comments are written
 *   in: the first paragraph stays prose, and every paragraph after it becomes a
 *   loose bullet list with one item per sentence.
 *
 * - **It does no wrapping.** Each sentence is emitted as a single line, however
 *   long, and `body/rewrap` reflows it — which is why the `bullets` preset runs
 *   this transform first. Width arithmetic here would give two transforms an
 *   opinion about the column, and the second one to run would win anyway.
 *
 * - **It does not reframe**, and it touches no block that carries structure of
 *   its own. A list, code fence, table, thematic break, or JSDoc tag section
 *   passes through by reference; bulletizing one would destroy the very shape
 *   the author used it for.
 *
 * - The **one** exception is forced by the notation rather than chosen: a
 *   bullet list that ends up adjacent to a bulletized paragraph is coalesced
 *   with it. Markdown cannot express two neighboring bullet lists as separate
 *   lists, so leaving them apart would only mean the *parser* merged them on
 *   the next pass — see {@link coalesceLists}.
 */

/**
 * The markers the parser reads back as a bullet.
 *
 * - {@link BulletizeOptions.marker} already narrows to these three, but that is
 *   a *compile-time* guarantee and a config file is JSON. Transform options are
 *   not schema-checked per transform, so an arbitrary string reaches this
 *   transform at run time.
 *
 * - A marker outside this set does not round-trip, and the failure compounds:
 *   `renderList` writes it, the parser's `[-*+]` does not match it, and the line
 *   comes back a **paragraph** — which this transform bulletizes again, adding
 *   one more marker every pass. Under format-on-save that grows without bound.
 */
const BULLET_MARKERS = new Set<BulletizeOptions["marker"]>(["*", "+", "-"]);

/** The options `body/bulletize-sentences` understands. */
export type BulletizeOptions = {
  /**
   * Whether the first paragraph is left as prose.
   *
   * - On by default, because the lead sentence *is* the summary — a comment
   *   whose every paragraph is a bullet has no lead to bullet under.
   *
   * @example true
   */
  exemptLeadParagraph: boolean;

  /**
   * Whether a blank line separates the bullets.
   *
   * @example true
   */
  isLoose: BulletList["isLoose"];

  /**
   * The marker each bullet is written with.
   *
   * - Narrower than {@link ListItem.marker}, which also covers an ordered
   *   list's `1.`: this transform produces bullets, and a numeric marker here
   *   would render a list that parses back as a different kind.
   *
   * @example "-"
   */
  marker: "-" | "*" | "+";
};

/**
 * The marker to write, refusing one the parser could not read back.
 *
 * - Falling back rather than throwing, because a marker is cosmetic and a
 *   formatter that refuses the whole file over one is worse than a formatter
 *   that quietly writes the default.
 *
 * @returns the configured marker, or `-` when it would not round-trip.
 * @example resolveMarker("•") // "-"
 */
const resolveMarker = (
  /** The configured marker, untrusted at run time. @example "-" */
  marker: BulletizeOptions["marker"],
): BulletizeOptions["marker"] => (BULLET_MARKERS.has(marker) ? marker : "-");

/**
 * Rewrite one paragraph as a bullet per sentence.
 *
 * - The paragraph's lines are joined before they are split, because a sentence
 *   is free to span a line break and the wrapping that put it there carries no
 *   meaning.
 *
 * - Item lines are stored **stripped** of the hanging indent, because
 *   `renderList` re-adds it. Storing them indented would double the indent on
 *   the next pass, which is exactly what the idempotency invariant catches.
 *
 * @returns the list, or the paragraph unchanged when it holds no sentences.
 */
const bulletizeParagraph = ({
  isLoose,
  marker,
  paragraph,
}: {
  /** Whether to blank-separate the items. @example true */
  isLoose: BulletizeOptions["isLoose"];

  /** The marker to write each item with. @example "-" */
  marker: BulletizeOptions["marker"];

  /**
   * The paragraph to rewrite.
   *
   * @example { lines: ["One. Two."], type: "paragraph" }
   */
  paragraph: Paragraph;
}): Block => {
  const items: ListItem[] = splitSentences(paragraph.lines.join(" ")).map(
    (sentence) => ({ indent: "", lines: [sentence], marker }),
  );

  /*
   * A paragraph always holds at least one non-blank line, so this is
   * unreachable through the parser — but an empty list renders as nothing, and
   * silently deleting a block is the one outcome worth spending a guard on.
   */
  return items.length === 0
    ? paragraph
    : { isLoose, items, type: "bulletList" };
};

/**
 * Fold neighboring bullet lists into one.
 *
 * - Two adjacent bullet lists are not a shape the notation has. Rendering them
 *   puts one blank line between the two runs of items, and that is exactly what
 *   a **loose** list looks like, so the next parse returns a single loose list
 *   whatever this transform intended.
 *
 * - Doing the merge here rather than leaving it to the parser is what makes the
 *   transform idempotent: the doc it returns is already the doc its own output
 *   parses back to. Without it, a *tight* list next to a bulletized paragraph
 *   comes back loose on the second pass and every one of its items gains a
 *   blank line — found by fuzzing, and invisible to the golden corpus.
 *
 * - The merge is loose only when **either** side already is. Two tight lists
 *   render packed and re-parse tight, so nothing about idempotency forces the
 *   flag on; forcing it would instead discard a configured `isLoose: false` and
 *   blank-separate an author's tight list. Where the two sides disagree, loose
 *   is the only answer a single list can carry.
 *
 * - The parser never emits two adjacent bullet lists, so this only ever fires
 *   on an adjacency this transform just created.
 *
 * @returns the blocks, with neighboring bullet lists merged.
 */
const coalesceLists = (blocks: Block[]): Block[] => {
  const coalesced: Block[] = [];

  for (const block of blocks) {
    const previous = coalesced.at(-1);

    if (previous?.type === "bulletList" && block.type === "bulletList") {
      coalesced[coalesced.length - 1] = {
        isLoose: previous.isLoose || block.isLoose,
        items: [...previous.items, ...block.items],
        type: "bulletList",
      };

      continue;
    }

    coalesced.push(block);
  }

  return coalesced;
};

/**
 * Turn a comment's prose into a lead sentence followed by one bullet each.
 *
 * - The exempt paragraph is the first block **of type paragraph**, not the
 *   first block. A comment that opens with a list still has a lead sentence
 *   further down, and exempting a block that was never prose would exempt
 *   nothing.
 *
 * @example
 * runPipeline({ config, doc, registry: createTransformRegistry([bulletize]) })
 */
export const bulletize = defineTransform<BulletizeOptions>({
  defaultOptions: { exemptLeadParagraph: true, isLoose: true, marker: "-" },
  name: "body/bulletize-sentences",
  run: ({ doc, options }) => {
    const leadIndex = options.exemptLeadParagraph
      ? doc.body.findIndex((block) => block.type === "paragraph")
      : -1;

    const body = doc.body.map((block, index) =>
      block.type === "paragraph" && index !== leadIndex
        ? bulletizeParagraph({
            isLoose: options.isLoose,
            marker: resolveMarker(options.marker),
            paragraph: block,
          })
        : block,
    );

    return { ...doc, body: coalesceLists(body) };
  },
});
