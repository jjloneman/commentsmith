/**
 * The esbuild `target` for the extension bundle, plus the machinery that
 * verifies it still matches reality.
 *
 * - The constant lives here rather than in [esbuild.config.ts](../../esbuild.config.ts)
 *   because that module runs a build on import; the checker needs to read the
 *   value without triggering one, so the single source of truth sits in the
 *   module both can import.
 */

import { readFileSync } from "node:fs";

/**
 * The Node version the VS Code extension host runs, as an esbuild target.
 *
 * - **Derived, not chosen.** VS Code 1.103 (the `engines.vscode` floor) ships
 *   Electron 37.2.3, which bundles Node 22.17.0.
 *
 * - Verified in CI by `pnpm check:host-target`, so raising `engines.vscode`
 *   without revisiting this fails the build rather than silently emitting
 *   syntax the oldest supported host cannot parse.
 */
export const EXTENSION_HOST_TARGET = "node22";

/**
 * Raised when the upstream data cannot be obtained or makes no sense.
 *
 * - Distinct from an ordinary `Error` so the checker can tell "GitHub is down"
 *   (tolerable — warn and pass) from "this script or its config is broken"
 *   (must fail loudly). A bare `catch` cannot make that distinction, which is
 *   how a guard silently stops guarding.
 */
export class UpstreamUnavailableError extends Error {
  public override readonly name = "UpstreamUnavailableError";
}

/**
 * Fetch an upstream resource, normalizing every failure mode.
 *
 * - Both a rejected `fetch` (offline, DNS failure, TLS error) and a non-OK
 *   response become {@link UpstreamUnavailableError}. The rejection path is the
 *   one that matters most: a machine with no network never produces a
 *   `Response` to check `.ok` on, so checking status alone would let an offline
 *   `pnpm check` fail with a raw TypeError.
 *
 * @returns the response body as text.
 */
const fetchUpstream = async ({
  description,
  url,
}: {
  /**
   * What is being fetched, for the error message.
   *
   * @example "VS Code's .npmrc at tag 1.103.0"
   */
  description: string;

  /**
   * The absolute URL to fetch.
   *
   * @example "https://releases.electronjs.org/releases.json"
   */
  url: string;
}): Promise<string> => {
  const response = await fetch(url).catch((error: unknown) => {
    throw new UpstreamUnavailableError(
      `Could not reach ${description}: ${String(error)}`,
    );
  });

  if (!response.ok) {
    throw new UpstreamUnavailableError(
      `Could not read ${description} (HTTP ${String(response.status)})`,
    );
  }

  return response.text();
};

/** VS Code pins its Electron version in this file, one `key="value"` per line. */
const VS_CODE_NPMRC_URL = (tag: string): string =>
  `https://raw.githubusercontent.com/microsoft/vscode/${tag}/.npmrc`;

/** Every Electron release, each carrying the Node version it bundles. */
const ELECTRON_RELEASES_URL = "https://releases.electronjs.org/releases.json";

/** One entry of Electron's published release index. */
type ElectronRelease = {
  /**
   * The Node version this Electron bundles — what the extension host actually
   * runs.
   *
   * @example "22.17.0"
   */
  node: string;

  /**
   * The Electron version, matching VS Code's `.npmrc` `target`.
   *
   * @example "37.2.3"
   */
  version: string;
};

/** A three-part version anywhere inside a range expression. */
const VS_CODE_FLOOR_VERSION = /(?<tag>\d+\.\d+\.\d+)/u;

/**
 * Read the VS Code release tag out of an `engines.vscode` range.
 *
 * - **Strict on purpose.** The result is interpolated into a
 *   raw.githubusercontent URL as a git tag, and this checker reports a failed
 *   fetch as an upstream outage — a pass. So a lenient parse yields a
 *   plausible-looking tag, a 404, and a green build with the guard silently
 *   switched off, which is the one outcome this script exists to prevent.
 *
 * - Matching the version *token* rather than stripping known operators also
 *   drops the trailing half of a compound range: `">=1.103.0 <2.0.0"` used to
 *   survive as `"1.103.0 <2.0.0"`.
 *
 * - A partial range such as `"100"` or `"^1.103"` is legal semver but names no
 *   VS Code tag, so it must fail here rather than later and quieter.
 *
 * - Takes the first version in the expression, which is the floor under npm's
 *   convention of writing the lower bound first.
 *
 * @returns the bare release tag.
 * @throws Error when the range names no resolvable version.
 * @example parseVsCodeFloorTag("^1.103.0") // "1.103.0"
 */
export const parseVsCodeFloorTag = (
  /**
   * The raw `engines.vscode` range.
   *
   * @example "^1.103.0"
   */
  range: string,
): string => {
  const tag = VS_CODE_FLOOR_VERSION.exec(range)?.groups?.tag;

  if (tag === undefined) {
    /*
     * Deliberately a plain Error, never UpstreamUnavailableError: a malformed
     * floor is this repo's bug rather than GitHub's, and the checker tolerates
     * only the latter.
     */
    throw new Error(
      `engines.vscode ("${range}") names no major.minor.patch version, so no ` +
        `VS Code release tag can be derived from it.`,
    );
  }

  return tag;
};

/**
 * Read the `engines.vscode` floor from `package.json` as a bare release tag.
 *
 * @returns the VS Code release tag the floor names.
 * @example resolveVsCodeFloorTag() // "1.103.0"
 */
export const resolveVsCodeFloorTag = (): string => {
  const { engines } = JSON.parse(readFileSync("package.json", "utf8")) as {
    engines: { vscode: string };
  };

  return parseVsCodeFloorTag(engines.vscode);
};

/**
 * Derive the esbuild target the extension host currently warrants.
 *
 * - Two hops, both from stable public endpoints: VS Code's `.npmrc` at the
 *   floor tag gives the Electron version, and Electron's release index maps
 *   that to a Node version.
 *
 * @returns the target string (e.g. `"node22"`) plus the versions it came from.
 */
export const resolveExtensionHostTarget = async ({
  tag,
}: {
  /**
   * The VS Code release tag to resolve against — normally the `engines.vscode`
   * floor.
   *
   * @example "1.103.0"
   */
  tag: string;
}): Promise<{
  /** The Electron version VS Code pins at that tag. */
  electronVersion: string;

  /** The Node version that Electron bundles. */
  nodeVersion: string;

  /** The esbuild target implied by `nodeVersion`. */
  target: string;
}> => {
  const npmrc = await fetchUpstream({
    description: `VS Code's .npmrc at tag ${tag}`,
    url: VS_CODE_NPMRC_URL(tag),
  });

  const electronVersion = /^target="(?<version>[^"]+)"/mu.exec(npmrc)?.groups
    ?.version;

  if (electronVersion === undefined) {
    throw new UpstreamUnavailableError(
      `No \`target\` entry in VS Code's .npmrc at tag ${tag}`,
    );
  }

  const releasesBody = await fetchUpstream({
    description: "Electron's release index",
    url: ELECTRON_RELEASES_URL,
  });

  const releases = JSON.parse(releasesBody) as ElectronRelease[];
  const release = releases.find((entry) => entry.version === electronVersion);

  if (release === undefined) {
    throw new UpstreamUnavailableError(
      `Electron ${electronVersion} is absent from the release index`,
    );
  }

  const nodeMajor = release.node.split(".")[0];

  /*
   * A malformed version would otherwise yield the target string `"node"`, which
   * reads as an ordinary mismatch and sends the reader off to "fix" the
   * constant to a value esbuild rejects.
   */
  if (nodeMajor === undefined || !/^\d+$/u.test(nodeMajor)) {
    throw new UpstreamUnavailableError(
      `Electron ${electronVersion} reports an unparseable Node version: ` +
        `"${release.node}"`,
    );
  }

  return {
    electronVersion,
    nodeVersion: release.node,
    target: `node${nodeMajor}`,
  };
};
