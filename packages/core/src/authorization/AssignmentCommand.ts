/**
 * The writes to assignments that operations share, run inside the caller's commit: giving a member
 * a built-in role across the workspace, and revoking an assignment. `AssignmentService`,
 * `OwnershipService`, `MemberCommand` when a member is added, and workspace initialization publish
 * through it. The caller owns authorization and delegation; this service checks neither.
 *
 * @since 0.1.0
 */

import type * as Log from "@amends-dev/log/Log"
import type * as Store from "@amends-dev/log/Store"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as PlatformError from "effect/PlatformError"
import type * as Schema from "effect/Schema"
import * as Journal from "../journal/Journal.ts"
import type * as Projection from "../journal/Projection.ts"
import type * as Publication from "../journal/Publication.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Assignment from "./Assignment.ts"
import * as AssignmentFacts from "./AssignmentFacts.ts"
import type * as Role from "./Role.ts"
import * as Scope from "./Scope.ts"

/**
 * What the writes can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = Schema.SchemaError | PlatformError.PlatformError | Log.WriteError | Projection.Error

/**
 * @effect-expect-leaking Transaction
 *
 * The shared assignment writes, bound to one workspace. Each publishes one fact from
 * `AssignmentFacts` and returns the assignment as the fact leaves it.
 *
 * @category services
 * @since 0.1.0
 */
export class AssignmentCommand extends Context.Service<
  AssignmentCommand,
  {
    /**
     * Give a member a role across the workspace, as a new assignment. The caller owns authorization
     * and delegation, and anything the member held before.
     */
    readonly assignRole: (
      memberId: MemberId.MemberId,
      roleId: Role.RoleId
    ) => Effect.Effect<Assignment.Assignment, Error, Store.Transaction | Publication.Publication>
    /** End an assignment, returning it as revoked. The caller owns authorization and delegation. */
    readonly revokeAssignment: (
      assignment: Assignment.Assignment
    ) => Effect.Effect<Assignment.Assignment, Error, Store.Transaction | Publication.Publication>
  }
>()("@amends-dev/core/authorization/AssignmentCommand") {}

/**
 * Capture the journal, crypto, and workspace; a new assignment takes a random ID.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId

  const assignRole = Effect.fn("AssignmentCommand.assignRole")(function* (
    memberId: MemberId.MemberId,
    roleId: Role.RoleId
  ) {
    const assignment = Assignment.Assignment.make({
      id: Assignment.AssignmentId.make(yield* crypto.randomUUIDv4()),
      workspaceId,
      memberId,
      status: "active",
      source: Assignment.Source.cases.Role.make({
        roleId,
        scope: Scope.Scope.cases.Workspace.make({ workspaceId })
      })
    })
    yield* journal.publish(AssignmentFacts.Created, {
      workspaceId,
      assignmentId: assignment.id,
      memberId: assignment.memberId,
      source: assignment.source
    })
    return assignment
  })

  const revokeAssignment = Effect.fn("AssignmentCommand.revokeAssignment")(function* (
    assignment: Assignment.Assignment
  ) {
    yield* journal.publish(AssignmentFacts.Revoked, {
      workspaceId,
      assignmentId: assignment.id,
      memberId: assignment.memberId
    })
    return Assignment.Assignment.make(Object.assign({}, assignment, { status: "revoked" as const }))
  })

  return AssignmentCommand.of({ assignRole, revokeAssignment })
})
/**
 * Provide the assignment writes, shared by assignment, ownership, invitation, and agent operations
 * and by workspace creation, over the journal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(AssignmentCommand, make)
