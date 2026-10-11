import { Api, Principal } from "@amends-dev/api-http";
import type { Actor } from "@amends-dev/core/identity";
import { TaskService } from "@amends-dev/core/task";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register task handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "tasks",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    /** Run a task operation as the principal, a member of the workspace. */
    const asMember = <A, E>(
      workspaceId: Workspace.Id,
      operation: (
        taskService: TaskService.TaskService["Service"],
      ) => Effect.Effect<A, E, Actor.Actor>,
    ) =>
      Effect.flatMap(Principal, (principal) =>
        gateway.asMember(
          workspaceId,
          principal,
          Effect.flatMap(TaskService.TaskService, operation),
        ),
      );
    return handlers.handleAll({
      list: ({ params, query }) =>
        asMember(params.workspaceId, (taskService) =>
          taskService.listInGroup(params.groupId, query),
        ),
      get: ({ params }) =>
        asMember(params.workspaceId, (taskService) => taskService.get(params.threadId)),
      create: ({ params, payload }) =>
        asMember(params.workspaceId, (taskService) =>
          taskService.create({ threadId: params.threadId, ...payload }),
        ),
      update: ({ params, payload }) =>
        asMember(params.workspaceId, (taskService) =>
          taskService.update({ threadId: params.threadId, change: payload.change }),
        ),
    });
  }),
);
