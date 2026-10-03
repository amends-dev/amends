import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer, Logger } from "effect";
import { HarnessServerHost } from "./server.ts";

/**
 * Serve with the state file the host names. The process outlives that host, so its output may
 * reach no one: it logs to a file beside the state, failures included.
 */
const statePath = process.argv[2];
if (statePath === undefined) {
  console.error("Usage: harness-server <state file>");
  process.exit(2);
}

HarnessServerHost.run(statePath).pipe(
  Effect.tapCause((cause) => Effect.logError("The harness server stopped", cause)),
  Effect.provide(
    Logger.layer([Logger.toFile(Logger.formatLogFmt, `${statePath}.log`)]).pipe(
      Layer.provideMerge(BunServices.layer),
    ),
  ),
  BunRuntime.runMain({ disableErrorReporting: true }),
);
