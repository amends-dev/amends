/**
 * The facts recorded about assignments: created and revoked. `AssignmentCommand` publishes them,
 * and `AssignmentProjection` keeps `AssignmentStore` from them. Both reach the whole workspace.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Audience from "../journal/Audience.ts"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Assignment from "./Assignment.ts"

/**
 * Establishes an active role or direct grant assignment with a fresh ID.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("workspace.assignment.created", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("assignment", payload.assignmentId),
  version: 1,
  payload: Schema.Struct({
    assignmentId: Assignment.AssignmentId,
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    source: Assignment.Source
  }).check(Assignment.SourceInWorkspace),
  occurrence: (payload) => [payload.assignmentId]
})

/**
 * Revocation is terminal; assigning access again uses `Created` with a new ID.
 *
 * @category facts
 * @since 0.1.0
 */
export const Revoked = Fact.make("workspace.assignment.revoked", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("assignment", payload.assignmentId),
  version: 1,
  payload: Schema.Struct({
    assignmentId: Assignment.AssignmentId,
    workspaceId: WorkspaceId.WorkspaceId,
    /** The member whose access this ends, so readers need not look the assignment up. */
    memberId: MemberId.MemberId
  }),
  occurrence: (payload) => [payload.assignmentId]
})
