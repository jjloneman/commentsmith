import type { ExtensionContext } from "vscode";

import { commands, window } from "vscode";

import { moduleLogger, resetLogSink, setLogSink } from "#core/logger";

import { createOutputChannelSink } from "./logger";

const CHANNEL_NAME = "Commentsmith";

const logger = moduleLogger("extension");

/**
 * Wire the extension up on first activation.
 *
 * - Activation is lazy: package.json contributes a command and declares no
 *   `activationEvents`, so VS Code starts us only when that command is invoked.
 *
 * - The channel is pushed onto `subscriptions` so the host disposes it for us;
 *   the sink it backs is torn down in {@link deactivate}.
 *
 * @param context - the host-provided context owning our disposables.
 */
export const activate = (context: ExtensionContext): void => {
  const channel = window.createOutputChannel(CHANNEL_NAME, { log: true });

  setLogSink(createOutputChannelSink(channel));

  const command = commands.registerCommand("commentsmith.format", () => {
    logger.info("format command invoked");

    /*
     * Deliberately inert until the formatter lands.
     *
     * - The scaffold's job is to prove activation, command registration, and
     *   logging work end to end; the transform pipeline arrives in #2–#5 and is
     *   wired to this command in #8.
     */
    void window.showInformationMessage(
      "Commentsmith: comment formatting is not implemented yet.",
    );
  });

  context.subscriptions.push(channel, command);

  logger.info({ version: __VERSION__ }, "activated");
};

/** Tear down the process-wide sink so a reload can install a fresh one. */
export const deactivate = (): void => {
  resetLogSink();
};
