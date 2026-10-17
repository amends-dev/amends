/**
 * The `tasks` endpoint group: the work a thread tracks, keyed by the thread. Its endpoints call
 * `TaskService`: `listInGroup`, `get`, `create`, and `update`. Every endpoint needs active
 * membership of the workspace and of the thread's group; making a conversation a task needs
 * `task.create` on the group, changing one `task.update`, and assigning an agent `agent.use` on it.
 * A thread can also start as a task, through `ThreadsGroup`'s `start`. `TasksHandlers` implements
 * it.
 *
 * @since 0.1.0
 */

import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadId } from "@amends-dev/core/thread"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"
import { limit } from "./internal/paging.ts"
import * as WorkspaceMember from "./WorkspaceMember.ts"

const thread = { threadId: ThreadId.ThreadId }
const inGroup = { groupId: GroupId.GroupId }
const record = Task.Task.annotate({ identifier: "Task" })

/**
 * Tasks: the work a thread tracks, with a status, priority, and assignee. A task is created with
 * its thread through the threads group's start, or in a conversation here; its title is the
 * thread's and its description the thread's opening message. Reading a task is reading its thread:
 * missing and unreadable ones, and threads without a task, answer alike.
 *
 * @category models
 * @since 0.1.0
 */
export class TasksGroup extends HttpApiGroup.make("tasks")
  .add(
    HttpApiEndpoint.get("list", "/groups/:groupId/tasks", {
      params: inGroup,
      query: {
        limit,
        status: Schema.optionalKey(Task.Status),
        before: Schema.optionalKey(Schema.fromJsonString(Task.ListCursor)).annotate({
          description:
            "Exclusive boundary as JSON containing the last item's task createdAt (UTC ISO string) and threadId."
        })
      },
      success: Schema.Array(Thread.ListItem.annotate({ identifier: "ThreadListItem" })),
      error: [...ApiErrors.workspace, ...ApiErrors.taskRead]
    }),
    HttpApiEndpoint.get("get", "/threads/:threadId/task", {
      params: thread,
      success: record,
      error: [...ApiErrors.workspace, ...ApiErrors.taskRead]
    }),
    HttpApiEndpoint.post("create", "/threads/:threadId/task", {
      params: thread,
      payload: Task.Options,
      success: record.pipe(HttpApiSchema.status(201)),
      error: [...ApiErrors.workspace, ...ApiErrors.taskCreate]
    }),
    HttpApiEndpoint.patch("update", "/threads/:threadId/task", {
      params: thread,
      payload: Schema.Struct({ change: Task.UpdateInput.fields.change }),
      success: record,
      error: [...ApiErrors.workspace, ...ApiErrors.taskUpdate]
    })
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication) {}
