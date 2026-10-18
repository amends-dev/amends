/**
 * How the server ends an action: `ActionCompleted` once it has run it, in the same batch as the
 * changes it made, and `ActionRejected` when it could not do it, each written to the store of the
 * member who wrote the action and naming the action's entry. Once one arrives, the browser drops
 * what it applied of the action itself: the changes carry what it did, and a rejected action did
 * nothing. Only core's `Rejection` kinds reject one: what it named is missing or out of reach,
 * changed since the member saw it, is not theirs to do, is refused by the state it acts on, or
 * cannot be done as asked. A store or host that cannot be reached now leaves the action to be run
 * again.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/** An action's entry, by the ID its browser keeps it under. */
const entryId = Schema.String.check(Schema.isUUID(7))

/**
 * How the server ended actions, each naming the action's entry. Their primary key is the entry's
 * ID.
 *
 * @category events
 * @since 0.1.0
 */
export const Outcomes = EventGroup.empty
  .add({
    tag: "ActionCompleted",
    primaryKey: ({ entryId }) => entryId,
    payload: Schema.Struct({ entryId })
  })
  .add({
    tag: "ActionRejected",
    primaryKey: ({ entryId }) => entryId,
    payload: Schema.Struct({ entryId, error: CoreError.Rejection })
  })
