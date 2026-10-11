/**
 * How a workspace's signals reach its subscribers. `SignalHub` is the service a storage adapter
 * binds to each workspace, which the operations publish through and the change feed subscribes
 * to; `makeLocal` is the hub for one process, which an adapter relays between processes when
 * several share its storage.
 *
 * @since 0.1.0
 */
import { Context, Effect, Option, PubSub, RcMap, Stream } from "effect";
import type { Scope } from "effect";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
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

/** Signals a subscriber may fall behind by before it misses the oldest. */
const capacity = 256;

/**
 * Every workspace's signals within one process. A subscriber hears what its workspace publishes
 * after it registers, and misses the oldest once it falls `capacity` behind; a workspace keeps a
 * queue only while someone listens. Storage adapters bind it to each workspace, relaying between
 * processes where several share their storage. The hub lasts for the scope.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeLocal = Effect.gen(function* () {
  const workspaces = yield* RcMap.make({
    lookup: (_workspaceId: WorkspaceId.Id) =>
      Effect.acquireRelease(PubSub.sliding<Signal.Signal>(capacity), PubSub.shutdown),
  });
  /** Offer a signal to its workspace's subscribers in this process. */
  const publish = (signal: Signal.Signal) =>
    Effect.scoped(
      Effect.flatMap(RcMap.getOption(workspaces, signal.workspaceId), (pubsub) =>
        Option.isSome(pubsub) ? Effect.asVoid(PubSub.publish(pubsub.value, signal)) : Effect.void,
      ),
    );
  /** A workspace's signals published in this process after this registers, until the scope closes. */
  const subscribe = (workspaceId: WorkspaceId.Id) =>
    Effect.flatMap(RcMap.get(workspaces, workspaceId), (pubsub) =>
      Effect.map(PubSub.subscribe(pubsub), Stream.fromSubscription),
    );
  return { publish, subscribe };
});

/**
 * One process's hub, as `makeLocal` builds it: what a storage adapter binds to a workspace.
 *
 * @category models
 * @since 0.1.0
 */
export type Local = Effect.Success<typeof makeLocal>;
