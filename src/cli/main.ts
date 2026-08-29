import { moduleLogger, setLogSink } from "#core/logger";

import { DEFAULT_LOG_LEVEL, hasFlag, parseLogLevel } from "./args";
import { createStderrSink } from "./logger";

const USAGE = `commentsmith ${__VERSION__}

  Reshape block, line, and JSDoc comments to a style you define.

Usage
  commentsmith [options] [file...]

Options
  -h, --help            Show this help and exit
  -v, --version         Print the version and exit
      --log-level=LVL   trace | debug | info | warn | error (default: ${DEFAULT_LOG_LEVEL})
`;

/**
 * Write program output to stdout.
 *
 * - `--help` and `--version` output is the program's *result*, not a
 *   diagnostic, so it goes to stdout — everything else the CLI says goes to
 *   stderr via the logger.
 *
 * - Written through `process.stdout` rather than `console` because
 *   `no-console` is an error under `src/` precisely to keep that distinction
 *   deliberate.
 */
const printToStdout = (
  /**
   * The exact text to write, including any trailing newline.
   *
   * @example "0.0.0\n"
   */
  text: string,
): void => {
  process.stdout.write(text);
};

/**
 * Run the CLI.
 *
 * @returns the process exit code.
 */
const main = (): number => {
  const argv = process.argv.slice(2);

  if (hasFlag({ aliases: ["--help", "-h"], argv })) {
    printToStdout(USAGE);

    return 0;
  }

  if (hasFlag({ aliases: ["--version", "-v"], argv })) {
    printToStdout(`${__VERSION__}\n`);

    return 0;
  }

  setLogSink(
    createStderrSink({
      // A TTY means a human is reading; a pipe means something is parsing.
      pretty: process.stderr.isTTY === true,
      threshold: parseLogLevel(argv),
    }),
  );

  const logger = moduleLogger("cli");

  /*
   * Non-zero on purpose: the scaffold cannot do what was asked, and returning 0
   * would let a pre-commit hook or CI step treat a no-op as a successful
   * format. Real modes and exit codes arrive in #9.
   */
  logger.error(
    { argv },
    "comment formatting is not implemented yet — see https://github.com/jjloneman/commentsmith/issues/9",
  );

  return 1;
};

process.exitCode = main();
