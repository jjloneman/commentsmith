import type { Mock } from "vitest";

import { vi } from "vitest";

import type {
  Transform,
  TransformDefinition,
  TransformOptions,
} from "#core/config/types";

import { defineTransform } from "#core/config/registry";

/**
 * Doubles for the transforms the pipeline runs.
 *
 * - Every real transform lands in a later issue, so the registry and the runner
 *   are proven against doubles. That is not a stopgap: a runner tested with real
 *   transforms would be asserting their behavior as much as its own.
 */

/** A transform double, and the spy recording how the runner called it. */
export type MockTransform = {
  /** The definition to place in a registry. */
  definition: TransformDefinition;

  /** The spy backing the definition's `run`. */
  run: Mock<Transform>;
};

/**
 * Build a transform double.
 *
 * @returns the definition and the spy behind it.
 * @example createMockTransform({ name: "body/rewrap" }).definition.name
 */
export const createMockTransform = ({
  defaultOptions = {},
  name,
  rewrite,
}: {
  /**
   * The options the runner should merge a config's own options over.
   *
   * @example { printWidth: 80 }
   */
  defaultOptions?: TransformOptions;

  /**
   * The name to register it under.
   *
   * @example "body/rewrap"
   */
  name: TransformDefinition["name"];

  /**
   * What the transform does. Defaults to returning its input unchanged, which
   * is what most tests want.
   *
   * @example ({ doc }) => doc
   */
  rewrite?: Transform;
}): MockTransform => {
  const run = vi.fn<Transform>(rewrite ?? (({ doc }) => doc));

  return { definition: defineTransform({ defaultOptions, name, run }), run };
};

/**
 * Build a transform double that appends a paragraph naming itself.
 *
 * - Order is otherwise invisible: doubles that return their input unchanged
 *   compose to the same comment whichever way round they run.
 *
 * @returns the definition and the spy behind it.
 * @example createMockAppendingTransform("first").definition.name // "first"
 */
export const createMockAppendingTransform = (
  /**
   * The name to register it under, which is also the text it appends.
   *
   * @example "first"
   */
  name: TransformDefinition["name"],
): MockTransform =>
  createMockTransform({
    name,
    rewrite: ({ doc }) => ({
      ...doc,
      body: [...doc.body, { lines: [name], type: "paragraph" }],
    }),
  });
