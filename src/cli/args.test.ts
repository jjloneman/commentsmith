import { describe, expect, test } from "vitest";

import { hasFlag, parseLogLevel } from "./args";

describe("parseLogLevel", () => {
  test("falls back to the default when the flag is absent", () => {
    // Given/When/Then - a bare invocation gets the documented default
    expect(parseLogLevel(["src/core/logger.ts"])).toBe("info");
  });

  test("reads a recognised level from the flag", () => {
    // Given/When/Then
    expect(parseLogLevel(["--log-level=debug"])).toBe("debug");
  });

  test("falls back rather than erroring on an unrecognised level", () => {
    // Given/When - a typo in a log flag
    const level = parseLogLevel(["--log-level=verbose"]);

    // Then - it degrades instead of stopping the CLI doing its actual job
    expect(level).toBe("info");
  });

  test("takes the last flag when it is repeated", () => {
    // Given - a wrapper's level followed by the user's own override
    const argv = ["--log-level=info", "file.ts", "--log-level=debug"];

    // When
    const level = parseLogLevel(argv);

    // Then - last-wins, matching every other CLI's flag semantics
    expect(level).toBe("debug");
  });
});

describe("hasFlag", () => {
  test("finds a flag under its long spelling", () => {
    // Given/When/Then
    expect(hasFlag({ aliases: ["--help", "-h"], argv: ["--help"] })).toBe(true);
  });

  test("finds a flag under its short alias", () => {
    // Given/When/Then - either spelling counts
    expect(hasFlag({ aliases: ["--help", "-h"], argv: ["-h"] })).toBe(true);
  });

  test("reports absence when no alias is present", () => {
    // Given/When/Then - a plain file argument is not a flag
    expect(hasFlag({ aliases: ["--help", "-h"], argv: ["file.ts"] })).toBe(
      false,
    );
  });
});
