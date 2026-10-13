/**
 * Implements `AssignmentsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as
 * the principal's membership, and calls one `AssignmentService` operation: `permissions`, `roles`,
 * `list`, `assign`, `change`, or `revoke`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */

import { AssignmentService } from "@amends-dev/core/authorization"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Api from "./Api.ts"

/**
 * Register the assignment handlers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "assignments", (handlers) =>
  handlers.handleAll({
    permissions: () => AssignmentService.AssignmentService.use((assignmentService) => assignmentService.permissions),
    roles: () => AssignmentService.AssignmentService.use((assignmentService) => assignmentService.roles),
    list: ({ params }) =>
      AssignmentService.AssignmentService.use((assignmentService) => assignmentService.list(params.memberId)),
    assign: ({ payload }) =>
      AssignmentService.AssignmentService.use((assignmentService) => assignmentService.assign(payload)),
    change: ({ payload }) =>
      AssignmentService.AssignmentService.use((assignmentService) => assignmentService.change(payload)),
    revoke: ({ params }) =>
      AssignmentService.AssignmentService.use((assignmentService) =>
        assignmentService.revoke(params.memberId, params.assignmentId)
      )
  })
)
