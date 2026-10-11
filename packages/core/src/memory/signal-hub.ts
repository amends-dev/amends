import { SignalHub } from "../signal/index.ts";
import { Effect, Layer } from "effect";
import * as Binding from "./binding.ts";

/**
 * The workspace's signals, shared by every host over the same storage. Each subscriber has its
 * own bounded queue; nothing is kept.
 *
 * @category constructors
 */
export const make = Effect.fn("MemorySignalHub.make")(function* () {
  const { workspaceId, connection } = yield* Binding.Binding;
  const { signals } = connection.database;
  return SignalHub.SignalHub.of({
    publish: signals.publish,
    subscribe: signals.subscribe(workspaceId),
  });
});

/**
 * Provide SignalHub.SignalHub using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(SignalHub.SignalHub, make());
