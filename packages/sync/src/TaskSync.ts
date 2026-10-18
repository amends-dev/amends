/**
 * What a member's browser and the server exchange about tasks, the work a thread tracks. `Actions`
 * are what the member does with a thread's task, which their browser applies at once and the server
 * runs as `TaskService` operations. `Changes` keep the tasks in their replica current.
 *
 * @since 0.1.0
 */

import { Task } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

/**
 * What a member does with a thread's task. Each action's primary key is the task's thread.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  .add({ tag: "TaskCreated", primaryKey: ({ threadId }) => threadId, payload: Task.CreateInput })
  // Change a task's status, assignee, or priority from what the member saw: `TaskService.update`.
  .add({ tag: "TaskUpdated", primaryKey: ({ threadId }) => threadId, payload: Task.UpdateInput })

/**
 * The tasks a replica holds, each keyed by its thread.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges("Task", Task.Task, Schema.Struct({ threadId: ThreadId.ThreadId }), ({ threadId }) => ({ threadId }))
)
