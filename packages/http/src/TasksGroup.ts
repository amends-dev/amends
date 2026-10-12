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
import { Group } from "@amends-dev/core/group";
import { Task } from "@amends-dev/core/task";
import { Thread } from "@amends-dev/core/thread";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";
import { limit } from "./internal/paging.ts";

const thread = { workspaceId: Workspace.Id, threadId: Thread.Id };
const inGroup = { workspaceId: Workspace.Id, groupId: Group.Id };
const record = Task.Task.annotate({ identifier: "Task" });

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
            "Exclusive boundary as JSON containing the last item's task createdAt (UTC ISO string) and threadId.",
        }),
      },
      success: Schema.Array(Thread.ListItem.annotate({ identifier: "ThreadListItem" })),
      error: [...ApiErrors.workspace, ...ApiErrors.taskRead],
    }),
    HttpApiEndpoint.get("get", "/threads/:threadId/task", {
      params: thread,
      success: record,
      error: [...ApiErrors.workspace, ...ApiErrors.taskRead],
    }),
    HttpApiEndpoint.post("create", "/threads/:threadId/task", {
      params: thread,
      payload: Task.Options,
      success: record.pipe(HttpApiSchema.status(201)),
      error: [...ApiErrors.workspace, ...ApiErrors.taskCreate],
    }),
    HttpApiEndpoint.patch("update", "/threads/:threadId/task", {
      params: thread,
      payload: Schema.Struct({ change: Task.UpdateInput.fields.change }),
      success: record,
      error: [...ApiErrors.workspace, ...ApiErrors.taskUpdate],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
