/**
 * Renders Vitest's coverage-summary.json as a Markdown table, followed by the
 * `text` reporter's per-file output in a collapsed `<details>` block.
 *
 * - Publishes it via {@link publishCiReport}: the GitHub Actions job summary,
 *   plus (on a pull_request) a sticky PR comment upserted by the report's
 *   heading — so it coexists with the accessibility report's own sticky
 *   comment instead of clobbering it.
 *
 * - Best-effort + report-only: run locally it just prints the table; missing CI
 *   env skips the comment; it never gates the build. A missing/oversized text
 *   report degrades to the table alone rather than failing.
 */

import { readFileSync } from "node:fs";

import { publishCiReport } from "./lib/publish-ci-report";

/** One metric's totals from coverage-summary.json (`lines`, `branches`, …). */
type CoverageMetric = Record<"covered" | "pct" | "total", number>;

/** The `total` block of coverage-summary.json. */
type CoverageTotal = Record<
  "branches" | "functions" | "lines" | "statements",
  CoverageMetric
>;

const SUMMARY_PATH = "coverage/coverage-summary.json";

/**
 * The `text` reporter's per-file table, written by the `["text", { file }]`
 * entry in vitest.config.ts's `coverage.reporter`.
 */
const TEXT_REPORT_PATH = "coverage/coverage.txt";

/** The sticky-comment marker — the report's stable opening heading. */
const REPORT_MARKER = "## 📊 Code coverage";

/**
 * Character budget for the text report inside the comment.
 *
 * - GitHub rejects an issue comment body over 65536 characters, which would
 *   make the upsert fail and drop the whole report — so the per-file table is
 *   truncated well short of it rather than risking that.
 */
const MAX_TEXT_REPORT_CHARS = 50_000;

/** Render one metric as a Markdown table row. */
const metricRow = (label: string, metric: CoverageMetric): string =>
  `| ${label} | ${metric.pct.toFixed(0)}% |`;

/**
 * Link to the uploaded HTML report, when CI published one.
 *
 * - The `coverage/` directory is uploaded as a workflow artifact rather than
 *   pushed to an external coverage service, so the only durable handle is the
 *   artifact URL the upload step outputs.
 *
 * - Absent locally, and absent if the upload step was skipped — in both cases
 *   the comment simply omits the line rather than linking nowhere.
 *
 * @returns the Markdown link line, or `undefined` when no artifact exists.
 */
const buildArtifactLink = (): string | undefined => {
  const url = process.env.COVERAGE_ARTIFACT_URL;

  if (!url) {
    return undefined;
  }

  return (
    `📂 [Download the full HTML report](${url}) — unzip and open ` +
    "`index.html` for the line-by-line drill-down."
  );
};

/** Build the summary table — the part that always appears. */
const buildTable = (total: CoverageTotal): string =>
  `${REPORT_MARKER}

| Metric | % |
| :--- | ---: |
${metricRow("📄 Statements", total.statements)}
${metricRow("🔀 Branches", total.branches)}
${metricRow("⚙️ Functions", total.functions)}
${metricRow("📏 Lines", total.lines)}`;

/**
 * Read the `text` reporter's output.
 *
 * @returns the report, or `undefined` when it is missing or unreadable.
 */
const readTextReport = (): string | undefined => {
  try {
    return readFileSync(TEXT_REPORT_PATH, "utf8").trimEnd();
  } catch (error: unknown) {
    console.warn(
      `[CI] No text coverage report at ${TEXT_REPORT_PATH} — posting the table alone:`,
      error,
    );

    return undefined;
  }
};

/** Clip an oversized report to the budget, flagging that it was cut. */
const clipToBudget = (textReport: string): string =>
  textReport.length <= MAX_TEXT_REPORT_CHARS
    ? textReport
    : `${textReport.slice(0, MAX_TEXT_REPORT_CHARS)}\n\n…truncated — see the full table in the CI job log.`;

/**
 * Wrap the per-file report in a collapsed `<details>` block.
 *
 * - The blank lines around the fence are required: GitHub stops parsing
 *   Markdown inside an HTML block without them, so the code fence would render
 *   literally.
 */
const buildDetails = (textReport: string): string =>
  `<details>
<summary>📋 Per-file coverage (<code>text</code> reporter)</summary>

\`\`\`text
${clipToBudget(textReport)}
\`\`\`

</details>`;

const main = (): void => {
  const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8")) as Record<
    "total",
    CoverageTotal
  >;

  const table = buildTable(summary.total);
  const textReport = readTextReport();
  const artifactLink = buildArtifactLink();

  const sections = [
    table,
    artifactLink,
    textReport === undefined ? undefined : buildDetails(textReport),
  ].filter((section) => section !== undefined);

  const markdown = sections.join("\n\n");

  // Locally the `text` reporter has already printed the per-file table to
  // stdout, so echoing the details block back would just duplicate it.
  publishCiReport({ localConsole: table, markdown, marker: REPORT_MARKER });
};

try {
  main();
} catch (error: unknown) {
  console.error("[CI] Fatal error:", error);
  process.exit(1);
}
