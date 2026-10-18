/**
 * What a member does to the workspace itself, its name and owner, its members, invitations, and
 * roles, as actions their browser writes: it applies each at once, and the server runs it as a
 * `WorkspaceSettingsService`, `OwnershipService`, `MemberService`, `InvitationService`, or
 * `AssignmentService` operation.
 *
 * @since 0.1.0
 */

import { Assignment } from "@amends-dev/core/authorization"
import { Invitation, Member, MemberId, Ownership, WorkspaceSettings } from "@amends-dev/core/workspace"
import * as Accounts from "@amends-dev/gateway/Accounts"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * Whom to invite, by the address people know them by, with the role acceptance assigns and when
 * the invitation expires. A member's browser knows no account but its own, so the server finds or
 * creates the account the address names and invites its person.
 *
 * @category options
 * @since 0.1.0
 */
export const IssueInput = Schema.Struct({
  email: Accounts.Email,
  roleId: Invitation.IssueInput.fields.roleId,
  expiresAt: Invitation.IssueInput.fields.expiresAt
})

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
  .add({ tag: "InvitationIssued", primaryKey: ({ email }) => email, payload: IssueInput })
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
