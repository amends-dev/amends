/**
 * The bridge program of the opencode agent, which a host launches in its sandbox. It reads the
 * launch options the host gave it on standard input, makes opencode's driver from the agent
 * options among them, over opencode 1's session API, and serves the driver to hosts until it exits
 * idle or another bridge takes its place. opencode's server exiting by itself ends it too, for the
 * next host to launch both again.
 *
 * Beside the bridge it serves the `HostToolRelay`, through which opencode calls the host's tools,
 * on 127.0.0.1 only, where opencode's server reaches it.
 *
 * The driver runs the opencode installed beside the program, as the template installs it, unless
 * the agent options name another command.
 */
import { BridgeServer, HostToolRelay } from "@amends/harness";
import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import * as BunBridge from "../BunBridge.ts";
import * as Driver from "../Driver.ts";
import { makeCreateSession } from "./Session.ts";

/**
 * The relay, on a server of its own. A call of a host's tool waits for the host for as long as an
 * approval takes, so the server never closes a connection for being idle.
 */
const RelayLayer = HostToolRelay.layer().pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port: 0, idleTimeout: 0 })),
);

const program = Effect.gen(function* () {
  const launch = yield* BridgeServer.readLaunchOptions;
  const options = yield* Schema.decodeUnknownEffect(Driver.Options)(launch.agentOptions);
  const relay = yield* HostToolRelay.HostToolRelay;
  const driver = yield* Driver.make(
    "opencode",
    { command: `${import.meta.dirname}/opencode`, ...options },
    makeCreateSession(relay),
  );
  return yield* BunBridge.serve(driver, launch).pipe(
    Effect.raceFirst(
      Effect.andThen(driver.serverExited, Effect.fail("opencode's server exited by itself")),
    ),
  );
});

BunRuntime.runMain(
  program.pipe(
    Effect.scoped,
    Effect.provide(
      RelayLayer.pipe(Layer.provideMerge(Layer.merge(BunServices.layer, FetchHttpClient.layer))),
    ),
  ),
);
