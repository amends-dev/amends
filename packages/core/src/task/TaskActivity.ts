/**
 * The kinds of activity a task records in its thread's timeline. Both are quiet: they count as
 * nobody's new activity, and whom they tell is decided when they are recorded, by the rules in
 * `TaskCommand`. `TaskTimeline` shows them.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts"
import * as ThreadMessage from "../thread/ThreadMessage.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as Task from "./Task.ts"

/**
 * The thread became a task, with these initial values. It is about its thread, which has one task,
 * so it is recorded once there.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Created = ThreadActivityKind.make("task.created", {
  version: 1,
  details: Schema.Struct({
    status: Task.Status,
    priority: Task.Priority,
    assignee: Schema.NullOr(MemberId.MemberId),
    createdBy: ThreadMessage.Author
  }),
  newActivity: false
})

/**
 * @category kinds
 * @since 0.1.0
 */
export type Created = ThreadActivityKind.Activity<typeof Created>

/**
 * The task changed in one way; the details are the change, with the value it replaced. A task
 * changes any number of times, so it has no occurrence.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Updated = ThreadActivityKind.make("task.updated", {
  version: 1,
  details: Task.Change,
  occurrence: () => null,
  newActivity: false
})

/**
 * @category kinds
 * @since 0.1.0
 */
export type Updated = ThreadActivityKind.Activity<typeof Updated>
