import { describe, expect, test } from "vitest";

import type { CommentDoc } from "#core/comment/types";

import { parseComment } from "#core/comment/parse";
import { renderComment } from "#core/comment/render";
import { runPipeline } from "#core/config/pipeline";
import { BUILT_IN_PRESETS } from "#core/config/presets";
import { createTransformRegistry } from "#core/config/registry";
import { resolveConfig } from "#core/config/resolve";
import { BUILT_IN_TRANSFORMS } from "#core/transforms/built-in";
import { loadCommentFixtures } from "#test/helpers/fixtures";
import { readBlockTokens } from "#test/helpers/invariants";

import type { BulletizeOptions } from "./bulletize";

import { bulletize } from "./bulletize";

const fixtures = loadCommentFixtures();

/** The transform's own defaults, for a test that overrides only one of them. */
const DEFAULT_OPTIONS: BulletizeOptions = {
  exemptLeadParagraph: true,
  isLoose: true,
  marker: "-",
};

/**
 * Bulletize a comment's source text, the way the pipeline would.
 *
 * @returns the bulletized comment's source text.
 */
const applyBulletize = ({
  options,
  text,
}: {
  /** The options to run with. @example { exemptLeadParagraph: true } */
  options?: Partial<BulletizeOptions>;

  /** The comment's source text. @example "// a comment" */
  text: string;
}): string =>
  renderComment(
    bulletize.run({
      doc: parseComment(text),
      options: { ...DEFAULT_OPTIONS, ...options },
    }),
  );

/** Run the real `bullets` preset end to end, as a user's config would. */
const applyBulletsPreset = (text: string): string =>
  renderComment(
    runPipeline({
      config: resolveConfig({
        config: { extends: ["bullets"] },
        presets: BUILT_IN_PRESETS,
      }),
      doc: parseComment(text),
      registry: createTransformRegistry(BUILT_IN_TRANSFORMS),
    }),
  );

describe("bulletize paragraphs", () => {
  test("leaves the lead paragraph as prose and bulletizes the rest", () => {
    // Given - a comment written the way prose arrives, as two paragraphs
    const text = [
      "/**",
      " * A lead sentence.",
      " *",
      " * A second point. A third point.",
      " */",
    ].join("\n");

    // When
    const bulletized = applyBulletize({ text });

    // Then - the lead survives untouched and each later sentence is a bullet
    expect(bulletized).toBe(
      [
        "/**",
        " * A lead sentence.",
        " *",
        " * - A second point.",
        " *",
        " * - A third point.",
        " */",
      ].join("\n"),
    );
  });

  test("bulletizes the lead paragraph too when it is not exempt", () => {
    // Given - a single-paragraph comment and the exemption switched off
    const text = ["/**", " * One. Two.", " */"].join("\n");

    // When
    const bulletized = applyBulletize({
      options: { exemptLeadParagraph: false },
      text,
    });

    // Then - nothing is spared
    expect(bulletized).toBe(
      ["/**", " * - One.", " *", " * - Two.", " */"].join("\n"),
    );
  });

  test("exempts the first paragraph rather than the first block", () => {
    // Given - a comment that opens with a list, so its lead sentence is later
    const text = [
      "/**",
      " * - an opening bullet",
      " *",
      " * A lead sentence. A second one.",
      " */",
    ].join("\n");

    // When
    const bulletized = applyBulletize({ text });

    /*
     * Then - the paragraph is the lead and stays prose. Exempting the first
     * *block* would have exempted the list, which was never prose, and
     * bulletized the paragraph that is actually the summary.
     */
    expect(bulletized).toContain(" * A lead sentence. A second one.");
  });

  test("joins a paragraph's lines before splitting it", () => {
    // Given - a paragraph whose sentence already spans a line break
    const text = [
      "/**",
      " * Lead.",
      " *",
      " * A sentence that",
      " * wraps once. Another.",
      " */",
    ].join("\n");

    // When
    const bulletized = applyBulletize({ text });

    // Then - the break carried no meaning, so the sentence is made whole
    expect(bulletized).toContain(" * - A sentence that wraps once.");
  });

  test("makes a one-sentence paragraph a one-item list", () => {
    // Given/When - the intended shape, not a degenerate case
    const bulletized = applyBulletize({
      text: ["/**", " * Lead.", " *", " * Only one.", " */"].join("\n"),
    });

    // Then
    expect(bulletized).toContain(" * - Only one.");
  });
});

describe("bulletize options", () => {
  test("writes the configured marker", () => {
    // Given/When - a marker other than the default
    const bulletized = applyBulletize({
      options: { marker: "*" },
      text: ["/**", " * Lead.", " *", " * One. Two.", " */"].join("\n"),
    });

    // Then
    expect(bulletized).toContain(" * * One.");
  });

  test("packs the items when the list is not loose", () => {
    // Given/When - the tight shape, with no blank line between items
    const bulletized = applyBulletize({
      options: { isLoose: false },
      text: ["/**", " * Lead.", " *", " * One. Two.", " */"].join("\n"),
    });

    // Then
    expect(bulletized).toBe(
      ["/**", " * Lead.", " *", " * - One.", " * - Two.", " */"].join("\n"),
    );
  });

  test("falls back to a dash for a marker the parser cannot read back", () => {
    /*
     * Given - a marker outside the options type. The assertion is the point of
     * the test: the union is compile-time only, and a config file is JSON, so
     * this is exactly the value that reaches the transform at run time.
     */
    const text = ["/**", " * Lead.", " *", " * One.", " */"].join("\n");
    const options = { marker: "•" as BulletizeOptions["marker"] };

    // When
    const once = applyBulletize({ options, text });

    /*
     * Then - the default is written instead. Writing the bullet through would
     * render a line the parser reads back as a *paragraph*, which the next pass
     * bulletizes again — one more marker every save, without bound.
     */
    expect(once).toContain(" * - One.");

    // And - which is to say it settles, rather than growing
    expect(applyBulletize({ options, text: once })).toBe(once);
  });

  test("defaults to a loose list of dashes exempting the lead", () => {
    // Given/When/Then - the shape this repo writes its own comments in
    expect(bulletize.defaultOptions).toEqual(DEFAULT_OPTIONS);
  });
});

describe("bulletize block handling", () => {
  test.each([
    { label: "a code fence", lines: ["```ts", "const x = 1;", "```"] },
    { label: "a bullet list", lines: ["- one. two.", "- three."] },
    { label: "an ordered list", lines: ["1. one. two."] },
    {
      label: "a table",
      lines: ["| a     | b   |", "| ----- | --- |", "| c. d. | e   |"],
    },
    { label: "a thematic break", lines: ["---"] },
    { label: "a tag section", lines: ["@returns one. two."] },
  ])("leaves $label untouched", ({ lines }) => {
    // Given - a block whose structure is its meaning, after a lead paragraph
    const text = [
      "/**",
      " * Lead.",
      " *",
      ...lines.map((line) => ` * ${line}`),
      " */",
    ].join("\n");

    // When
    const bulletized = applyBulletize({ text });

    // Then - bulletizing it would destroy the shape the author chose it for
    expect(bulletized).toBe(text);
  });

  test("coalesces a bulletized paragraph with the list beside it", () => {
    // Given - a tight list, then prose that will become bullets of its own
    const text = [
      "/**",
      " * Lead.",
      " *",
      " * - one",
      " * - two",
      " *",
      " * Three. Four.",
      " */",
    ].join("\n");

    // When
    const once = applyBulletize({ text });

    /*
     * Then - the two runs are one loose list, which is what the notation can
     * express and what re-parsing the output would have produced anyway. The
     * list's own items are all still there and in order.
     */
    expect(once).toBe(
      [
        "/**",
        " * Lead.",
        " *",
        " * - one",
        " *",
        " * - two",
        " *",
        " * - Three.",
        " *",
        " * - Four.",
        " */",
      ].join("\n"),
    );

    // And - the second pass is a no-op, which is the point of coalescing here
    expect(applyBulletize({ text: once })).toBe(once);
  });

  test("keeps the merged list tight when both sides are tight", () => {
    // Given - a tight list, prose to bulletize, and the tight shape configured
    const text = [
      "/**",
      " * Lead.",
      " *",
      " * - one",
      " * - two",
      " *",
      " * Three. Four.",
      " */",
    ].join("\n");

    // When
    const once = applyBulletize({ options: { isLoose: false }, text });

    /*
     * Then - a tight merge re-parses tight, so nothing about idempotency forces
     * the flag on. Forcing it would blank-separate the author's own two items.
     */
    expect(once).toBe(
      [
        "/**",
        " * Lead.",
        " *",
        " * - one",
        " * - two",
        " * - Three.",
        " * - Four.",
        " */",
      ].join("\n"),
    );

    // And - it still settles on the first pass
    expect(applyBulletize({ options: { isLoose: false }, text: once })).toBe(
      once,
    );
  });

  test("loosens the merged list when the author's list is already loose", () => {
    // Given - a loose list, so the merge has no tight answer available
    const text = [
      "/**",
      " * Lead.",
      " *",
      " * - one",
      " *",
      " * - two",
      " *",
      " * Three.",
      " */",
    ].join("\n");

    // When - the tight shape is configured but cannot be honored here
    const once = applyBulletize({ options: { isLoose: false }, text });

    // Then - one list carries one flag, and loose is the only one that fits
    expect(once).toContain(" * - one\n *\n * - two\n *\n * - Three.");
  });

  test("leaves an ordered list beside a bulletized paragraph tight", () => {
    // Given - a different list kind, which the parser never merges across
    const text = [
      "/**",
      " * Lead.",
      " *",
      " * 1. one",
      " * 2. two",
      " *",
      " * Three.",
      " */",
    ].join("\n");

    // When
    const once = applyBulletize({ text });

    // Then - the ordered items keep their tight spacing
    expect(once).toContain(" * 1. one\n * 2. two");
  });

  test("keeps a paragraph that holds no words rather than deleting it", () => {
    // Given - a paragraph the parser cannot produce, built by hand
    const doc: CommentDoc = {
      ...parseComment(["/**", " * Lead.", " */"].join("\n")),
      body: [{ lines: ["   "], type: "paragraph" }],
    };

    // When - the lead exemption is off, so the guard is what has to catch it
    const bulletized = bulletize.run({
      doc,
      options: { ...DEFAULT_OPTIONS, exemptLeadParagraph: false },
    });

    // Then - an empty list would render as nothing, silently losing the block
    expect(bulletized.body).toEqual([{ lines: ["   "], type: "paragraph" }]);
  });

  test("preserves CRLF endings", () => {
    // Given - a comment from a CRLF file
    const text = ["/**", " * Lead.", " *", " * One. Two.", " */"].join("\r\n");

    // When
    const bulletized = applyBulletize({ text });

    // Then - the line ending is detected, not normalized
    expect(bulletized).toContain("\r\n");
    expect(bulletized).not.toMatch(/[^\r]\n/);
  });
});

describe("bulletize alongside the pipeline", () => {
  test("runs before wrapping in the bullets preset", () => {
    // Given - two sentences, each on its own too long for the column
    const first = `First ${"word ".repeat(20).trim()}.`;
    const second = `Second ${"word ".repeat(20).trim()}.`;
    const text = ["/**", " * Lead.", " *", ` * ${first} ${second}`, " */"].join(
      "\n",
    );

    // When - the real preset runs, resolved the way a user's config would be
    const shipped = applyBulletsPreset(text);

    /*
     * Then - the bullets exist *and* are wrapped. Had wrapping run first, the
     * bullets this transform produced would have been left at full width.
     */
    expect(shipped.match(/^ \* - /gmu)).toHaveLength(2);
    expect(shipped.split("\n").filter((line) => line.length > 80)).toEqual([]);
  });

  test("settles in one pass through the whole preset", () => {
    // Given - prose that both transforms have work to do on
    const text = [
      "/**",
      " * A lead sentence that is quite long and will need to be wrapped once.",
      " *",
      " * A second point that runs on for a while. A third point here.",
      " */",
    ].join("\n");

    // When - the preset is applied, then applied again to its own output
    const once = applyBulletsPreset(text);
    const twice = applyBulletsPreset(once);

    // Then - the composition is idempotent, not just each transform alone
    expect(twice).toBe(once);
  });
});

describe("bulletize invariants", () => {
  test("the corpus is not empty", () => {
    // Given/When/Then - an empty glob would make every property below vacuous
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test.each(fixtures)("is idempotent over $name", ({ text }) => {
    // Given - the corpus, bulletized once
    const once = applyBulletize({ text });

    // When - the output is fed back through
    const twice = applyBulletize({ text: once });

    /*
     * Then - restructuring settles on the first pass. This also covers a
     * bulletized paragraph that lands next to an existing loose list: the two
     * re-parse as one merged list, and the rendered text has to be unchanged.
     */
    expect(twice).toBe(once);
  });

  test.each(fixtures)("loses no word of $name", ({ text }) => {
    // Given - the comment's blocks before anything restructures them
    const before = parseComment(text);

    // When
    const after = bulletize.run({ doc: before, options: DEFAULT_OPTIONS });

    /*
     * Then - every token survives in order. Read from the blocks rather than
     * the rendered text, because the markers this transform adds are rendering
     * and would otherwise read as words that appeared from nowhere.
     */
    expect(readBlockTokens(after.body)).toEqual(readBlockTokens(before.body));
  });
});

/**
 * The tokens a fuzzed comment is built from.
 *
 * - `test/fixtures/` is a corpus of *well-formed* comments and demonstrably
 *   will not catch this class of bug: it stayed green through four of them
 *   while `body/rewrap` was being written. Every entry here is something that
 *   changes what a line parses as.
 */
const FUZZ_VOCABULARY = [
  "-",
  "*",
  "+",
  "1.",
  "---",
  "***",
  "___",
  "```",
  "@param",
  "|",
  "alpha.",
  "beta",
  "`a b`",
  '"quoted."',
  "(paren.)",
  "e.g.",
  "Mr.",
];

/** A deterministic generator, so a failure is reproducible from its seed. */
const nextRandom = (seed: number): number =>
  (seed * 1_103_515_245 + 12_345) % 2_147_483_648;

/**
 * Build a doc comment out of the fuzz vocabulary.
 *
 * @returns the comment's source text.
 */
const fuzzComment = (seed: number): string => {
  let current = seed;

  const lines = Array.from({ length: 6 }, () => {
    const words = Array.from({ length: 5 }, () => {
      current = nextRandom(current);

      return FUZZ_VOCABULARY[current % FUZZ_VOCABULARY.length];
    });

    return ` * ${words.join(" ")}`;
  });

  return ["/**", ...lines, " */"].join("\n");
};

describe("bulletize fuzzing", () => {
  const seeds = Array.from({ length: 200 }, (_, index) => index + 1);

  test.each(seeds)("is idempotent over the comment for seed %i", (seed) => {
    // Given - a comment built from tokens that change what a line parses as
    const text = fuzzComment(seed);

    // When
    const once = applyBulletize({ text });
    const twice = applyBulletize({ text: once });

    // Then
    expect(twice).toBe(once);
  });

  test.each(seeds)("loses no word of the comment for seed %i", (seed) => {
    // Given
    const before: CommentDoc = parseComment(fuzzComment(seed));

    // When
    const after = bulletize.run({ doc: before, options: DEFAULT_OPTIONS });

    // Then
    expect(readBlockTokens(after.body)).toEqual(readBlockTokens(before.body));
  });
});
