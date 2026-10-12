/**
 * Implements `AssignmentsGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one `AssignmentService` operation: `permissions`, `roles`,
 * `list`, `assign`, `change`, or `revoke`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { AssignmentService } from "@amends-dev/core/authorization";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the assignment handlers, each entering the workspace as the request's principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "assignments",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      permissions: ({ params }) =>
        asMember(
          params.workspaceId,
          AssignmentService.AssignmentService.use(
            (assignmentService) => assignmentService.permissions,
          ),
        ),
      roles: ({ params }) =>
        asMember(
          params.workspaceId,
          AssignmentService.AssignmentService.use((assignmentService) => assignmentService.roles),
        ),
      list: ({ params }) =>
        asMember(
          params.workspaceId,
          AssignmentService.AssignmentService.use((assignmentService) =>
            assignmentService.list(params.memberId),
          ),
        ),
      assign: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          AssignmentService.AssignmentService.use((assignmentService) =>
            assignmentService.assign(payload),
          ),
        ),
      change: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          AssignmentService.AssignmentService.use((assignmentService) =>
            assignmentService.change(payload),
          ),
        ),
      revoke: ({ params }) =>
        asMember(
          params.workspaceId,
          AssignmentService.AssignmentService.use((assignmentService) =>
            assignmentService.revoke(params.memberId, params.assignmentId),
          ),
        ),
    });
  }),
);
