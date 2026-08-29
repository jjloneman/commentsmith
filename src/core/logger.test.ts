import { afterEach, describe, expect, test, vi } from "vitest";

import type { LogEntry, LogSink } from "./logger";

import {
  isAtOrAboveLevel,
  moduleLogger,
  resetLogSink,
  serializeLogContext,
  setLogSink,
} from "./logger";

describe("moduleLogger", () => {
  afterEach(() => {
    // Cleanup - the sink is process-wide, so leaving one installed would leak
    // into the next test file.
    resetLogSink();
  });

  test("emits a bare message with no context", () => {
    // Given - an installed sink
    const mockSink = vi.fn<LogSink>();
    setLogSink(mockSink);

    // When - a message is logged without context
    moduleLogger("parser").info("parsed a comment");

    // Then - the record carries an explicit `undefined` context
    expect(mockSink).toHaveBeenCalledExactlyOnceWith({
      context: undefined,
      level: "info",
      message: "parsed a comment",
      module: "parser",
    } satisfies LogEntry);
  });

  test("binds the module name and carries structured context", () => {
    // Given - an installed sink
    const mockSink = vi.fn<LogSink>();
    setLogSink(mockSink);

    // When - a message is logged with context, through a differently-named module
    moduleLogger("rewrap").warn({ printWidth: 80 }, "line exceeds budget");

    // Then - both the context and the bound module name reach the sink
    expect(mockSink).toHaveBeenCalledExactlyOnceWith({
      context: { printWidth: 80 },
      level: "warn",
      message: "line exceeds budget",
      module: "rewrap",
    } satisfies LogEntry);
  });

  test("routes to whichever sink is active at call time", () => {
    // Given - a logger built while one sink is installed
    const mockFirstSink = vi.fn<LogSink>();
    setLogSink(mockFirstSink);

    const logger = moduleLogger("parser");

    // And - a second sink installed after the logger already exists
    const mockSecondSink = vi.fn<LogSink>();
    setLogSink(mockSecondSink);

    // When - the pre-built logger emits
    logger.info("late binding");

    // Then - the record goes to the current sink, not the captured one
    expect(mockSecondSink).toHaveBeenCalledTimes(1);

    // And - the superseded sink never sees it
    expect(mockFirstSink).not.toHaveBeenCalled();
  });

  test("degrades to an empty message when a caller omits it", () => {
    // Given - an installed sink
    const mockSink = vi.fn<LogSink>();
    setLogSink(mockSink);

    // When - context is passed with no message. The overloads forbid this in
    // TypeScript, but both bundles are CommonJS and a JavaScript consumer can
    // still make the call.
    // @ts-expect-error - deliberately exercising the untyped misuse path
    moduleLogger("parser").info({ printWidth: 80 });

    // Then - the record still forms, with an empty message rather than the
    // string "undefined" leaking into the log output
    expect(mockSink).toHaveBeenCalledExactlyOnceWith({
      context: { printWidth: 80 },
      level: "info",
      message: "",
      module: "parser",
    } satisfies LogEntry);
  });

  test("discards records once the sink is reset", () => {
    // Given - a sink that is then torn down
    const mockSink = vi.fn<LogSink>();
    setLogSink(mockSink);
    resetLogSink();

    // When - a record is logged with no sink installed
    moduleLogger("parser").error("this goes nowhere");

    // Then - the no-op default swallowed it rather than throwing
    expect(mockSink).not.toHaveBeenCalled();
  });
});

describe("isAtOrAboveLevel", () => {
  test("admits a record at the threshold", () => {
    // Given/When/Then - an exact match passes the filter
    expect(isAtOrAboveLevel({ level: "warn", threshold: "warn" })).toBe(true);
  });

  test("admits a record above the threshold", () => {
    // Given/When/Then - `error` outranks `info`
    expect(isAtOrAboveLevel({ level: "error", threshold: "info" })).toBe(true);
  });

  test("rejects a record below the threshold", () => {
    // Given/When/Then - `debug` is more verbose than `info`
    expect(isAtOrAboveLevel({ level: "debug", threshold: "info" })).toBe(false);
  });
});

describe("serializeLogContext", () => {
  test("unwraps a throwable passed under `error`", () => {
    // Given - a real error with a populated stack
    const mockError = new TypeError("unterminated block comment");

    // When - it is serialized alongside an ordinary field
    const serialized = serializeLogContext({ error: mockError, file: "a.ts" });

    // Then - the throwable expands to message/stack/type, mirroring pino
    expect(serialized).toStrictEqual({
      error: {
        message: "unterminated block comment",
        stack: mockError.stack,
        type: "TypeError",
      },
      file: "a.ts",
    });
  });

  test("leaves a non-Error throwable as it was thrown", () => {
    // Given/When - something other than an Error was thrown
    const serialized = serializeLogContext({ error: "just a string" });

    // Then - it is passed through, since coercing it would hide what was thrown
    expect(serialized).toStrictEqual({ error: "just a string" });
  });
});
