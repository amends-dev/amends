import { Api, Principal } from "@amends-dev/api-http";
import { AssignmentService } from "@amends-dev/core/authorization";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/** @category layers */
export const layer = HttpApiBuilder.group(
  Api,
  "assignments",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      permissions: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(
              AssignmentService.AssignmentService,
              (assignmentService) => assignmentService.permissions,
            ),
          ),
        ),
      roles: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(
              AssignmentService.AssignmentService,
              (assignmentService) => assignmentService.roles,
            ),
          ),
        ),
      list: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
              assignmentService.list(params.memberId),
            ),
          ),
        ),
      assign: ({ params, payload }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
              assignmentService.assign(payload),
            ),
          ),
        ),
      change: ({ params, payload }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
              assignmentService.change(payload),
            ),
          ),
        ),
      revoke: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
              assignmentService.revoke(params.memberId, params.assignmentId),
            ),
          ),
        ),
    });
  }),
);
