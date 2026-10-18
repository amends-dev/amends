/**
 * What a member does with tasks, the work a thread tracks, as actions their browser writes: it
 * applies each at once, and the server runs it as a `TaskService` operation.
 *
 * @since 0.1.0
 */

import { Task } from "@amends-dev/core/task"
import * as EventGroup from "effect/eventlog/EventGroup"

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
