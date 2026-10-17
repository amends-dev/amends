/**
 * A semaphore for each key among one process's statements, kept while any of them uses it, so keys
 * never accumulate. `PostgresReads` caps a workspace's reads with one, and `PostgresTurns` queues
 * a workspace's writers with one.
 */

import * as Effect from "effect/Effect"
import * as Semaphore from "effect/Semaphore"

interface Lane {
  readonly semaphore: Semaphore.Semaphore
  users: number
}

/** Run `use` with the key's semaphore, which is made with `permits` when no one holds the key. */
export type Lanes = <A, E, R>(
  key: string,
  permits: number,
  use: (semaphore: Semaphore.Semaphore) => Effect.Effect<A, E, R>
) => Effect.Effect<A, E, R>

/** Lanes with none in use. */
export const make = (): Lanes => {
  const lanes = new Map<string, Lane>()
  return (key, permits, use) =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const lane = lanes.get(key) ?? { semaphore: Semaphore.makeUnsafe(permits), users: 0 }
        lane.users += 1
        lanes.set(key, lane)
        return lane
      }),
      (lane) => use(lane.semaphore),
      (lane) =>
        Effect.sync(() => {
          lane.users -= 1
          if (lane.users === 0 && lanes.get(key) === lane) lanes.delete(key)
        })
    )
}
