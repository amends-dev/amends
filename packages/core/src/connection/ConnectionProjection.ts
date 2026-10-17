/**
 * Keeps the connection read model, `ConnectionStore`, from `ConnectionFacts`: each connection as it
 * was created and since renamed, configured, or removed. Keys are not in the journal, so replacing
 * one changes no record here.
 *
 * @since 0.1.0
 */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Projection from "../journal/Projection.ts"
import * as Connection from "./Connection.ts"
import * as ConnectionFacts from "./ConnectionFacts.ts"
import * as ConnectionStore from "./ConnectionStore.ts"

/** Change the stored connection a fact names, as `changes` says. */
const update = Effect.fnUntraced(function* (
  connectionId: ConnectionContract.ConnectionId,
  changes: Partial<Connection.Connection>
) {
  const connectionStore = yield* ConnectionStore.ConnectionStore
  const found = yield* connectionStore.get(connectionId)
  if (Option.isNone(found)) return yield* Effect.die("A changed connection is missing")
  yield* connectionStore.update(Connection.change(found.value, changes))
})

/**
 * Inserts each created connection, and sets the name, settings, or status of each one renamed,
 * configured, or removed. A replaced key changes no record.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("connections", { version: 1 })
  .on(
    ConnectionFacts.Created,
    Effect.fn("ConnectionProjection.created")(function* ({ payload }) {
      const connectionStore = yield* ConnectionStore.ConnectionStore
      yield* connectionStore.insert(payload)
    })
  )
  .on(ConnectionFacts.Renamed, ({ payload }) => update(payload.connectionId, { name: payload.name }))
  .on(ConnectionFacts.Configured, ({ payload }) => update(payload.connectionId, { settings: payload.settings }))
  .on(ConnectionFacts.Removed, ({ payload }) => update(payload.connectionId, { status: "removed" }))
