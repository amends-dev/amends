/**
 * How a host's processes tell each other who is present: each signal a process sends reaches every
 * process following the workspace, itself included, as best it can. A signal lost is heard again
 * when it repeats, and one never repeated lapses, so the relay keeps nothing. Hosts supply it,
 * shared by every workspace: `layerMemory` for a host of one process, and a storage adapter's for a
 * host of several.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as Presence from "./Presence.ts"

/**
 * The relay of presence signals between a host's processes.
 *
 * @category services
 * @since 0.1.0
 */
export class PresenceRelay extends Context.Service<
  PresenceRelay,
  {
    /** Send `signal` to every process following its workspace, best effort. */
    readonly send: (signal: Presence.Signal) => Effect.Effect<void>
    /**
     * Follow the signals of `workspaceId` for the caller's scope: every one sent once this returns,
     * by any process, this one included.
     */
    readonly signals: (
      workspaceId: WorkspaceId.WorkspaceId
    ) => Effect.Effect<Stream.Stream<Presence.Signal>, never, Scope.Scope>
  }
>()("@amends-dev/core/presence/PresenceRelay") {}

/**
 * The relay of a host of one process, in its memory.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeMemory = Effect.map(PubSub.unbounded<Presence.Signal>(), (sent) =>
  PresenceRelay.of({
    send: (signal) => Effect.asVoid(PubSub.publish(sent, signal)),
    signals: (workspaceId) =>
      Effect.map(PubSub.subscribe(sent), (subscription) =>
        Stream.filter(Stream.fromSubscription(subscription), (signal) => signal.workspaceId === workspaceId)
      )
  })
)

/**
 * `makeMemory` as a layer.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(PresenceRelay, makeMemory)
