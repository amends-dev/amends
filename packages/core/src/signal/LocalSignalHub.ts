/**
 * Every workspace's signals within one process: the hub a storage adapter binds each workspace's
 * `SignalHub` to. Memory storage keeps one for every host connected to it, and the PostgreSQL
 * adapter keeps one per process, relaying between processes through the database.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as PubSub from "effect/PubSub"
import * as RcMap from "effect/RcMap"
import * as Stream from "effect/Stream"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as Signal from "./Signal.ts"

/** Signals a subscriber may fall behind by before it misses the oldest. */
const capacity = 256

/**
 * Every workspace's signals within one process. A subscriber hears what its workspace publishes
 * after it registers, and misses the oldest once it falls `capacity` behind; a workspace keeps a
 * queue only while someone listens. The hub lasts for the scope.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const workspaces = yield* RcMap.make({
    lookup: (_workspaceId: WorkspaceId.WorkspaceId) =>
      Effect.acquireRelease(PubSub.sliding<Signal.Signal>(capacity), PubSub.shutdown)
  })
  /** Offer a signal to its workspace's subscribers in this process. */
  const publish = (signal: Signal.Signal) =>
    Effect.scoped(
      Effect.flatMap(RcMap.getOption(workspaces, signal.workspaceId), (pubsub) =>
        Option.isSome(pubsub) ? Effect.asVoid(PubSub.publish(pubsub.value, signal)) : Effect.void
      )
    )
  /** A workspace's signals published in this process after this registers, until the scope closes. */
  const subscribe = (workspaceId: WorkspaceId.WorkspaceId) =>
    Effect.flatMap(RcMap.get(workspaces, workspaceId), (pubsub) =>
      Effect.map(PubSub.subscribe(pubsub), Stream.fromSubscription)
    )
  return { publish, subscribe }
})

/**
 * One process's hub, as `make` builds it.
 *
 * @category models
 * @since 0.1.0
 */
export type LocalSignalHub = Effect.Success<typeof make>
