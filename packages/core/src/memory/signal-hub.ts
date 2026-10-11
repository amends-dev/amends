import { SignalHub } from "../signal/index.ts";
import { Effect, Layer } from "effect";
import { Binding } from "./binding.ts";

/**
 * The workspace's signals, shared by every host over the same storage. Each subscriber has its
 * own bounded queue; nothing is kept.
 *
 * @category constructors
 */
export const make = Effect.fn("MemorySignalHub.make")(function* () {
  const { workspaceId, connection } = yield* Binding.Service;
  const { signals } = connection.database;
  return SignalHub.Service.of({
    publish: signals.publish,
    subscribe: signals.subscribe(workspaceId),
  });
});

/**
 * Provide SignalHub.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(SignalHub.Service, make());

export * as MemorySignalHub from "./signal-hub.ts";
