import { describe, expect, test } from "vitest";

import type { CommentDoc } from "#core/comment/types";

import { parseComment } from "#core/comment/parse";
import { renderComment } from "#core/comment/render";
import {
  createMockAppendingTransform,
  createMockTransform,
} from "#test/helpers/transforms";

import { ConfigError, TransformError } from "./errors";
import { runPipeline } from "./pipeline";
import { createTransformRegistry } from "./registry";
import { DEFAULT_PRINT_WIDTH } from "./types";

/** The comment every case starts from. */
const parseFixture = (): CommentDoc => parseComment("// a comment");

describe("runPipeline", () => {
  test("returns the comment untouched when nothing is configured", () => {
    // Given - an empty pipeline, which is the preserve preset rather than a
    // degenerate case
    const doc = parseFixture();

    // When
    const result = runPipeline({
      config: { printWidth: DEFAULT_PRINT_WIDTH, transforms: [] },
      doc,
      registry: createTransformRegistry([]),
    });

    // Then - the same comment comes back, byte for byte
    expect(result).toBe(doc);
    expect(renderComment(result)).toBe("// a comment");
  });

  test("applies transforms in configured order", () => {
    // Given - two transforms that each announce themselves
    const first = createMockAppendingTransform("first");
    const second = createMockAppendingTransform("second");

    // When - the config runs the second one first
    const result = runPipeline({
      config: {
        printWidth: DEFAULT_PRINT_WIDTH,
        transforms: [
          { name: "second", options: {} },
          { name: "first", options: {} },
        ],
      },
      doc: parseFixture(),
      registry: createTransformRegistry([first.definition, second.definition]),
    });

    // Then - configuration order wins, not registration order
    expect(renderComment(result)).toBe(
      "// a comment\n//\n// second\n//\n// first",
    );
  });

  test("feeds each transform what the previous one produced", () => {
    // Given - a transform that can observe its input
    const first = createMockAppendingTransform("first");
    const second = createMockTransform({ name: "second" });

    // When
    runPipeline({
      config: {
        printWidth: DEFAULT_PRINT_WIDTH,
        transforms: [
          { name: "first", options: {} },
          { name: "second", options: {} },
        ],
      },
      doc: parseFixture(),
      registry: createTransformRegistry([first.definition, second.definition]),
    });

    // Then - the second saw the first one's output, not the original
    expect(second.run).toHaveBeenCalledTimes(1);
    expect(second.run.mock.calls[0][0].doc.body).toHaveLength(2);
  });

  test("merges configured options over the transform's defaults", () => {
    // Given - a transform declaring two options
    const transform = createMockTransform({
      defaultOptions: { marker: "-", spaced: true },
      name: "body/bulletize",
    });

    // When - the config overrides only one of them
    runPipeline({
      config: {
        printWidth: DEFAULT_PRINT_WIDTH,
        transforms: [{ name: "body/bulletize", options: { marker: "*" } }],
      },
      doc: parseFixture(),
      registry: createTransformRegistry([transform.definition]),
    });

    // Then - the untouched default survives, so overriding one option does
    // not mean restating the rest; the document width rides along beneath both
    expect(transform.run).toHaveBeenCalledTimes(1);
    expect(transform.run.mock.calls[0][0].options).toEqual({
      marker: "*",
      printWidth: DEFAULT_PRINT_WIDTH,
      spaced: true,
    });
  });

  test("hands every transform the configured width", () => {
    // Given - a transform whose own default width differs from the config's
    const transform = createMockTransform({
      defaultOptions: { printWidth: 80 },
      name: "body/rewrap",
    });

    // When
    runPipeline({
      config: {
        printWidth: 100,
        transforms: [{ name: "body/rewrap", options: {} }],
      },
      doc: parseFixture(),
      registry: createTransformRegistry([transform.definition]),
    });

    // Then - the setting reaches the transform that has to honor it, rather
    // than validating and defaulting its way to nothing
    expect(transform.run).toHaveBeenCalledTimes(1);
    expect(transform.run.mock.calls[0][0].options).toEqual({ printWidth: 100 });
  });

  test("lets a single entry wrap to its own column", () => {
    // Given - a pipeline whose one step should not follow the document width
    const transform = createMockTransform({ name: "body/rewrap" });

    // When
    runPipeline({
      config: {
        printWidth: 100,
        transforms: [{ name: "body/rewrap", options: { printWidth: 60 } }],
      },
      doc: parseFixture(),
      registry: createTransformRegistry([transform.definition]),
    });

    // Then - the per-entry option outranks the document setting
    expect(transform.run.mock.calls[0][0].options).toEqual({ printWidth: 60 });
  });

  test("reports a transform that is not registered", () => {
    // Given - a config naming a transform nothing provides
    const run = () =>
      runPipeline({
        config: {
          printWidth: DEFAULT_PRINT_WIDTH,
          transforms: [{ name: "body/rewarp", options: {} }],
        },
        doc: parseFixture(),
        registry: createTransformRegistry([
          createMockTransform({ name: "body/rewrap" }).definition,
        ]),
      });

    /*
     * Then - it throws rather than skipping. A typo'd transform that quietly
     * does nothing is indistinguishable from one that ran and had no effect.
     */
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(
      'unknown transform "body/rewarp". Registered transforms: body/rewrap',
    );
  });

  test("names the transform that threw, and keeps what it threw", () => {
    // Given - a transform that fails on this comment
    const mockCause = new TypeError("cannot read properties of undefined");
    const transform = createMockTransform({
      name: "body/rewrap",
      rewrite: () => {
        throw mockCause;
      },
    });

    // When
    const run = () =>
      runPipeline({
        config: {
          printWidth: DEFAULT_PRINT_WIDTH,
          transforms: [{ name: "body/rewrap", options: {} }],
        },
        doc: parseFixture(),
        registry: createTransformRegistry([transform.definition]),
      });

    // Then - the diagnostic points at the step to disable
    expect(run).toThrow(TransformError);
    expect(run).toThrow('the "body/rewrap" transform failed');

    // And - the original throwable is still reachable for the log
    expect(() => {
      run();
    }).toThrow(
      expect.objectContaining({
        cause: mockCause,
        transformName: "body/rewrap",
      }) as Error,
    );
  });
});
