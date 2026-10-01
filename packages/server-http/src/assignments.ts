import { Api, Principal } from "@amends/api-http";
import { AssignmentService } from "@amends/core/authorization";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/** @category layers */
export const layer = HttpApiBuilder.group(
  Api,
  "assignments",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      permissions: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(
              AssignmentService.Service,
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
              AssignmentService.Service,
              (assignmentService) => assignmentService.roles,
            ),
          ),
        ),
      list: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.Service, (assignmentService) =>
              assignmentService.list(params.memberId),
            ),
          ),
        ),
      assign: ({ params, payload }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.Service, (assignmentService) =>
              assignmentService.assign(payload),
            ),
          ),
        ),
      change: ({ params, payload }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.Service, (assignmentService) =>
              assignmentService.change(payload),
            ),
          ),
        ),
      revoke: ({ params }) =>
        Effect.flatMap(Principal, (identity) =>
          gateway.asMember(
            params.workspaceId,
            identity,
            Effect.flatMap(AssignmentService.Service, (assignmentService) =>
              assignmentService.revoke(params.memberId, params.assignmentId),
            ),
          ),
        ),
    });
  }),
);
export * as AssignmentsHandlers from "./assignments.ts";
