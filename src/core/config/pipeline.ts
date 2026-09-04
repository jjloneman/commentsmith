/**
 * The pipeline runner — applies resolved transforms to a comment, in order.
 *
 * - This is the whole of the "ordered transforms" stage: parse and render sit
 *   either side of it, and neither is this module's business.
 */

import type { CommentDoc } from "#core/comment/types";
import type { TransformRegistry } from "#core/config/registry";
import type {
  ResolvedConfig,
  ResolvedTransformEntry,
} from "#core/config/types";

import { ConfigError, TransformError } from "#core/config/errors";
import { describeRegistered } from "#core/config/registry";
import { moduleLogger } from "#core/logger";

const logger = moduleLogger("config");

/**
 * Apply one transform to a comment.
 *
 * - An unknown name is a configuration error rather than a silent skip: a
 *   typo'd transform that quietly does nothing is indistinguishable from one
 *   that ran and had no effect.
 *
 * @returns the rewritten comment.
 * @throws ConfigError when the name is not registered.
 * @throws TransformError when the transform itself throws.
 */
const applyTransform = ({
  doc,
  entry,
  printWidth,
  registry,
}: {
  /** The comment as the previous transform left it. */
  doc: CommentDoc;

  /** The transform to apply, with its options already resolved. */
  entry: ResolvedTransformEntry;

  /** The column body text is wrapped to. */
  printWidth: ResolvedConfig["printWidth"];

  /** The transforms available to run. */
  registry: TransformRegistry;
}): CommentDoc => {
  const definition = registry.get(entry.name);

  if (definition === undefined) {
    throw new ConfigError(
      `unknown transform "${entry.name}". ` +
        `Registered transforms: ${describeRegistered(registry)}`,
    );
  }

  logger.trace({ transform: entry.name }, "applying transform");

  try {
    return definition.run({
      doc,

      /*
       * `printWidth` is seeded between the two option layers because it is a
       * document-level setting a body transform has to honor, and nothing else
       * would carry it there.
       *
       * - The order is the whole point: a transform's own default is the
       *   floor, the configuration's width overrides it, and a per-entry
       *   option still wins over both — so one step can wrap to a different
       *   column without the rest being restated.
       *
       * - Without this the setting would validate, merge, default, and log,
       *   then quietly do nothing the moment a wrapping transform existed.
       */
      options: {
        ...definition.defaultOptions,
        printWidth,
        ...entry.options,
      },
    });
  } catch (error) {
    logger.error({ error, transform: entry.name }, "transform threw");

    throw new TransformError({ cause: error, transformName: entry.name });
  }
};

/**
 * Run a resolved configuration's transforms over a comment.
 *
 * - An empty pipeline returns the comment unchanged, which is the `preserve`
 *   preset and not a degenerate case.
 *
 * @returns the rewritten comment.
 * @throws ConfigError when a configured transform is not registered.
 * @throws TransformError when a transform throws.
 * @example runPipeline({ config, doc: parseComment("// hi"), registry })
 */
export const runPipeline = ({
  config,
  doc,
  registry,
}: {
  /**
   * The resolved configuration naming the transforms to run.
   *
   * @example { printWidth: 80, transforms: [] }
   */
  config: ResolvedConfig;

  /**
   * The comment to rewrite.
   *
   * @example parseComment("// hi")
   */
  doc: CommentDoc;

  /**
   * The transforms available to run.
   *
   * @example createTransformRegistry([rewrap])
   */
  registry: TransformRegistry;
}): CommentDoc =>
  config.transforms.reduce(
    (current, entry) =>
      applyTransform({
        doc: current,
        entry,
        printWidth: config.printWidth,
        registry,
      }),
    doc,
  );
