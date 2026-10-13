/**
 * An assignment: access given to one workspace member, a role at a scope or a direct grant, active
 * until revoked. `AssignmentFacts` record them, `AssignmentProjection` keeps them in
 * `AssignmentStore`, `GrantResolver` turns a member's active ones into grants, and
 * `AssignmentService` lists, assigns, changes, and revokes them through the inputs and views here.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Grant from "./Grant.ts"
import * as Role from "./Role.ts"
import * as Scope from "./Scope.ts"

/**
 * Identifies one assignment; assigning access again after revocation uses a fresh ID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AssignmentId = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceAssignmentId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type AssignmentId = typeof AssignmentId.Type

/**
 * Whether the assignment still gives access: active, or revoked for good.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["active", "revoked"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type

/**
 * Where an assignment's access comes from: a role, whose current permissions apply at the assigned
 * scope, or one direct grant.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Source = Schema.TaggedUnion({
  Role: { roleId: Role.RoleId, scope: Scope.Scope },
  Direct: { grant: Grant.Grant }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Source = typeof Source.Type

/**
 * The check records and creation facts share: an assignment's scope belongs to its workspace.
 *
 * @category utils
 * @since 0.1.0
 */
export const SourceInWorkspace = Schema.makeFilter(
  ({ workspaceId, source }: { readonly workspaceId: WorkspaceId.WorkspaceId; readonly source: Source }) => {
    const scope = Source.match(source, {
      Role: ({ scope }) => scope,
      Direct: ({ grant }) => grant.scope
    })
    const scopeWorkspaceId = Scope.Scope.match(scope, {
      Workspace: ({ workspaceId }) => workspaceId,
      Target: ({ target }) => target.workspaceId
    })
    return scopeWorkspaceId === workspaceId
      ? undefined
      : { path: ["source"], issue: "Assignment scope must belong to its workspace" }
  }
)

/**
 * Access assigned to one workspace membership. Revoked records retain their source. This schema
 * validates that the scope belongs to the workspace. Membership, role ownership, permission
 * compatibility, and grant authority require application-level validation.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Assignment = Schema.Struct({
  id: AssignmentId,
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  source: Source,
  status: Status
}).check(SourceInWorkspace)

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Assignment extends Schema.Schema.Type<typeof Assignment> {}

/**
 * What assigns a role: the member and the built-in role, which `AssignmentService.assign` gives
 * across the whole workspace.
 *
 * @category options
 * @since 0.1.0
 */
export const AssignInput = Schema.Struct({ memberId: MemberId.MemberId, roleId: Role.RoleId })

/**
 * @category options
 * @since 0.1.0
 */
export interface AssignInput extends Schema.Schema.Type<typeof AssignInput> {}

/**
 * What replaces a member's workspace roles with one: the member, the role, and the role assignments
 * the caller saw, so a change made meanwhile is reported as `Changed` rather than overwritten.
 *
 * @category options
 * @since 0.1.0
 */
export const ChangeInput = Schema.Struct({
  ...AssignInput.fields,
  /** The member's current workspace role assignments as the caller saw them, in any order. */
  expectedAssignmentIds: Schema.UniqueArray(AssignmentId)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ChangeInput extends Schema.Schema.Type<typeof ChangeInput> {}

/**
 * A built-in role as a screen offers it, and whether the actor may give it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const RoleChoice = Schema.Struct({ role: Role.Role, assignable: Schema.Boolean })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface RoleChoice extends Schema.Schema.Type<typeof RoleChoice> {}

/**
 * What `AssignmentService.list` shows of a member: their active assignments, the roles on offer,
 * and whether the actor may change them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Access = Schema.Struct({
  assignments: Schema.Array(Assignment),
  roles: Schema.Array(RoleChoice),
  /** Whether the actor may assign, change, or revoke this member's roles. */
  canManage: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Access extends Schema.Schema.Type<typeof Access> {}
