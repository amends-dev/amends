/**
 * How a workspace's signals reach its subscribers. `SignalHub` is the service a storage adapter
 * binds to each workspace, which the operations publish through and the change feed subscribes
 * to. `LocalSignalHub` is the hub for one process that an adapter binds it to, and `layerMemory`
 * binds it to the hub memory storage holds.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer } from "effect";
import type { Scope, Stream } from "effect";
import * as Store from "../journal/Store.ts";
import type * as Signal from "./Signal.ts";

/**
 * One workspace's signals, across every process sharing its storage. Storage binds it to the
 * workspace; it holds nothing durable and takes no part in the journal or its write order.
 *
 * @category services
 * @since 0.1.0
 */
export class SignalHub extends Context.Service<
  SignalHub,
  {
    /**
     * Offer a signal to the workspace's current subscribers, best effort: it never fails the caller,
     * and a subscriber too slow to keep up, or disconnected, misses it.
     */
    readonly publish: (signal: Signal.Signal) => Effect.Effect<void>;
    /** The signals published after this registers, until the scope closes. */
    readonly subscribe: Effect.Effect<Stream.Stream<Signal.Signal>, never, Scope.Scope>;
  }
>()("@amends-dev/core/signal/SignalHub") {}

/**
 * The workspace's signals, shared by every host over the same storage. Each subscriber has its
 * own bounded queue; nothing is kept.
 */
const makeMemory = Effect.fn("SignalHub.makeMemory")(function* () {
  const { workspaceId, connection } = yield* Store.MemoryBinding;
  const { signals } = connection.database;
  return SignalHub.of({
    publish: signals.publish,
    subscribe: signals.subscribe(workspaceId),
  });
});

/**
 * Provide the workspace's signals in process memory, over the workspace's `Store.MemoryBinding`:
 * its view of the hub `MemoryDatabase` holds, which every host connected to the same storage
 * shares, so no relay is needed between them. A signal reaches the subscribers present when it is
 * published; nothing is kept.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(SignalHub, makeMemory());
