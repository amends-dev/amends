/**
 * What a write waits for so its result shows once it completes: whether the workspace's change
 * feed is live, and the messages its latest commits delivered. A write that posts a message waits
 * for the commit that delivers it, rather than reading what it changed again; while the feed is
 * away, or when the commit does not come soon, it reads them again instead.
 */

import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"

interface Arrivals {
  readonly live: boolean
  /** The messages the latest commits delivered, oldest first. */
  readonly messages: ReadonlyArray<string>
}
/** How many delivered messages to remember: more than arrive while one write waits. */
const remembered = 200
/** How long a write waits for its commit before reading what it changed again. */
const patience = "3 seconds"
const arrivalsOf = Atom.family((_workspaceId: string) =>
  Atom.make<Arrivals>({ live: false, messages: [] }).pipe(Atom.keepAlive)
)

/** Note whether the workspace's change feed is live. */
export const recordLive = (registry: AtomRegistry.AtomRegistry, workspaceId: string, live: boolean) =>
  registry.update(arrivalsOf(workspaceId), (arrivals) => (arrivals.live === live ? arrivals : { ...arrivals, live }))

/** Note the messages a commit delivered. */
export const recordMessages = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  messageIds: ReadonlyArray<string>
) => {
  if (messageIds.length > 0)
    registry.update(arrivalsOf(workspaceId), (arrivals) => ({
      ...arrivals,
      messages: [...arrivals.messages, ...messageIds].slice(-remembered)
    }))
}

/**
 * Wait until the change feed delivers the message, or run `otherwise` when the feed is not live,
 * goes down meanwhile, or does not deliver it soon.
 */
export const awaitMessage = Effect.fnUntraced(function* <R>(
  workspaceId: string,
  messageId: string,
  otherwise: Effect.Effect<void, never, R>
) {
  const registry = yield* AtomRegistry.AtomRegistry
  const arrivals = arrivalsOf(workspaceId)
  const current = registry.get(arrivals)
  if (!current.live) return yield* otherwise
  if (current.messages.includes(messageId)) return
  yield* Effect.callback<void, never, R>((resume) => {
    const unsubscribe = registry.subscribe(arrivals, (next) => {
      if (next.messages.includes(messageId)) resume(Effect.void)
      else if (!next.live) resume(otherwise)
    })
    return Effect.sync(unsubscribe)
  }).pipe(Effect.timeoutOrElse({ duration: patience, orElse: () => otherwise }))
})
