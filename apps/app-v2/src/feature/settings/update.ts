import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import {
  ChangeRole,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  TransferOwnership
} from "./command.ts"
import { SettingsComposition } from "./composition.ts"
import {
  Message,
  type Model,
  ownerAssignment,
  ownName,
  ownNameDraft,
  Renaming,
  workspaceName,
  workspaceNameDraft,
  workspaceRolesOf
} from "./definition.ts"

/** The model with the name being given as `change` makes it, while one is. */
const atRenaming = (model: Model, change: (renaming: Renaming) => Renaming) =>
  modifyFields(model, { renaming: Option.map(change) })

/** The model with no `name` being given; a different name being given stays. */
const stopRenaming = (model: Model, name: Renaming["_tag"]) =>
  modifyFields(model, { renaming: Option.filter((renaming) => !Renaming.isAnyOf([name])(renaming)) })

export const update = SettingsComposition.makeUpdate((model, message) => {
  const { workspaceId, memberId } = model
  const asMember = { workspaceId, memberId }
  return Message.match(message, {
    ReceivedSettings: ({ workspace, members, roles, assignments, invitations, grants }) => ({
      model: modifyFields(model, {
        workspace: () => workspace,
        members: () => members,
        roles: () => roles,
        assignments: () => assignments,
        invitations: () => invitations,
        grants: () => grants
      })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedRenameWorkspace: () => ({
      model: modifyFields(model, {
        renaming: () => Option.some(Renaming.WorkspaceName({ name: workspaceName(model) }))
      })
    }),
    TypedWorkspaceName: ({ name }) => ({
      model: atRenaming(
        model,
        Renaming.matchOrElse({ WorkspaceName: () => Renaming.WorkspaceName({ name }) }, (same) => same)
      )
    }),
    SubmittedWorkspaceName: () =>
      Option.match(Option.product(workspaceNameDraft(model), model.workspace), {
        onNone: () => ({ model }),
        onSome: ([name, { workspace }]) => ({
          model: stopRenaming(model, "WorkspaceName"),
          commands: [RenameWorkspace({ ...asMember, name, expectedName: workspace.name })]
        })
      }),
    ClickedCancelWorkspaceName: () => ({ model: stopRenaming(model, "WorkspaceName") }),
    ClickedRenameSelf: () => ({
      model: modifyFields(model, { renaming: () => Option.some(Renaming.OwnName({ name: ownName(model) })) })
    }),
    TypedOwnName: ({ name }) => ({
      model: atRenaming(
        model,
        Renaming.matchOrElse({ OwnName: () => Renaming.OwnName({ name }) }, (same) => same)
      )
    }),
    SubmittedOwnName: () =>
      Option.match(ownNameDraft(model), {
        onNone: () => ({ model }),
        onSome: (name) => ({
          model: stopRenaming(model, "OwnName"),
          commands: [RenameSelf({ ...asMember, name })]
        })
      }),
    ClickedCancelOwnName: () => ({ model: stopRenaming(model, "OwnName") }),
    ChoseRole: ({ memberId: changeMemberId, roleId }) => ({
      model,
      commands: [
        ChangeRole({
          ...asMember,
          changeMemberId,
          roleId,
          expectedAssignmentIds: workspaceRolesOf(model, changeMemberId).map(({ id }) => id)
        })
      ]
    }),
    ClickedRemoveMember: ({ memberId: removeMemberId }) => ({
      model,
      commands: [RemoveMember({ ...asMember, removeMemberId })]
    }),
    ClickedTransferOwnership: ({ memberId: newOwnerMemberId }) =>
      Option.match(ownerAssignment(model), {
        onNone: () => ({ model }),
        onSome: ({ id }) => ({
          model,
          commands: [TransferOwnership({ ...asMember, newOwnerMemberId, expectedOwnerAssignmentId: id })]
        })
      }),
    TypedInviteEmail: ({ email }) => ({
      model: modifyFields(model, { inviting: (inviting) => ({ ...inviting, email }) })
    }),
    ChoseInviteRole: ({ roleId }) => ({
      model: modifyFields(model, { inviting: (inviting) => ({ ...inviting, roleId }) })
    }),
    SubmittedInvite: () => ({
      model: modifyFields(model, { inviting: (inviting) => ({ ...inviting, email: "" }) }),
      commands: [Invite({ ...asMember, ...model.inviting })]
    }),
    ClickedRevokeInvitation: ({ invitationId }) => ({
      model,
      commands: [RevokeInvitation({ ...asMember, invitationId })]
    }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
})
