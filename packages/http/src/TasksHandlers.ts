/**
 * Implements `TasksGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one `TaskService` operation, merging the path's thread ID into
 * its input. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { TaskService } from "@amends-dev/core/task";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register task handlers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "tasks", (handlers) =>
  handlers.handleAll({
    list: ({ params, query }) =>
      TaskService.TaskService.use((taskService) => taskService.listInGroup(params.groupId, query)),
    get: ({ params }) =>
      TaskService.TaskService.use((taskService) => taskService.get(params.threadId)),
    create: ({ params, payload }) =>
      TaskService.TaskService.use((taskService) =>
        taskService.create({ threadId: params.threadId, ...payload }),
      ),
    update: ({ params, payload }) =>
      TaskService.TaskService.use((taskService) =>
        taskService.update({ threadId: params.threadId, change: payload.change }),
      ),
  }),
);
