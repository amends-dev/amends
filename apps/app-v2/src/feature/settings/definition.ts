/**
 * The workspace's settings: its name and the person's own, which they rename; its members with
 * their roles, whose roles the person changes, whom they remove, and, for the owner, hand the
 * workspace to; and its invitations, which they revoke, and to which they add one by email with a
 * role. A control shows only when the person's grants and the delegation rule allow it.
 */

import {
  Assignment,
  AssignmentPermissions,
  BuiltinRoles,
  Delegation,
  Grant,
  Role
} from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import {
  Invitation,
  Member,
  MemberId,
  MemberPermissions,
  OwnershipPermissions,
  Workspace,
  WorkspaceId
} from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { may, memberTarget, workspaceTarget } from "../../permissions.ts"

/** The workspace, and whether a change to it is on its way. */
export const WorkspaceItem = Schema.Struct({ workspace: Workspace.Workspace, pending: Schema.Boolean })
export type WorkspaceItem = typeof WorkspaceItem.Type

/** A member of the workspace, and whether a change to them is on its way. */
export const MemberItem = Schema.Struct({ member: Member.Member, pending: Schema.Boolean })
export type MemberItem = typeof MemberItem.Type

/** A role assignment, and whether a change to it is on its way. */
export const AssignmentItem = Schema.Struct({ assignment: Assignment.Assignment, pending: Schema.Boolean })
export type AssignmentItem = typeof AssignmentItem.Type

/** An invitation, and whether a change to it is on its way. */
export const InvitationItem = Schema.Struct({ invitation: Invitation.Invitation, pending: Schema.Boolean })
export type InvitationItem = typeof InvitationItem.Type

/** The name being given: the workspace's or the person's own, each with the draft so far. */
export const Renaming = defineTaggedUnion({
  WorkspaceName: { name: Schema.String },
  OwnName: { name: Schema.String }
})
export type Renaming = typeof Renaming.Type

/** Whom the person is inviting, by email address, and the role the invitation gives. */
export const Inviting = Schema.Struct({ email: Schema.String, roleId: Role.RoleId })
export type Inviting = typeof Inviting.Type

/**
 * The workspace, its members and their role assignments, the roles, the invitations, what the
 * person may do, the name being given, whom they are inviting, and why the last read or write
 * failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  workspace: Schema.Option(WorkspaceItem),
  members: Schema.Array(MemberItem),
  roles: Schema.Array(Role.Role),
  assignments: Schema.Array(AssignmentItem),
  invitations: Schema.Array(InvitationItem),
  grants: Schema.Array(Grant.Grant),
  renaming: Schema.Option(Renaming),
  inviting: Inviting,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedSettings: {
    workspace: Schema.Option(WorkspaceItem),
    members: Schema.Array(MemberItem),
    roles: Schema.Array(Role.Role),
    assignments: Schema.Array(AssignmentItem),
    invitations: Schema.Array(InvitationItem),
    grants: Schema.Array(Grant.Grant)
  },
  FailedRead: { error: Schema.String },
  ClickedRenameWorkspace: {},
  TypedWorkspaceName: { name: Schema.String },
  SubmittedWorkspaceName: {},
  ClickedCancelWorkspaceName: {},
  ClickedRenameSelf: {},
  TypedOwnName: { name: Schema.String },
  SubmittedOwnName: {},
  ClickedCancelOwnName: {},
  ChoseRole: { memberId: MemberId.MemberId, roleId: Role.RoleId },
  ClickedRemoveMember: { memberId: MemberId.MemberId },
  ClickedTransferOwnership: { memberId: MemberId.MemberId },
  TypedInviteEmail: { email: Schema.String },
  ChoseInviteRole: { roleId: Role.RoleId },
  SubmittedInvite: {},
  ClickedRevokeInvitation: { invitationId: Invitation.InvitationId },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const SettingsDefinition = Block.makeDefinition("Settings", { Model, Message })

/** The workspace's name as the person sees it, until the replica holds the workspace. */
export const workspaceName = (model: Model): string =>
  Option.match(model.workspace, { onNone: () => "", onSome: ({ workspace }) => workspace.name })

/** The name the person goes by in the workspace, until the replica holds their membership. */
export const ownName = (model: Model): string =>
  model.members.find(({ member }) => member.id === model.memberId)?.member.name ?? ""

/** The members still in the workspace. */
export const activeMembers = (model: Model): ReadonlyArray<MemberItem> =>
  model.members.filter(({ member }) => member.status === "active")

/** The invitations still to be accepted. */
export const waitingInvitations = (model: Model): ReadonlyArray<InvitationItem> =>
  model.invitations.filter(({ invitation }) => Invitation.State.isAnyOf(["Pending"])(invitation.state))

/** The draft of the workspace's name, while the person gives it. */
export const workspaceNameDraft = (model: Model): Option.Option<string> =>
  Option.flatMap(
    model.renaming,
    Renaming.matchOrElse({ WorkspaceName: ({ name }) => Option.some(name) }, () => Option.none())
  )

/** The draft of the person's own name, while they give it. */
export const ownNameDraft = (model: Model): Option.Option<string> =>
  Option.flatMap(
    model.renaming,
    Renaming.matchOrElse({ OwnName: ({ name }) => Option.some(name) }, () => Option.none())
  )

/** The active assignments of `memberId`. */
const assignmentsOf = (model: Model, memberId: MemberId.MemberId): ReadonlyArray<Assignment.Assignment> =>
  model.assignments.flatMap(({ assignment }) =>
    assignment.memberId === memberId && assignment.status === "active" ? [assignment] : []
  )

/** The workspace-wide role assignments of `memberId`, as replacing their roles expects them. */
export const workspaceRolesOf = (model: Model, memberId: MemberId.MemberId) =>
  assignmentsOf(model, memberId).filter(Assignment.isWorkspaceRole)

/** Whether a change to `memberId`'s role assignments is on its way. */
export const isChangingRole = (model: Model, memberId: MemberId.MemberId): boolean =>
  model.assignments.some(({ assignment, pending }) => pending && assignment.memberId === memberId)

/** The name of the role `roleId`, as the workspace holds it. */
export const roleName = (model: Model, roleId: Role.RoleId): string =>
  model.roles.find(({ id }) => id === roleId)?.name ?? "A role"

/** Whether the person is the workspace's owner. */
export const isOwner = (model: Model): boolean =>
  Option.exists(model.workspace, ({ workspace }) => workspace.ownerMemberId === model.memberId)

/** The active assignment that makes the workspace's owner its owner. */
export const ownerAssignment = (model: Model): Option.Option<Assignment.Assignment> =>
  Option.flatMapNullishOr(model.workspace, ({ workspace }) =>
    workspaceRolesOf(model, workspace.ownerMemberId).find(({ source }) => source.roleId === BuiltinRoles.OwnerId)
  )

/** Whether the delegation rule lets the person change `memberId`'s roles or remove them. */
const mayActOn = (model: Model, memberId: MemberId.MemberId): boolean =>
  Option.exists(
    model.workspace,
    ({ workspace }) =>
      Delegation.recipientDenial(
        {
          workspaceId: model.workspaceId,
          memberId,
          ownerId: workspace.ownerMemberId,
          actorId: model.memberId,
          selfRemoval: false
        },
        assignmentsOf(model, memberId)
      ) === undefined
  )

/** The roles the person may give: Member, and Administrator when they own the workspace; Owner only passes by transfer. */
export const givableRoles = (model: Model): ReadonlyArray<Role.Role> =>
  model.roles.filter(
    ({ id }) => id === BuiltinRoles.MemberId || (id === BuiltinRoles.AdministratorId && isOwner(model))
  )

/** Whether the person may change `memberId`'s role, which they hold one of at most. */
export const mayChangeRole = (model: Model, memberId: MemberId.MemberId): boolean =>
  memberId !== model.memberId &&
  mayActOn(model, memberId) &&
  may(model.grants, AssignmentPermissions.Manage, workspaceTarget(model.workspaceId)) &&
  workspaceRolesOf(model, memberId).length <= 1

/** Whether the person may remove `memberId` from the workspace. */
export const mayRemove = (model: Model, memberId: MemberId.MemberId): boolean =>
  memberId !== model.memberId &&
  mayActOn(model, memberId) &&
  may(model.grants, MemberPermissions.Remove, memberTarget(model.workspaceId, memberId))

/** Whether the person, as owner, may hand the workspace to `member`, who must be a person. */
export const mayTransferTo = (model: Model, member: Member.Member): boolean =>
  member.id !== model.memberId &&
  isOwner(model) &&
  may(model.grants, OwnershipPermissions.Transfer, workspaceTarget(model.workspaceId)) &&
  Identity.MemberReference.isAnyOf(["Human"])(member.identity)
