/** Thrown when a configuration cannot be resolved into a runnable pipeline. */
export class ConfigError extends Error {
  constructor(
    /**
     * What was wrong with the configuration, phrased for a CLI diagnostic.
     *
     * @example 'unknown preset "bullet". Available presets: bullets, preserve'
     */
    message: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Thrown when a transform itself fails.
 *
 * - The wrapping exists to name the offender. A pipeline is a reduction over
 *   several transforms, so an unwrapped throw tells a user their comment failed
 *   to format without telling them which step to disable.
 *
 * - The original throwable is preserved under `cause` rather than flattened
 *   into the message, so a stack trace survives to the log.
 */
export class TransformError extends Error {
  /**
   * The transform that threw.
   *
   * @example "body/rewrap"
   */
  public readonly transformName: string;

  constructor({
    cause,
    transformName,
  }: {
    /**
     * Whatever the transform threw, unmodified.
     *
     * @example new TypeError("cannot read properties of undefined")
     */
    cause: unknown;

    /**
     * The name the failing transform is registered under.
     *
     * @example "body/rewrap"
     */
    transformName: string;
  }) {
    super(`the "${transformName}" transform failed`, { cause });
    this.name = "TransformError";
    this.transformName = transformName;
  }
}
