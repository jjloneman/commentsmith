/**
 * The transform registry — a lookup from configured name to implementation.
 *
 * - It is a **value the caller passes in**, not a module-level map transforms
 *   register into on import. A registration global leaks between tests, makes
 *   the pipeline's real inputs invisible at its call site, and would force
 *   every adapter to share one set of transforms.
 */

import type { TransformDefinition, TransformOptions } from "#core/config/types";

import { ConfigError } from "#core/config/errors";

/** Every registered transform, keyed by the name a config refers to it by. */
export type TransformRegistry = ReadonlyMap<
  TransformDefinition["name"],
  TransformDefinition
>;

/**
 * Declare a transform, keeping its precise options type at the definition site.
 *
 * - The registry is heterogeneous — every transform has a different options
 *   shape — so it stores the erased {@link TransformOptions} form. This
 *   function is where that erasure happens, and it is the reason a transform's
 *   `run` is still checked against its own options type when it is written.
 *
 * - The assertion is the standard cost of a keyed collection over differently
 *   typed members. It is safe in the direction that matters: `run` only ever
 *   receives the options built from this same definition's `defaultOptions`.
 *
 * @returns the definition, ready to place in a registry.
 *
 * @example
 * defineTransform({
 *   defaultOptions: { marker: "-" },
 *   name: "body/bulletize",
 *   run: ({ doc }) => doc,
 * });
 */
export const defineTransform = <Options extends TransformOptions>(
  /**
   * The transform's name, defaults, and implementation.
   *
   * @example { defaultOptions: {}, name: "body/rewrap", run: ({ doc }) => doc }
   */
  definition: TransformDefinition<Options>,
): TransformDefinition => definition as TransformDefinition;

/**
 * Build a registry from a list of definitions.
 *
 * - A duplicate name throws rather than last-wins. Two transforms answering to
 *   one name means a config's meaning depends on array order in a list nobody
 *   thinks of as ordered, and silently dropping one of them is the worse
 *   outcome.
 *
 * @returns a read-only lookup from name to definition.
 * @throws ConfigError when two definitions share a name.
 * @example createTransformRegistry([]).size // 0
 */
export const createTransformRegistry = (
  /**
   * The definitions to register, in any order.
   *
   * @example [rewrap]
   */
  definitions: readonly TransformDefinition[],
): TransformRegistry => {
  const registry = new Map<TransformDefinition["name"], TransformDefinition>();

  for (const definition of definitions) {
    if (registry.has(definition.name)) {
      throw new ConfigError(
        `duplicate transform "${definition.name}" in the registry`,
      );
    }

    registry.set(definition.name, definition);
  }

  return registry;
};

/**
 * List a registry's names for a diagnostic.
 *
 * - Sorted, because the message is read by a human comparing it against what
 *   they typed, and registration order carries no meaning for that.
 *
 * @returns the names joined for display, or `"none"` when the registry is empty.
 * @example describeRegistered(createTransformRegistry([])) // "none"
 */
export const describeRegistered = (registry: TransformRegistry): string => {
  const names = [...registry.keys()].sort();

  return names.length > 0 ? names.join(", ") : "none";
};
