/**
 * Implements `TasksGroup`. Each handler enters the workspace as the principal's membership through
 * `Gateway.asMember` and calls one `TaskService` operation, merging the path's thread ID into its
 * input. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { TaskService } from "@amends-dev/core/task";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register task handlers, each entering the workspace as the request's principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "tasks",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      list: ({ params, query }) =>
        asMember(
          params.workspaceId,
          TaskService.TaskService.use((taskService) =>
            taskService.listInGroup(params.groupId, query),
          ),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          TaskService.TaskService.use((taskService) => taskService.get(params.threadId)),
        ),
      create: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          TaskService.TaskService.use((taskService) =>
            taskService.create({ threadId: params.threadId, ...payload }),
          ),
        ),
      update: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          TaskService.TaskService.use((taskService) =>
            taskService.update({ threadId: params.threadId, change: payload.change }),
          ),
        ),
    });
  }),
);
