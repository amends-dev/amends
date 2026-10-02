import { AnthropicConnection } from "@amends/connection-anthropic";
import { OpenAiCompatibleConnection } from "@amends/connection-openai-compatible";
import { HarnessServer } from "@amends/environment";
import { AmendsHarness } from "@amends/harness-amends";
import { BunHttpServer } from "@effect/platform-bun";
import { Context, Crypto, Deferred, Effect, FileSystem, Layer, Schema } from "effect";
import { Hex } from "effect/encoding";
import { HttpRouter, HttpServer } from "effect/http";

/**
 * What this build of the harness server runs: amends's own harness, with the model code of every
 * model connection the local host installs.
 */
export const served: HarnessServer.Served = {
  harnesses: [AmendsHarness.harness],
  models: [AnthropicConnection.modelInference, OpenAiCompatibleConnection.modelInference],
};

/** The routes over Bun's HTTP server on a free port, keeping a quiet event stream open. */
const layerServer = (token: string, stop: Effect.Effect<void>) =>
  HttpRouter.serve(HarnessServer.layerRoutes(served, { token, stop }), {
    disableLogger: true,
  }).pipe(Layer.provideMerge(BunHttpServer.layer({ port: 0, idleTimeout: 0 })));

/**
 * Serve the harness server on a free port with a token of its own, and once it listens, write the
 * port, the token, and the protocol version it speaks to `statePath`, readable by its owner only,
 * for hosts to find it. It runs apart from the host that started it, until a host asks it to stop.
 */
export const run = Effect.fn("HarnessServerHost.run")(function* (statePath: string) {
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const token = Hex.encode(yield* crypto.randomBytes(32));
  const stopped = yield* Deferred.make<void>();
  const context = yield* Layer.build(layerServer(token, Deferred.succeed(stopped, undefined)));
  const address = Context.get(context, HttpServer.HttpServer).address;
  if (!("port" in address)) return yield* Effect.die("The harness server listens on a port.");
  const state = yield* Schema.encodeEffect(HarnessServer.StateJson)({
    port: address.port,
    token,
    protocolVersion: HarnessServer.protocolVersion,
  });
  // Written beside its place and renamed into it, so a host never reads half of it.
  const partial = `${statePath}.partial`;
  yield* fs.writeFileString(partial, state, { mode: 0o600 });
  yield* fs.rename(partial, statePath);
  yield* Deferred.await(stopped);
  // Let the answer to the request to stop leave before the server closes.
  yield* Effect.sleep("100 millis");
}, Effect.scoped);

export * as HarnessServerHost from "./server.ts";
