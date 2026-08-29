import type { Mocked } from "vitest";
import type { LogOutputChannel } from "vscode";

import { describe, expect, test, vi } from "vitest";

import type { LogEntry } from "#core/logger";

import { createOutputChannelSink } from "./logger";

/** The subset of the channel the sink actually calls — one method per level. */
type ChannelLogMethods = Pick<
  LogOutputChannel,
  "debug" | "error" | "info" | "trace" | "warn"
>;

/** Build a channel double whose every log method is an assertable mock. */
const createMockChannel = (): Mocked<ChannelLogMethods> => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
});

/**
 * Widen a channel double to the full `LogOutputChannel` the sink expects.
 *
 * - Assigned to `Partial<LogOutputChannel>` first, per the repo's rule on
 *   stubbing large APIs: every property the double *does* supply stays checked
 *   against the real type, so a typo'd method name fails here rather than
 *   silently never being called.
 */
const asChannel = (mock: Mocked<ChannelLogMethods>): LogOutputChannel => {
  const partial: Partial<LogOutputChannel> = mock;

  return partial as LogOutputChannel;
};

const mockEntry: LogEntry = {
  context: undefined,
  level: "warn",
  message: "line exceeds budget",
  module: "rewrap",
};

describe("createOutputChannelSink", () => {
  test("tags the line with its module and leaves timestamps to the channel", () => {
    // Given - a channel double
    const mockChannel = createMockChannel();

    // When - a context-free record is logged
    createOutputChannelSink(asChannel(mockChannel))(mockEntry);

    // Then - the line carries only the module tag and message; the channel
    // stamps the time and level itself, so repeating them would be noise
    expect(mockChannel.warn).toHaveBeenCalledExactlyOnceWith(
      "[rewrap] line exceeds budget",
    );
  });

  test("appends serialized context when the record carries it", () => {
    // Given - a channel double
    const mockChannel = createMockChannel();

    // When - a record with context is logged
    createOutputChannelSink(asChannel(mockChannel))({
      ...mockEntry,
      context: { printWidth: 80 },
    });

    // Then - the context trails the message as JSON
    expect(mockChannel.warn).toHaveBeenCalledExactlyOnceWith(
      '[rewrap] line exceeds budget {"printWidth":80}',
    );
  });

  test("unwraps a throwable through the shared serializer", () => {
    // Given - a channel double and a real error
    const mockChannel = createMockChannel();
    const mockError = new TypeError("unterminated block comment");

    // When
    createOutputChannelSink(asChannel(mockChannel))({
      ...mockEntry,
      context: { error: mockError },
      level: "error",
    });

    // Then - the message/type survive, rather than logging "{}" for the Error
    const [line] = mockChannel.error.mock.lastCall ?? [];

    expect(line).toContain("unterminated block comment");
    expect(line).toContain("TypeError");
  });

  test("routes every level to its matching channel method", () => {
    // Given - a channel double and a sink over it
    const mockChannel = createMockChannel();
    const sink = createOutputChannelSink(asChannel(mockChannel));

    // When - one record is logged at each level
    sink({ ...mockEntry, level: "trace" });
    sink({ ...mockEntry, level: "debug" });
    sink({ ...mockEntry, level: "info" });
    sink({ ...mockEntry, level: "warn" });
    sink({ ...mockEntry, level: "error" });

    // Then - each method receives exactly its own record, proving the indexed
    // `channel[entry.level]` lookup covers the whole LogLevel union
    expect(mockChannel.trace).toHaveBeenCalledTimes(1);
    expect(mockChannel.debug).toHaveBeenCalledTimes(1);
    expect(mockChannel.info).toHaveBeenCalledTimes(1);
    expect(mockChannel.warn).toHaveBeenCalledTimes(1);
    expect(mockChannel.error).toHaveBeenCalledTimes(1);
  });

  test("does not filter by level, deferring to the channel's own setting", () => {
    // Given - a channel double
    const mockChannel = createMockChannel();

    // When - the most verbose level is logged
    createOutputChannelSink(asChannel(mockChannel))({
      ...mockEntry,
      level: "trace",
    });

    // Then - it still reaches the channel. Filtering here would silently
    // override the level the user picked via "Developer: Set Log Level…".
    expect(mockChannel.trace).toHaveBeenCalledTimes(1);
  });
});
