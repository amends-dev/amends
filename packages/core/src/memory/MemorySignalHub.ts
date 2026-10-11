/**
 * The memory implementation of `SignalHub` from `../signal/SignalHub.ts`: the binding's
 * workspace's view of the hub `MemoryDatabase` holds, which `SignalHub.makeLocal` builds and
 * every host connected to the same storage shares, so no relay is needed between them. A signal
 * reaches the subscribers present when it is published; nothing is kept.
 *
 * @since 0.1.0
 */
import { SignalHub } from "../signal/index.ts";
import { Effect, Layer } from "effect";
import * as Binding from "./Binding.ts";

/**
 * The workspace's signals, shared by every host over the same storage. Each subscriber has its
 * own bounded queue; nothing is kept.
 *
 * @category constructors
 * @since 0.1.0
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
 * Provide the workspace's signal hub over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SignalHub.SignalHub, make());
