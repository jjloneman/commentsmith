import type { LogEntry, LogLevel, LogSink } from "#core/logger";

import { isAtOrAboveLevel, serializeLogContext } from "#core/logger";

/**
 * Render one record for a human reading a terminal.
 *
 * - Timestamped because a CLI has no surrounding log viewer to supply one.
 *
 * @returns the formatted line, without a trailing newline.
 */
const formatPretty = ({
  context,
  level,
  message,
  module,
}: LogEntry): string => {
  // `slice(11, 23)` takes the time-of-day portion of an ISO timestamp:
  // "2026-08-25T19:14:48.412Z" → "19:14:48.412". The date is dropped because a
  // CLI run is short enough that only the time carries information.
  const timestamp = new Date().toISOString().slice(11, 23);

  // e.g. "19:14:48.412 WARN  [rewrap] line exceeds budget" — the level is
  // padded to the width of the longest name ("trace"/"debug"/"error") so the
  // module column stays aligned across records.
  const base = `${timestamp} ${level.toUpperCase().padEnd(5)} [${module}] ${message}`;

  if (context === undefined) {
    return base;
  }

  return `${base} ${JSON.stringify(serializeLogContext(context))}`;
};

/**
 * Render one record as a single NDJSON line, for machine consumers.
 *
 * - Context is spread **first** so the record's own fields always win. Spread
 *   last, a context key named `level`, `message`, `module`, or `time` would
 *   silently replace the real value — and `logger.info({ time: elapsed }, …)`
 *   is an entirely natural call.
 *
 * @returns the formatted line, without a trailing newline.
 */
const formatJson = ({ context, level, message, module }: LogEntry): string =>
  JSON.stringify({
    ...(context === undefined ? {} : serializeLogContext(context)),
    level,
    message,
    module,
    time: new Date().toISOString(),
  });

/**
 * Build a sink that writes to **stderr**.
 *
 * - stderr, never stdout: stdout carries the formatted document in
 *   `--stdin-filepath` mode, so a diagnostic written there would corrupt the
 *   caller's pipe.
 *
 * - The CLI filters by level itself, unlike the extension sink — there is no
 *   host log-level control to defer to.
 *
 * @returns a sink suitable for `setLogSink`.
 */
export const createStderrSink = ({
  pretty,
  threshold,
  write = (line: string): void => {
    process.stderr.write(line);
  },
}: {
  /**
   * Human-readable when `true`, NDJSON when `false`.
   *
   * @example process.stderr.isTTY === true
   */
  pretty: boolean;

  /**
   * The minimum severity to emit.
   *
   * @example "info"
   */
  threshold: LogLevel;

  /**
   * The stderr writer; injectable so tests need no real stream.
   *
   * @example (line) => { collected.push(line); }
   */
  write?: (line: string) => void;
}): LogSink => {
  return (entry: LogEntry): void => {
    if (!isAtOrAboveLevel({ level: entry.level, threshold })) {
      return;
    }

    write(`${pretty ? formatPretty(entry) : formatJson(entry)}\n`);
  };
};
