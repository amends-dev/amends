import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as Stores from "../src/store/Stores.ts"

/** An action a command wrote, and what it wrote with it. */
export interface Written {
  readonly action: string
  readonly payload: unknown
}

/**
 * `Stores` whose store keeps each action written to it, in `written`, so a test reads what a command wrote. A store
 * given `refusesAfter` keeps that many and refuses every one after, as a store that fails partway does.
 */
export const recordingStores = (refusesAfter = Number.POSITIVE_INFINITY) => {
  const written: Array<Written> = []
  const store = {
    write: (action: string, payload: unknown) =>
      written.length >= refusesAfter
        ? Effect.fail("This store refuses the action.")
        : Effect.sync(() => {
            written.push({ action, payload })
          })
  } as never

  const stores = Stores.Stores.of({
    open: () => Effect.succeed(store),
    read: () => Stream.empty,
    write: (_workspaceId, _memberId, to) => Effect.asVoid(to(store))
  })

  return { written, layer: Layer.succeed(Stores.Stores, stores) }
}
