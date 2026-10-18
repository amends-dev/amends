/**
 * How the server refuses an action: `ActionRejected`, written to the store of the member who wrote
 * the action, which their browser takes as the end of that action, undoing what it applied. Only
 * an outcome the action cannot outlive is a rejection; a store or host that cannot be reached now
 * leaves the action to be run again.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * Why the server refused an action: what it named is missing or out of reach, changed since the
 * member saw it, is not theirs to do, is refused by the state it acts on, or cannot be done as asked.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Refusal = Schema.Union([
  CoreError.NotFound,
  CoreError.Changed,
  CoreError.Denied,
  CoreError.Conflict,
  CoreError.Invalid
])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Refusal = typeof Refusal.Type

/**
 * The server's refusals of actions, each naming the action's entry by its ID and its tag. Its
 * primary key is the entry's ID.
 *
 * @category events
 * @since 0.1.0
 */
export const Rejections = EventGroup.empty.add({
  tag: "ActionRejected",
  primaryKey: ({ entryId }) => entryId,
  payload: Schema.Struct({
    entryId: Schema.String.check(Schema.isUUID(7)),
    action: Schema.NonEmptyString,
    error: Refusal
  })
})
