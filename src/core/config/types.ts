/**
 * The configuration vocabulary — what a user writes, and what the pipeline
 * runs.
 *
 * - The model is ESLint's rather than a template language's: a preset is a
 *   named list of transforms plus their options, and composition happens
 *   through `extends` and per-transform overrides. A template language
 *   expressive enough to describe "one bullet per sentence" would be a
 *   programming language.
 *
 * - The transform list is an **array, not an object keyed by name**, because
 *   run order is semantic. A keyed object would also be sorted alphabetically
 *   by this repo's own lint rules, which would quietly reorder a pipeline into
 *   incorrectness.
 *
 * - {@link Config} is what a human writes, so every field is optional;
 *   {@link ResolvedConfig} is what the runner consumes, so none are. Keeping
 *   them as separate types is what stops defaults being re-applied at each
 *   call site.
 */

import type { CommentDoc } from "#core/comment/types";

/**
 * The wrap column used when no config names one.
 *
 * - It lives beside the type rather than beside the resolver because the JSON
 *   Schema advertises it as its declared default too. One constant, read by
 *   both, cannot disagree with itself.
 */
export const DEFAULT_PRINT_WIDTH = 80;

/**
 * The options one transform understands.
 *
 * - Deliberately open: each transform declares its own shape, and the registry
 *   is a heterogeneous collection that cannot name all of them at once.
 *
 * @example { marker: "-" }
 */
export type TransformOptions = Record<string, unknown>;

/**
 * A pure rewrite from one comment to another.
 *
 * - Purity is the contract, not a suggestion: transforms are composed, reordered
 *   by configuration, and applied twice in idempotency tests, none of which
 *   survives a transform that mutates its input or reaches outside itself.
 *
 * @example ({ doc }) => doc
 */
export type Transform<Options extends TransformOptions = TransformOptions> =
  (input: {
    /**
     * The comment to rewrite.
     *
     * @example parseComment("// hi")
     */
    doc: CommentDoc;

    /**
     * The transform's options, with its defaults already merged underneath.
     *
     * @example { printWidth: 80 }
     */
    options: Options;
  }) => CommentDoc;

/** A transform plus everything the registry and the runner need to apply it. */
export type TransformDefinition<
  Options extends TransformOptions = TransformOptions,
> = {
  /**
   * Every option the transform understands, at its fallback value.
   *
   * - Declaring the full set here rather than defaulting inside `run` is what
   *   lets a user override one option without restating the rest.
   *
   * @example { marker: "-" }
   */
  defaultOptions: Options;

  /**
   * The name a config refers to this transform by, namespaced by the layer it
   * operates on.
   *
   * @example "body/rewrap"
   */
  name: string;

  /** The rewrite itself. */
  run: Transform<Options>;
};

/** One entry in a config's ordered transform list. */
export type TransformEntry = {
  /**
   * Whether to run it. `false` suppresses an entry inherited from a preset
   * without having to restate the rest of that preset's pipeline.
   *
   * @example false
   */
  enabled?: boolean;

  /**
   * The registered transform's name.
   *
   * @example "body/rewrap"
   */
  name: string;

  /**
   * Options merged over the transform's own defaults.
   *
   * - The merge is **shallow**. A deep merge would leave a user unable to clear
   *   an inherited nested value, which is a worse failure than restating one.
   *
   * @example { printWidth: 100 }
   */
  options?: TransformOptions;
};

/** A configuration as a human writes it, before presets are resolved. */
export type Config = {
  /**
   * Preset names to inherit from, applied left to right so a later entry wins.
   *
   * @example ["bullets"]
   */
  extends?: string[];

  /**
   * The column body text is wrapped to.
   *
   * @example 80
   */
  printWidth?: number;

  /**
   * The transforms to run, in the order they run in.
   *
   * @example [{ name: "body/rewrap" }]
   */
  transforms?: TransformEntry[];
};

/**
 * A configuration someone gave a name to.
 *
 * - Structurally identical to {@link Config} on purpose: a preset is nothing
 *   more than a config with a name, so a user can promote their own config to a
 *   preset without reshaping it.
 */
export type Preset = Config;

/**
 * Every preset available to `extends`, keyed by name.
 *
 * - Passed into the resolver rather than read from a module global, so a
 *   config file's own presets can join the built-ins without core knowing that
 *   files exist.
 *
 * @example { preserve: { transforms: [] } }
 */
export type PresetTable = Record<string, Preset>;

/**
 * One transform to run, with nothing left to default.
 *
 * - Derived from {@link TransformEntry} rather than re-spelled, so its fields
 *   keep their documentation and a shape change propagates through `tsc`.
 *   `enabled` is absent because a disabled entry is dropped during resolution
 *   rather than carried as a flag the runner must remember to check.
 */
export type ResolvedTransformEntry = Required<
  Pick<TransformEntry, "name" | "options">
>;

/** A fully resolved configuration — the runner's input. */
export type ResolvedConfig = {
  /**
   * The column body text is wrapped to.
   *
   * @example 80
   */
  printWidth: NonNullable<Config["printWidth"]>;

  /** The enabled transforms, in run order. */
  transforms: ResolvedTransformEntry[];
};
