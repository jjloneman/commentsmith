import type { MockInstance } from "vitest";

import { afterEach, describe, expect, test, vi } from "vitest";

import type { LogEntry } from "#core/logger";

import { createStderrSink } from "./logger";

const mockEntry: LogEntry = {
  context: { file: "a.ts" },
  level: "warn",
  message: "line exceeds budget",
  module: "rewrap",
};

describe("createStderrSink", () => {
  afterEach(() => {
    // Cleanup - the stream spies below patch real globals.
    vi.restoreAllMocks();
  });

  test("emits one NDJSON line carrying the record and its context", () => {
    // Given - a machine-readable sink admitting every level
    const mockWrite = vi.fn<(line: string) => void>();
    const sink = createStderrSink({
      pretty: false,
      threshold: "trace",
      write: mockWrite,
    });

    // When - a record with context is logged
    sink(mockEntry);

    // Then - exactly one line is written
    expect(mockWrite).toHaveBeenCalledTimes(1);

    const [line] = mockWrite.mock.lastCall ?? [];

    // And - it is newline-terminated, so consumers can split on lines
    expect(line?.endsWith("\n")).toBe(true);

    // And - the context is flattened alongside the record's own fields
    expect(JSON.parse(line ?? "")).toMatchObject({
      file: "a.ts",
      level: "warn",
      message: "line exceeds budget",
      module: "rewrap",
    });
  });

  test("includes the module and message in human-readable output", () => {
    // Given - a TTY-facing sink admitting every level
    const mockWrite = vi.fn<(line: string) => void>();
    const sink = createStderrSink({
      pretty: true,
      threshold: "trace",
      write: mockWrite,
    });

    // When - a record is logged
    sink(mockEntry);

    // Then - the line carries the level, module tag, and message
    const [line] = mockWrite.mock.lastCall ?? [];

    expect(line).toContain("WARN");
    expect(line).toContain("[rewrap]");
    expect(line).toContain("line exceeds budget");
  });

  test("omits the context object when a record carries none", () => {
    // Given - sinks in both output modes
    const mockJsonWrite = vi.fn<(line: string) => void>();
    const mockPrettyWrite = vi.fn<(line: string) => void>();

    // And - a record logged as a bare message, with no context
    const bareEntry: LogEntry = { ...mockEntry, context: undefined };

    // When - it goes through the machine-readable sink
    createStderrSink({
      pretty: false,
      threshold: "trace",
      write: mockJsonWrite,
    })(bareEntry);

    // And - through the human-readable one
    createStderrSink({
      pretty: true,
      threshold: "trace",
      write: mockPrettyWrite,
    })(bareEntry);

    // Then - the NDJSON line carries only the record's own fields
    const [jsonLine] = mockJsonWrite.mock.lastCall ?? [];
    const [prettyLine] = mockPrettyWrite.mock.lastCall ?? [];

    expect(Object.keys(JSON.parse(jsonLine ?? "") as object)).toStrictEqual([
      "level",
      "message",
      "module",
      "time",
    ]);

    // And - the pretty line ends at the message, with no trailing `{}`
    expect(prettyLine?.trimEnd().endsWith("line exceeds budget")).toBe(true);
  });

  test("never lets context shadow the record's own fields", () => {
    // Given - a machine-readable sink
    const mockWrite = vi.fn<(line: string) => void>();
    const sink = createStderrSink({
      pretty: false,
      threshold: "trace",
      write: mockWrite,
    });

    // When - context collides with every field the record supplies itself
    sink({
      ...mockEntry,
      context: {
        level: "shadowed",
        message: "shadowed",
        module: "shadowed",
        time: 42,
      },
    });

    // Then - the record's own level, message, and module survive intact
    const [line] = mockWrite.mock.lastCall ?? [];
    const parsed = JSON.parse(line ?? "") as Record<string, unknown>;

    expect(parsed).toMatchObject({
      level: "warn",
      message: "line exceeds budget",
      module: "rewrap",
    });

    // And - `time` is still a timestamp rather than the colliding value
    expect(typeof parsed.time).toBe("string");
  });

  test("writes to the real stderr by default, never stdout", () => {
    // Given - spies on both real streams, so nothing reaches the terminal
    const stderrWriteSpy: MockInstance<typeof process.stderr.write> = vi
      .spyOn(process.stderr, "write")
      .mockReturnValue(true);

    const stdoutWriteSpy: MockInstance<typeof process.stdout.write> = vi
      .spyOn(process.stdout, "write")
      .mockReturnValue(true);

    // And - a sink built without an injected writer, exercising the default
    const sink = createStderrSink({ pretty: false, threshold: "trace" });

    // When
    sink(mockEntry);

    // Then - the record went to stderr
    expect(stderrWriteSpy).toHaveBeenCalledTimes(1);

    // And - stdout stayed untouched, which is the whole point: it carries the
    // formatted document in `--stdin-filepath` mode.
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
  });

  test("drops a record below the configured threshold", () => {
    // Given - a sink admitting warnings and above
    const mockWrite = vi.fn<(line: string) => void>();
    const sink = createStderrSink({
      pretty: false,
      threshold: "warn",
      write: mockWrite,
    });

    // When - a debug record arrives
    sink({ ...mockEntry, level: "debug" });

    // Then - nothing reaches the stream
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
