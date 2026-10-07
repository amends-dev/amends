/**
 * opencode's bridge program, which a host launches in its sandbox. It reads the launch options the
 * host gave it on standard input, makes opencode's driver from the agent options among them, and
 * serves the driver to hosts until a host asks it to exit. opencode's server exiting by itself ends
 * it too, for the next host to launch both again.
 *
 * The driver runs the opencode installed beside the program, as the template installs it, unless
 * the agent options name another command.
 */
import { BridgeServer } from "@amends/harness";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import * as BunBridge from "./BunBridge.ts";
import * as OpencodeDriver from "./Driver.ts";

const program = Effect.gen(function* () {
  const launch = yield* BridgeServer.readLaunchOptions;
  const options = yield* Schema.decodeUnknownEffect(OpencodeDriver.Options)(launch.agentOptions);
  const driver = yield* OpencodeDriver.make({
    command: `${import.meta.dirname}/opencode`,
    ...options,
  });
  return yield* BunBridge.serve(driver, launch).pipe(
    Effect.raceFirst(
      Effect.andThen(driver.serverExited, Effect.fail("opencode's server exited by itself")),
    ),
  );
});

BunRuntime.runMain(
  program.pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(BunServices.layer, FetchHttpClient.layer)),
  ),
);
