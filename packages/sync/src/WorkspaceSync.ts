/**
 * What a member's browser and the server exchange about the workspace itself: its name and owner,
 * its members, invitations, and roles. `Actions` are what the member does there, which their
 * browser applies at once and the server runs as `WorkspaceSettingsService`, `OwnershipService`,
 * `MemberService`, `InvitationService`, and `AssignmentService` operations. `Changes` keep the
 * workspace, members, roles, assignments, and invitations in their replica current.
 *
 * @since 0.1.0
 */

import { Assignment, Role } from "@amends-dev/core/authorization"
import {
  Invitation,
  Member,
  MemberId,
  Ownership,
  Workspace,
  WorkspaceId,
  WorkspaceSettings
} from "@amends-dev/core/workspace"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

/**
 * What a member does with the workspace. Each action's primary key is what it acts on: the
 * workspace, a member, or an invitation.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  // Rename the workspace: `WorkspaceSettingsService.rename`.
  .add({ tag: "WorkspaceRenamed", primaryKey: () => "workspace", payload: WorkspaceSettings.RenameInput })
  .add({ tag: "OwnershipTransferred", primaryKey: () => "workspace", payload: Ownership.TransferInput })
  // Change the name the acting member goes by: `MemberService.rename`.
  .add({ tag: "MemberRenamed", primaryKey: () => "self", payload: Schema.Struct({ name: Member.NewName }) })
  .add({
    tag: "MemberRemoved",
    primaryKey: ({ memberId }) => memberId,
    payload: Schema.Struct({ memberId: MemberId.MemberId })
  })
  .add({ tag: "InvitationIssued", primaryKey: ({ recipientId }) => recipientId, payload: Invitation.IssueInput })
  .add({
    tag: "InvitationRevoked",
    primaryKey: ({ invitationId }) => invitationId,
    payload: Schema.Struct({ invitationId: Invitation.InvitationId })
  })
  // Give a member a role, replace their roles with one, or end one assignment: `AssignmentService`.
  .add({ tag: "RoleAssigned", primaryKey: ({ memberId }) => memberId, payload: Assignment.AssignInput })
  .add({ tag: "RolesReplaced", primaryKey: ({ memberId }) => memberId, payload: Assignment.ChangeInput })
  .add({
    tag: "AssignmentRevoked",
    primaryKey: ({ memberId }) => memberId,
    payload: Schema.Struct({ memberId: MemberId.MemberId, assignmentId: Assignment.AssignmentId })
  })

/**
 * The workspace records a replica holds: the workspace, its members, roles, the assignments that
 * give members their roles and grants, and its invitations.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges("Workspace", Workspace.Workspace, Schema.Struct({ id: WorkspaceId.WorkspaceId }), ({ id }) => ({
    id
  })),
  recordChanges("Member", Member.Member, Schema.Struct({ id: MemberId.MemberId }), ({ id }) => ({ id })),
  recordChanges("Role", Role.Role, Schema.Struct({ id: Role.RoleId }), ({ id }) => ({ id })),
  recordChanges("Assignment", Assignment.Assignment, Schema.Struct({ id: Assignment.AssignmentId }), ({ id }) => ({
    id
  })),
  recordChanges("Invitation", Invitation.Invitation, Schema.Struct({ id: Invitation.InvitationId }), ({ details }) => ({
    id: details.id
  }))
)
