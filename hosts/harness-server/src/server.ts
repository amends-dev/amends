import { AnthropicConnection } from "@amends/connection-anthropic";
import { OpenAiCompatibleConnection } from "@amends/connection-openai-compatible";
import { HarnessServer } from "@amends/environment";
import { AmendsHarness } from "@amends/harness-amends";
import { BunCrypto, BunStdio } from "@effect/platform-bun";
import { Layer } from "effect";

/**
 * What this build of the harness server runs: amends's own harness, with the model code of every
 * model connection the local host installs.
 */
export const served: HarnessServer.Served = {
  harnesses: [AmendsHarness.harness],
  models: [AnthropicConnection.modelInference, OpenAiCompatibleConnection.modelInference],
};

/**
 * The harness server over this process's standard input and output, which carry its protocol, so
 * its logs go to standard error.
 *
 * @category layers
 */
export const layer = HarnessServer.layer(served).pipe(
  Layer.provide([BunStdio.layer, BunCrypto.layer]),
);

export * as HarnessServerHost from "./server.ts";
