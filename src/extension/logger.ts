import type { LogOutputChannel } from "vscode";

import type { LogEntry, LogSink } from "#core/logger";

import { serializeLogContext } from "#core/logger";

/**
 * Render one record as a single output-channel line.
 *
 * - The channel already stamps the timestamp and level, so neither is repeated
 *   here — only the module tag and the structured context are ours to add.
 *
 * @returns the formatted line, e.g. `[rewrap] line exceeds budget {"printWidth":80}`.
 */
const formatEntry = ({ context, message, module }: LogEntry): string => {
  const base = `[${module}] ${message}`;

  if (context === undefined) {
    return base;
  }

  return `${base} ${JSON.stringify(serializeLogContext(context))}`;
};

/**
 * Build a sink that writes to a VS Code `LogOutputChannel`.
 *
 * - No level filtering happens here: the channel applies the level the user
 *   picked via **Developer: Set Log Level…**, so filtering first would silently
 *   override their choice.
 *
 * - The level is indexed straight onto the channel rather than switched on —
 *   `LogLevel` is exactly the set of `LogOutputChannel` log methods, so this
 *   stays fully type-checked while avoiding a five-arm switch.
 *
 * @returns a sink suitable for `setLogSink`.
 */
export const createOutputChannelSink =
  (
    /**
     * The log channel to write to, owned by the caller.
     *
     * @example window.createOutputChannel("Commentsmith", { log: true })
     */
    channel: LogOutputChannel,
  ): LogSink =>
  (entry: LogEntry): void => {
    const line = formatEntry(entry);

    channel[entry.level](line);
  };
