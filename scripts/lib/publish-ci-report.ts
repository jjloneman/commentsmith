/**
 * Shared CI-report publishing: GitHub Actions job summary + a sticky PR
 * comment, upserted by a marker string.
 *
 * - Used by the coverage and accessibility report scripts so each keeps its own
 *   sticky comment. `gh pr comment --edit-last` can't do that — it edits the
 *   bot's most recent comment regardless of content, so two reports posting
 *   that way would clobber each other on alternate runs. Instead the comment
 *   is located by its marker (the report's opening `## …` heading) via the
 *   GitHub API and PATCHed in place, or created when absent.
 *
 * - Best-effort + report-only: outside GitHub Actions it just prints the
 *   caller's `localConsole` (nothing if omitted); missing CI env skips the
 *   comment; a `gh`/network failure warns but never throws, so a report can't
 *   fail the build.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

/** The `id`/`body` slice of a GitHub issue comment the upsert matches against. */
type IssueCommentSlice = {
  body: string;
  id: number;
};

/**
 * Find the PR comment whose body starts with `marker`.
 *
 * @returns the matching comment's id, or `undefined` when none exists yet.
 */
const findStickyComment = ({
  marker,
  prNumber,
  repo,
}: {
  /** The report heading the comment body must start with. */
  marker: string;

  /** The pull request whose comments to search. */
  prNumber: number;

  /** The `owner/name` repository slug. */
  repo: string;
}): IssueCommentSlice["id"] | undefined => {
  // --jq flattens paginated pages into one JSON object per line; only a body
  // prefix is fetched since the marker is the report's first line.
  const lines = execFileSync(
    "gh",
    [
      "api",
      `repos/${repo}/issues/${prNumber}/comments`,
      "--paginate",
      "--jq",
      ".[] | {body: .body[0:200], id: .id}",
    ],
    { encoding: "utf8" },
  );

  return lines
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as IssueCommentSlice)
    .find((comment) => comment.body.startsWith(marker))?.id;
};

/**
 * Post (or update in place) the sticky PR comment identified by `marker`.
 *
 * Never throws — a `gh`/network failure is logged and swallowed so the report
 * stays report-only.
 */
const upsertStickyPrComment = ({
  body,
  marker,
  prNumber,
  repo,
}: {
  /** The full Markdown comment body to post. */
  body: string;

  /** The report heading identifying which comment to edit. */
  marker: string;

  /** The pull request to comment on. */
  prNumber: number;

  /** The `owner/name` repository slug. */
  repo: string;
}): void => {
  try {
    const commentId = findStickyComment({ marker, prNumber, repo });

    if (commentId === undefined) {
      execFileSync(
        "gh",
        ["pr", "comment", String(prNumber), "--body-file", "-", "--repo", repo],
        { input: body, stdio: ["pipe", "inherit", "inherit"] },
      );

      return;
    }

    // Body goes through stdin JSON (`--input -`), not an argv `-f` flag, so a
    // large report can't hit the argv size limit.
    execFileSync(
      "gh",
      [
        "api",
        "--method",
        "PATCH",
        `repos/${repo}/issues/comments/${commentId}`,
        "--input",
        "-",
      ],
      { input: JSON.stringify({ body }), stdio: ["pipe", "ignore", "inherit"] },
    );
  } catch (error: unknown) {
    console.warn("[CI] Failed to upsert the sticky PR comment:", error);
  }
};

/**
 * Publish a CI report: append it to the Actions job summary and, on a
 * `pull_request` event, upsert it as a sticky PR comment.
 */
export const publishCiReport = ({
  localConsole,
  markdown,
  marker,
}: {
  /**
   * What to print to the console when run **outside** GitHub Actions (no job
   * summary to write). Pass the report itself for a small one (coverage);
   * omit it when the caller prints its own local summary instead of the full
   * Markdown (the a11y audit's report is too large to dump).
   */
  localConsole?: string;

  /** The full report body; its first line should be `marker`. */
  markdown: string;

  /**
   * The report's stable opening heading (e.g. `## 📊 Code coverage`), used to
   * find this report's existing comment among others.
   */
  marker: string;
}): void => {
  const {
    GITHUB_EVENT_NAME,
    GITHUB_EVENT_PATH,
    GITHUB_REPOSITORY,
    GITHUB_STEP_SUMMARY,
  } = process.env;

  // Job summary under Actions; the caller's chosen console output locally.
  if (GITHUB_STEP_SUMMARY) {
    appendFileSync(GITHUB_STEP_SUMMARY, `${markdown}\n`);
  } else if (localConsole !== undefined) {
    console.log(localConsole);
  }

  // Sticky PR comment — pull_request events only.
  if (GITHUB_EVENT_NAME !== "pull_request") {
    return;
  }

  if (!GITHUB_EVENT_PATH || !GITHUB_REPOSITORY) {
    console.warn("[CI] Missing GitHub Actions env — skipping the PR comment.");

    return;
  }

  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, "utf8")) as {
    pull_request?: { number?: number };
  };

  const prNumber = event.pull_request?.number;

  if (!prNumber) {
    return;
  }

  upsertStickyPrComment({
    body: markdown,
    marker,
    prNumber,
    repo: GITHUB_REPOSITORY,
  });
};
