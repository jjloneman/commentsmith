/**
 * The logging port.
 *
 * - Commentsmith runs in two very different processes, so the sink is injected
 *   rather than chosen here: the extension routes to a VS Code
 *   `LogOutputChannel`, the CLI to stderr. This module knows about neither.
 *
 * - The call shape is deliberately pino's — `logger.info({ ctx }, "message")`,
 *   with the raw throwable passed under `error` — so it reads identically to
 *   the sibling repos even though the backend differs.
 *
 * - The default sink is a no-op, which is what lets pure core code log freely
 *   without a live sink in unit tests.
 */

/**
 * Severity levels, ordered from most to least verbose.
 *
 * - The order is semantic, not alphabetical: {@link isAtOrAboveLevel} compares
 *   by index, so reordering this array changes filtering behaviour.
 */
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;

/**
 * One severity level.
 *
 * @example "warn"
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Structured context accompanying a log message.
 *
 * @example { file: "src/core/logger.ts", printWidth: 80 }
 */
export type LogContext = Record<string, unknown>;

/** One log record, as handed to a sink. */
export type LogEntry = {
  /**
   * Structured context, or `undefined` when the record was logged as a bare
   * message.
   *
   * @example { printWidth: 80 }
   */
  context: LogContext | undefined;

  /**
   * The record's severity.
   *
   * @example "warn"
   */
  level: LogLevel;

  /**
   * The human-readable message.
   *
   * @example "line exceeds budget"
   */
  message: string;

  /**
   * The area that emitted it — the `module` field bound by
   * {@link moduleLogger}.
   *
   * @example "rewrap"
   */
  module: string;
};

/**
 * Receives every record the port emits.
 *
 * @example const sink: LogSink = (entry) => { process.stderr.write(entry.message); };
 */
export type LogSink = (entry: LogEntry) => void;

/**
 * A single level's logging function.
 *
 * @example logger.warn("nothing to format")
 * @example logger.error({ error }, "failed to parse comment")
 */
type LogMethod = {
  (message: LogEntry["message"]): void;
  (context: LogContext, message: LogEntry["message"]): void;
};

/**
 * A logger bound to one module, with a method per level.
 *
 * @example moduleLogger("cli").info({ argv }, "started")
 */
export type Logger = Record<LogLevel, LogMethod>;

/** Discards every record — the default until an adapter installs a real sink. */
const noopSink: LogSink = () => {
  // Intentionally empty: core code logs unconditionally, and a consumer that
  // has not installed a sink has opted out of seeing those records.
};

let activeSink: LogSink = noopSink;

/** Install the process-wide sink. Called once, by each adapter's entry point. */
export const setLogSink = (sink: LogSink): void => {
  activeSink = sink;
};

/** Restore the no-op sink — used on extension deactivation and between tests. */
export const resetLogSink = (): void => {
  activeSink = noopSink;
};

/**
 * Whether a record at `level` should be emitted under `threshold`.
 *
 * - Exported because level filtering belongs to the sink, not to the port: the
 *   extension delegates it to VS Code's own log-level control, while the CLI
 *   applies it itself from `--log-level`.
 *
 * @returns `true` when the record is at or above the threshold.
 * @example isAtOrAboveLevel({ level: "error", threshold: "info" }) // true
 */
export const isAtOrAboveLevel = ({
  level,
  threshold,
}: {
  /**
   * The record's severity.
   *
   * @example "error"
   */
  level: LogLevel;

  /**
   * The configured minimum severity.
   *
   * @example "info"
   */
  threshold: LogLevel;
}): boolean => LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(threshold);

/**
 * Build one level's logging function, bound to a module.
 *
 * - Handles both call shapes by discriminating on the first argument's type:
 *   a string is a bare message, an object is context followed by the message.
 *
 * @returns the bound method, which forwards to whatever sink is active *at call
 *   time* rather than capturing the current one.
 */
const createLogMethod =
  ({ level, module }: Pick<LogEntry, "level" | "module">): LogMethod =>
  (
    contextOrMessage: LogContext | LogEntry["message"],
    maybeMessage?: LogEntry["message"],
  ): void => {
    const isBareMessage = typeof contextOrMessage === "string";

    activeSink({
      context: isBareMessage ? undefined : contextOrMessage,
      level,
      message: isBareMessage ? contextOrMessage : (maybeMessage ?? ""),
      module,
    });
  };

/**
 * Create a logger bound to one area of the codebase.
 *
 * @returns a logger with one method per {@link LogLevel}.
 * @example const logger = moduleLogger("rewrap");
 */
export const moduleLogger = (
  /**
   * The area name, emitted as each record's `module` field.
   *
   * @example "rewrap"
   */
  module: LogEntry["module"],
): Logger =>
  Object.fromEntries(
    LOG_LEVELS.map((level) => [level, createLogMethod({ level, module })]),
  ) as Logger;

/**
 * Convert a context object into something safely JSON-serialisable.
 *
 * - A throwable under `error` or `err` is unwrapped to
 *   `{ message, stack, type }`, mirroring pino's `stdSerializers.err`. That is
 *   why call sites pass the raw throwable and never an
 *   `error instanceof Error ? … : String(…)` ternary.
 *
 * - A non-`Error` throwable (someone threw a string) is left alone rather than
 *   coerced, so the log shows what was actually thrown.
 *
 * @returns the same shape with any throwable expanded.
 * @example serializeLogContext({ error: new TypeError("bad") })
 */
export const serializeLogContext = (
  /**
   * The raw context object from a log call.
   *
   * @example { error: new TypeError("unterminated block comment") }
   */
  context: LogContext,
): LogContext =>
  Object.fromEntries(
    Object.entries(context).map(([key, value]) =>
      (key === "err" || key === "error") && value instanceof Error
        ? [
            key,
            { message: value.message, stack: value.stack, type: value.name },
          ]
        : [key, value],
    ),
  );
