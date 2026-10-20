/**
 * The workspace's settings, as the sidebar's Workspace and Members: on Workspace, its name, which the person renames
 * when they may, its ID, who made it, who owns it, and the person's own name; on Members, the members in a roster the
 * person searches and narrows to those who are still in the workspace or are not. A member opens in the side pane,
 * where the person changes their role and reads their access. A control shows only when the person's grants and the
 * delegation rule allow it. The Block reports the member opened and closed, which the workspace page shows the side
 * pane for.
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
import { Member, MemberId, Workspace, WorkspaceId, WorkspaceSettingsPermissions } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { may, memberTarget, workspaceTarget } from "../../permissions.ts"
import { foldAccents } from "../../seen.ts"

/** The workspace, and whether a change to it is on its way. */
export const WorkspaceItem = Schema.Struct({ workspace: Workspace.Workspace, pending: Schema.Boolean })
export type WorkspaceItem = typeof WorkspaceItem.Type

/** A member of the workspace, and whether a change to them is on its way. */
export const MemberItem = Schema.Struct({ member: Member.Member, pending: Schema.Boolean })
export type MemberItem = typeof MemberItem.Type

/** A role assignment, and whether a change to it is on its way. */
export const AssignmentItem = Schema.Struct({ assignment: Assignment.Assignment, pending: Schema.Boolean })
export type AssignmentItem = typeof AssignmentItem.Type

/**
 * An action of the settings that was written to the store, or could not be: which, with what the update needs to
 * finish it.
 */
export const Written = defineTaggedUnion({
  Rename: {},
  RenameSelf: {},
  ChangeRole: { memberId: MemberId.MemberId }
})
export type Written = typeof Written.Type

/** What the person asks of the settings: each action written to the store, and reading them. */
export const SettingsAction = Schema.Literals(["Rename", "RenameSelf", "ChangeRole", "Read"])
export type SettingsAction = typeof SettingsAction.Type

/**
 * Why an action could not be made, as far as the app can tell before the server answers: what the person entered does
 * not decode (`Invalid`); this browser could not keep it (`Failed`); what they see is out of date, because they may no
 * longer do it (`Denied`) or what they act on is no longer there (`Gone`); or the settings could not be read
 * (`Outdated`). What the server refuses afterwards comes back as a rejection, which `feature/actions` shows.
 */
export const Reason = Schema.Literals(["Invalid", "Failed", "Denied", "Gone", "Outdated"])
export type Reason = typeof Reason.Type

/** An action that could not be made, and why. */
export const Failure = Schema.Struct({ action: SettingsAction, reason: Reason })
export type Failure = typeof Failure.Type

/** A name the person is changing: what they typed, whether the write is on its way, and why the last one failed. */
export const NameEdit = Schema.Struct({
  name: Schema.String,
  isSaving: Schema.Boolean,
  failure: Schema.Option(Failure)
})
export type NameEdit = typeof NameEdit.Type

/** What narrows the roster: the letters of a name, and whether it lists those who are in the workspace or who left. */
export const MembersFilter = Schema.Struct({ query: Schema.String, status: Member.Status })
export type MembersFilter = typeof MembersFilter.Type

/**
 * The member open in the side pane: which, the role the person chose and has not saved, whether the save is on its
 * way, and why the last one failed.
 */
export const Selected = Schema.Struct({
  memberId: MemberId.MemberId,
  roleId: Schema.Option(Role.RoleId),
  isSaving: Schema.Boolean,
  failure: Schema.Option(Failure)
})
export type Selected = typeof Selected.Type

/**
 * The workspace, its members and their role assignments, the roles, what the person may do, the names they are
 * changing, the roster's filter, the member open in the side pane, how many times they asked to copy the workspace's
 * ID and which of them shows as done, and whether the settings could not be read. `reads` counts how many times the
 * person asked to read them again, which starts the read anew.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  workspace: Schema.Option(WorkspaceItem),
  members: Schema.Array(MemberItem),
  roles: Schema.Array(Role.Role),
  assignments: Schema.Array(AssignmentItem),
  grants: Schema.Array(Grant.Grant),
  isUnreadable: Schema.Boolean,
  reads: Schema.Int,
  workspaceName: Schema.Option(NameEdit),
  ownName: Schema.Option(NameEdit),
  filter: MembersFilter,
  selected: Schema.Option(Selected),
  copyAttempts: Schema.Int,
  copiedAttempt: Schema.Option(Schema.Int)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedSettings: {
    workspace: Schema.Option(WorkspaceItem),
    members: Schema.Array(MemberItem),
    roles: Schema.Array(Role.Role),
    assignments: Schema.Array(AssignmentItem),
    grants: Schema.Array(Grant.Grant)
  },
  FailedRead: {},
  ClickedRefresh: {},
  TypedWorkspaceName: { name: Schema.String },
  SubmittedWorkspaceName: {},
  TypedOwnName: { name: Schema.String },
  SubmittedOwnName: {},
  ClickedCopyId: {},
  CopiedWorkspaceId: { attempt: Schema.Int },
  FailedCopyWorkspaceId: {},
  ExpiredCopied: { attempt: Schema.Int },
  TypedMemberQuery: { query: Schema.String },
  ChoseMemberStatus: { status: Member.Status },
  ClickedMember: { memberId: MemberId.MemberId },
  ClickedCloseMember: {},
  ChoseRole: { roleId: Role.RoleId },
  SubmittedRole: {},
  WroteAction: { written: Written },
  FailedWriteAction: { written: Written, reason: Reason }
})
export type Message = typeof Message.Type

/** What the Block reports to the workspace page: the member opened and closed, for the side pane. */
export const OutMessage = defineMessageUnion({
  OpenedMember: { memberId: MemberId.MemberId },
  ClosedMember: {}
})
export type OutMessage = typeof OutMessage.Type

export const SettingsDefinition = Block.makeDefinition("Settings", { Model, Message, OutMessage })

/** The workspace's name as the person sees it, until the replica holds the workspace. */
export const workspaceName = (model: Pick<Model, "workspace">): string =>
  Option.match(model.workspace, { onNone: () => "", onSome: ({ workspace }) => workspace.name })

/** The name the person goes by in the workspace, until the replica holds their membership. */
export const ownName = (model: Pick<Model, "members" | "memberId">): string =>
  model.members.find(({ member }) => member.id === model.memberId)?.member.name ?? ""

/** `memberId`'s record, while the replica has it, a member who left included. */
export const findMember = (model: Pick<Model, "members">, memberId: MemberId.MemberId): Option.Option<MemberItem> =>
  Option.fromUndefinedOr(model.members.find(({ member }) => member.id === memberId))

/** Whether the member is an agent. */
export const isAgent = (member: Member.Member): boolean => Identity.MemberReference.isAnyOf(["Agent"])(member.identity)

/**
 * The members the roster lists: those who are in the workspace, or who left, as the filter says, whose name contains
 * its letters, in any case and whatever the accents, in the order the replica lists them.
 */
export const shownMembers = (model: Pick<Model, "members" | "filter">): ReadonlyArray<MemberItem> => {
  const wanted = foldAccents(model.filter.query.trim())
  return model.members.filter(
    ({ member }) => member.status === model.filter.status && foldAccents(member.name).includes(wanted)
  )
}

/** The name of the role `roleId`, as the workspace holds it. */
export const roleName = (model: Pick<Model, "roles">, roleId: Role.RoleId): string =>
  model.roles.find(({ id }) => id === roleId)?.name ?? "A role"

/** The active assignments of `memberId`. */
const assignmentsOf = (
  model: Pick<Model, "assignments">,
  memberId: MemberId.MemberId
): ReadonlyArray<Assignment.Assignment> =>
  model.assignments.flatMap(({ assignment }) =>
    assignment.memberId === memberId && assignment.status === "active" ? [assignment] : []
  )

/** The workspace-wide role assignments of `memberId`, as replacing their roles expects them. */
export const workspaceRolesOf = (model: Pick<Model, "assignments">, memberId: MemberId.MemberId) =>
  assignmentsOf(model, memberId).filter(Assignment.isWorkspaceRole)

/** The roles `memberId` holds across the workspace, by name, as the roster says them. */
export const roleLabel = (model: Pick<Model, "assignments" | "roles">, memberId: MemberId.MemberId): string =>
  workspaceRolesOf(model, memberId)
    .map(({ source }) => roleName(model, source.roleId))
    .join(", ")

/** Every assignment of `memberId`, active or revoked, which their access lists. */
export const accessOf = (
  model: Pick<Model, "assignments">,
  memberId: MemberId.MemberId
): ReadonlyArray<AssignmentItem> => model.assignments.filter(({ assignment }) => assignment.memberId === memberId)

/** Whether a change to `memberId`'s role assignments is on its way. */
export const isChangingRole = (model: Pick<Model, "assignments">, memberId: MemberId.MemberId): boolean =>
  model.assignments.some(({ assignment, pending }) => pending && assignment.memberId === memberId)

/** Whether the person is the workspace's owner. */
export const isOwner = (model: Pick<Model, "workspace" | "memberId">): boolean =>
  Option.exists(model.workspace, ({ workspace }) => workspace.ownerMemberId === model.memberId)

/** The member who owns the workspace, while the replica has them. */
export const ownerOf = (model: Pick<Model, "workspace" | "members">): Option.Option<MemberItem> =>
  Option.flatMap(model.workspace, ({ workspace }) => findMember(model, workspace.ownerMemberId))

/**
 * The member who made the workspace, found by the identity the workspace remembers them by, while the replica has
 * them.
 */
export const creatorOf = (model: Pick<Model, "workspace" | "members">): Option.Option<MemberItem> =>
  Option.flatMapNullishOr(model.workspace, ({ workspace }) =>
    model.members.find(
      ({ member }) =>
        Identity.MemberReference.isAnyOf(["Human"])(member.identity) && member.identity.id === workspace.createdBy
    )
  )

/** Whether the person may rename the workspace. */
export const mayRename = (model: Pick<Model, "workspaceId" | "grants">): boolean =>
  may(model.grants, WorkspaceSettingsPermissions.Rename, workspaceTarget(model.workspaceId))

/** Whether the person may read `memberId`'s access. */
export const mayReadAccess = (model: Pick<Model, "workspaceId" | "grants">, memberId: MemberId.MemberId): boolean =>
  may(model.grants, AssignmentPermissions.Read, memberTarget(model.workspaceId, memberId))

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

/**
 * The roles the person may give: Member, and Administrator when they own the workspace; Owner only
 * passes by transfer. It reads the roles, the workspace, and the person a Model keeps, so a Block
 * that keeps the same three fields asks it of its own.
 */
export const givableRoles = (model: Pick<Model, "roles" | "workspace" | "memberId">): ReadonlyArray<Role.Role> =>
  model.roles.filter(
    ({ id }) => id === BuiltinRoles.MemberId || (id === BuiltinRoles.AdministratorId && isOwner(model))
  )

/** Whether the person may change `memberId`'s role, which they hold one of at most. */
export const mayChangeRole = (model: Model, memberId: MemberId.MemberId): boolean =>
  memberId !== model.memberId &&
  mayActOn(model, memberId) &&
  may(model.grants, AssignmentPermissions.Manage, workspaceTarget(model.workspaceId)) &&
  workspaceRolesOf(model, memberId).length <= 1

/** The name in the field of the workspace's name: what the person typed, or the name it has. */
export const workspaceNameDraft = (model: Model): string =>
  Option.match(model.workspaceName, { onNone: () => workspaceName(model), onSome: ({ name }) => name })

/** The name in the field of the person's own name: what they typed, or the name they have. */
export const ownNameDraft = (model: Model): string =>
  Option.match(model.ownName, { onNone: () => ownName(model), onSome: ({ name }) => name })

/** Whether what the person typed is a name to save: not blank, and not the name already held. */
export const isNameChanged = (typed: string, saved: string): boolean => typed.trim() !== "" && typed.trim() !== saved

/** The role of the member open that the select shows: the one the person chose, or the one the member holds. */
export const roleDraftOf = (model: Model, selected: Selected): Role.RoleId =>
  Option.getOrElse(
    selected.roleId,
    () => workspaceRolesOf(model, selected.memberId)[0]?.source.roleId ?? BuiltinRoles.MemberId
  )

/** Whether the role the person chose for the member open differs from the one the member holds. */
export const isRoleChanged = (model: Model, selected: Selected): boolean =>
  Option.isSome(selected.roleId) &&
  workspaceRolesOf(model, selected.memberId)[0]?.source.roleId !== selected.roleId.value
