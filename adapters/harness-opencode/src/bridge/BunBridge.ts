/**
 * Serves a bridge from Bun, as a bridge program does once it has made its agent: on every interface
 * of the sandbox, at the port the host's launch options name, until the scope closes.
 *
 * Bun's server never finishes stopping once a WebSocket has been open, so it runs in a scope of its
 * own, which the bridge gives a second to close after the bridge's own finalizers have run, rather
 * than wait for hosts to close their connections.
 */
import { type Bridge, BridgeServer } from "@amends/harness-v2";
import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Exit, Fiber, Layer, Redacted, Scope } from "effect";

/** Serves `agent` to hosts as `launch` says, until the scope closes. */
export const serve = Effect.fnUntraced(function* (
  agent: Bridge.Agent,
  launch: Bridge.LaunchOptions,
) {
  const serverScope = yield* Scope.make();
  yield* Effect.addFinalizer(() =>
    Effect.forkDetach(Scope.close(serverScope, Exit.void)).pipe(
      Effect.flatMap(Fiber.await),
      Effect.timeout("1 second"),
      Effect.ignore,
    ),
  );
  const server = yield* Layer.buildWithScope(
    BunHttpServer.layer({
      hostname: "0.0.0.0",
      port: launch.port,
      disablePreemptiveShutdown: true,
    }),
    serverScope,
  );
  const bridge = BridgeServer.layer(agent, {
    token: Redacted.make(launch.token),
    stateDirectory: launch.stateDirectory,
  });
  return yield* Effect.provideContext(Layer.launch(bridge), server);
});
