/**
 * How the server rejects an action: `ActionRejected`, written to the store of the member who wrote
 * the action, which their browser takes as the end of that action, undoing what it applied. Only
 * core's `Rejection` kinds reject one: what it named is missing or out of reach, changed since the
 * member saw it, is not theirs to do, is refused by the state it acts on, or cannot be done as
 * asked. A store or host that cannot be reached now leaves the action to be run again.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * The server's rejections of actions, each naming the action's entry by its ID, which the browser
 * keeps the action under. Its primary key is the entry's ID.
 *
 * @category events
 * @since 0.1.0
 */
export const Rejections = EventGroup.empty.add({
  tag: "ActionRejected",
  primaryKey: ({ entryId }) => entryId,
  payload: Schema.Struct({
    entryId: Schema.String.check(Schema.isUUID(7)),
    error: CoreError.Rejection
  })
})
