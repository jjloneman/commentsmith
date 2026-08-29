import type { LogLevel } from "#core/logger";

import { LOG_LEVELS } from "#core/logger";

/** The level used when `--log-level` is absent or unrecognized. */
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

const LOG_LEVEL_FLAG = "--log-level=";

/**
 * Whether any of `names` appears in `argv`.
 *
 * @returns `true` when at least one alias is present.
 * @example hasFlag({ aliases: ["--help", "-h"], argv }) // true
 */
export const hasFlag = ({
  aliases,
  argv,
}: {
  /**
   * Every spelling of the flag.
   *
   * @example ["--version", "-v"]
   */
  aliases: string[];

  /**
   * The raw process arguments, excluding the node binary and the entry point.
   *
   * @example ["--version"]
   */
  argv: string[];
}): boolean => aliases.some((alias) => argv.includes(alias));

/**
 * Read `--log-level` out of argv.
 *
 * - Uses the **last** occurrence, not the first: a repeated flag is last-wins
 *   everywhere else, so a user appending `--log-level=debug` to a wrapper's
 *   `--log-level=info` gets the debug output they asked for.
 *
 * - An unrecognized value falls back to the default rather than erroring. A
 *   typo in a log flag should not stop the CLI doing its actual job.
 *
 * @returns the requested level, or the default when absent or unrecognized.
 * @example parseLogLevel(["--log-level=debug"]) // "debug"
 */
export const parseLogLevel = (
  /**
   * The raw process arguments, excluding the node binary and the entry point.
   *
   * @example ["--log-level=debug", "src/core/logger.ts"]
   */
  argv: string[],
): LogLevel => {
  const flag = argv.findLast((argument) => argument.startsWith(LOG_LEVEL_FLAG));
  const value = flag?.slice(LOG_LEVEL_FLAG.length);

  return LOG_LEVELS.find((level) => level === value) ?? DEFAULT_LOG_LEVEL;
};
