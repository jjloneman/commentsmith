import { describe, expect, test } from "vitest";

import {
  parseVsCodeFloorTag,
  UpstreamUnavailableError,
} from "./extension-host-target";

describe("parseVsCodeFloorTag", () => {
  test("reads the version out of every range spelling npm allows", () => {
    // Given/When/Then - matching the token, rather than stripping a denylist
    // of operators, covers spellings nobody enumerated
    expect(parseVsCodeFloorTag("^1.103.0")).toBe("1.103.0");
    expect(parseVsCodeFloorTag("~1.103.0")).toBe("1.103.0");
    expect(parseVsCodeFloorTag(">=1.103.0")).toBe("1.103.0");
    expect(parseVsCodeFloorTag("v1.103.0")).toBe("1.103.0");
    expect(parseVsCodeFloorTag("1.103.0")).toBe("1.103.0");
  });

  test("takes the lower bound of a compound range", () => {
    // Given/When/Then - stripping the prefix alone left the trailing half
    // behind, producing the unusable tag "1.103.0 <2.0.0"
    expect(parseVsCodeFloorTag(">=1.103.0 <2.0.0")).toBe("1.103.0");
  });

  test("rejects a partial range that names no release tag", () => {
    // Given - legal semver range syntax, but no such VS Code tag exists
    expect(() => parseVsCodeFloorTag("100")).toThrow(/names no/u);
    expect(() => parseVsCodeFloorTag("^1.103")).toThrow(/names no/u);
  });

  test("reports a malformed floor as this repo's bug, not an outage", () => {
    // Given - the checker treats an upstream failure as a pass, so a broken
    // floor arriving as one would switch the guard off without saying so
    expect(() => parseVsCodeFloorTag("*")).toThrow(Error);

    expect(() => parseVsCodeFloorTag("*")).not.toThrow(
      UpstreamUnavailableError,
    );
  });
});
