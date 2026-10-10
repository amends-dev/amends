import { Group } from "@amends/core/group";
import { Task } from "@amends/core/task";
import { Thread } from "@amends/core/thread";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";
import { limit } from "./paging.ts";

const thread = { workspaceId: Workspace.Id, threadId: Thread.Id };
const inGroup = { workspaceId: Workspace.Id, groupId: Group.Id };
const record = Task.Record.annotate({ identifier: "Task" });

/**
 * Tasks: the work a thread tracks, with a status, priority, and assignee. A task is created with
 * its thread through the threads group's start, or in a conversation here; its title is the
 * thread's and its description the thread's opening message. Reading a task is reading its thread:
 * missing and unreadable ones, and threads without a task, answer alike.
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
      error: [...ApiErrors.member, ...ApiErrors.taskRead],
    }),
    HttpApiEndpoint.get("get", "/threads/:threadId/task", {
      params: thread,
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.taskRead],
    }),
    HttpApiEndpoint.post("create", "/threads/:threadId/task", {
      params: thread,
      payload: Task.Options,
      success: record.pipe(HttpApiSchema.status(201)),
      error: [...ApiErrors.member, ...ApiErrors.taskCreate],
    }),
    HttpApiEndpoint.patch("update", "/threads/:threadId/task", {
      params: thread,
      payload: Schema.Struct({ change: Task.UpdateInput.fields.change }),
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.taskUpdate],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
