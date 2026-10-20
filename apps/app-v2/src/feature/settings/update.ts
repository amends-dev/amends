import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Invitation, type MemberId } from "@amends-dev/core/workspace"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import {
  ChangeRole,
  CopyWorkspaceId,
  ExpireCopied,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  TransferOwnership
} from "./command.ts"
import { DialogBinding, leaveDialog, SettingsComposition } from "./composition.ts"
import {
  Entering,
  type Failure,
  findMember,
  isNameChanged,
  isRoleChanged,
  Message,
  type Model,
  mayChangeRole,
  mayInvite,
  mayRemove,
  mayRename,
  mayTransferOwnership,
  type NameEdit,
  OutMessage,
  SettingsDefinition,
  ownerAssignment,
  ownName,
  type Reason,
  type Selected,
  type SettingsAction,
  transferCandidates,
  workspaceRolesOf,
  Written
} from "./definition.ts"

const failureOf = (action: SettingsAction, reason: Reason): Failure => ({ action, reason })

/** What the person typed in the field of a name, with no failure left from the name before it, while it is not on its way. */
const typedName = (edit: Option.Option<NameEdit>, name: string): Option.Option<NameEdit> =>
  Option.some(
    Option.match(edit, {
      onNone: () => ({ name, isSaving: false, failure: Option.none() }),
      onSome: (typing) => (typing.isSaving ? typing : { ...typing, name, failure: Option.none() })
    })
  )

/** The edit of a name once it is sent, which waits for the store to keep it. */
const sentName = (edit: NameEdit): NameEdit => ({ ...edit, isSaving: true, failure: Option.none() })

/** The edit of a name once `failure` kept it from being sent or kept. */
const refusedName =
  (failure: Failure) =>
  (edit: NameEdit): NameEdit => ({ ...edit, isSaving: false, failure: Option.some(failure) })

/** The model with the name of the workspace being changed as `change` makes it, while one is. */
const atWorkspaceName = (model: Model, change: (edit: NameEdit) => NameEdit): Model =>
  modifyFields(model, { workspaceName: Option.map(change) })

/** The model with the person's own name being changed as `change` makes it, while it is. */
const atOwnName = (model: Model, change: (edit: NameEdit) => NameEdit): Model =>
  modifyFields(model, { ownName: Option.map(change) })

/** The model with the member open as `change` makes them, while one is. */
const atSelected = (model: Model, change: (selected: Selected) => Selected): Model =>
  modifyFields(model, { selected: Option.map(change) })

type Inviting = Extract<Entering, { readonly _tag: "Inviting" }>

/** The model with the invitation being drafted as `change` makes it, while one is and it is not on its way. */
const atInviting = (model: Model, change: (inviting: Inviting) => Inviting): Model =>
  modifyFields(model, {
    entering: Option.map((entering) =>
      Entering.isAnyOf(["Inviting"])(entering) && !entering.isSending ? change(entering) : entering
    )
  })

/** What the dialog is doing once its request is sent, which waits for the store to keep it. */
const sentEntering = (entering: Entering): Entering =>
  Entering.matchOrElse(entering, { ViewingHistory: () => entering }, (sending) => ({
    ...sending,
    isSending: true,
    failure: Option.none()
  }))

/** What the dialog is doing once `failure` kept its request from being sent or kept. */
const refusedEntering =
  (failure: Failure) =>
  (entering: Entering): Entering =>
    Entering.matchOrElse(entering, { ViewingHistory: () => entering }, (refused) => ({
      ...refused,
      isSending: false,
      failure: Option.some(failure)
    }))

/** What the dialog is doing with no failure shown, since what the person sees is read again. */
const unfailedEntering = (entering: Entering): Entering =>
  Entering.matchOrElse(entering, { ViewingHistory: () => entering }, (shown) => ({
    ...shown,
    failure: Option.none()
  }))

/** The model with what the dialog is doing as `change` makes it, while it is doing something. */
const atEntering = (model: Model, change: (entering: Entering) => Entering): Model =>
  modifyFields(model, { entering: Option.map(change) })

/** The model with the dialog's request refused for `reason`, when `isFor` says the dialog is doing what was written. */
const refuseEntering = (
  model: Model,
  action: SettingsAction,
  reason: Reason,
  isFor: (entering: Entering) => boolean
): Model =>
  atEntering(model, (entering) => (isFor(entering) ? refusedEntering(failureOf(action, reason))(entering) : entering))

/** Ask for the dialog, doing `entering`. */
const openDialog = (entering: Entering) =>
  Update.combine([
    SettingsDefinition.stepFields(() => ({ entering: () => Option.some(entering) })),
    DialogBinding.requestOpen()
  ])

/** Close the dialog, whose request is done with. */
const closeDialog = Update.combine([leaveDialog, DialogBinding.requestClose()])

/** The steps that close the dialog when `isDone`: the request it was making was kept. */
const closeDialogWhen = (isDone: boolean): ReadonlyArray<typeof closeDialog> => (isDone ? [closeDialog] : [])

/** Whether the dialog confirms removing `memberId`. */
const isRemoving = (entering: Entering, memberId: MemberId.MemberId): boolean =>
  Entering.isAnyOf(["Removing"])(entering) && entering.memberId === memberId

/** Whether the dialog confirms revoking `invitationId`. */
const isRevoking = (entering: Entering, invitationId: Invitation.InvitationId): boolean =>
  Entering.isAnyOf(["Revoking"])(entering) && entering.invitationId === invitationId

/** The name `memberId` goes by, while the replica has them. */
const nameOfMember = (model: Model, memberId: MemberId.MemberId): string =>
  Option.match(findMember(model, memberId), { onNone: () => "The member", onSome: ({ member }) => member.name })

/** Send the name the person typed for the workspace, when it is one to save and they may rename it. */
const submitWorkspaceName = (model: Model) =>
  Option.match(model.workspaceName, {
    onNone: () => ({ model }),
    onSome: (edit) => {
      if (edit.isSaving) {
        return { model }
      }

      return Option.match(model.workspace, {
        onNone: () => ({ model: atWorkspaceName(model, refusedName(failureOf("Rename", "Gone"))) }),
        onSome: ({ workspace }) => {
          if (!isNameChanged(edit.name, workspace.name)) {
            return { model }
          }

          if (!mayRename(model)) {
            return { model: atWorkspaceName(model, refusedName(failureOf("Rename", "Denied"))) }
          }

          const { workspaceId, memberId } = model
          return {
            model: atWorkspaceName(model, sentName),
            commands: [RenameWorkspace({ workspaceId, memberId, name: edit.name.trim(), expectedName: workspace.name })]
          }
        }
      })
    }
  })

/** Send the name the person typed for themselves, when it is one to save and the replica holds their membership. */
const submitOwnName = (model: Model) =>
  Option.match(model.ownName, {
    onNone: () => ({ model }),
    onSome: (edit) => {
      if (edit.isSaving) {
        return { model }
      }

      if (Option.isNone(findMember(model, model.memberId))) {
        return { model: atOwnName(model, refusedName(failureOf("RenameSelf", "Gone"))) }
      }

      if (!isNameChanged(edit.name, ownName(model))) {
        return { model }
      }

      const { workspaceId, memberId } = model
      return {
        model: atOwnName(model, sentName),
        commands: [RenameSelf({ workspaceId, memberId, name: edit.name.trim() })]
      }
    }
  })

/** Send the role the person chose for the member open as a replacement of the roles they saw the member hold. */
const submitRole = (model: Model) =>
  Option.match(model.selected, {
    onNone: () => ({ model }),
    onSome: (selected) => {
      const refuse = (reason: Reason) => ({
        model: atSelected(model, (open) => ({ ...open, failure: Option.some(failureOf("ChangeRole", reason)) }))
      })

      if (selected.isSaving || Option.isNone(selected.roleId) || !isRoleChanged(model, selected)) {
        return { model }
      }

      if (Option.isNone(findMember(model, selected.memberId))) {
        return refuse("Gone")
      }

      if (!mayChangeRole(model, selected.memberId)) {
        return refuse("Denied")
      }

      const { workspaceId, memberId } = model
      return {
        model: atSelected(model, (open) => ({ ...open, isSaving: true, failure: Option.none() })),
        commands: [
          ChangeRole({
            workspaceId,
            memberId,
            changeMemberId: selected.memberId,
            roleId: selected.roleId.value,
            expectedAssignmentIds: workspaceRolesOf(model, selected.memberId).map(({ id }) => id)
          })
        ]
      }
    }
  })

export const update = SettingsComposition.makeUpdate((model, message) => {
  /** Ask for the dialog on an invitation to draft, where the person may invite. */
  const askToInvite = () =>
    mayInvite(model)
      ? Update.combine(model, [
          openDialog(
            Entering.Inviting({ email: "", roleId: BuiltinRoles.MemberId, isSending: false, failure: Option.none() })
          )
        ])
      : { model }

  /** Ask for the dialog on every invitation, where the person may see them. */
  const askToViewHistory = () =>
    mayInvite(model) ? Update.combine(model, [openDialog(Entering.ViewingHistory())]) : { model }

  /** The invitation `invitationId`, while the replica has it and it is still to be accepted. */
  const findWaitingInvitation = (model: Model, invitationId: Invitation.InvitationId) =>
    Option.fromUndefinedOr(
      model.invitations.find(
        ({ invitation }) =>
          invitation.details.id === invitationId && Invitation.State.isAnyOf(["Pending"])(invitation.state)
      )
    )

  /** Ask for the dialog that confirms revoking `invitationId`, where the person may and it is not itself on its way. */
  const askToRevoke = (invitationId: Invitation.InvitationId) =>
    Option.match(findWaitingInvitation(model, invitationId), {
      onNone: () => ({ model }),
      onSome: ({ invitation, pending }) =>
        mayInvite(model) && !pending
          ? Update.combine(model, [
              openDialog(
                Entering.Revoking({
                  invitationId,
                  recipient: invitation.details.recipientEmail,
                  isSending: false,
                  failure: Option.none()
                })
              )
            ])
          : { model }
    })

  /** Ask for the dialog that chooses the new owner, where the person owns the workspace and someone can become it. */
  const askToTransfer = () =>
    mayTransferOwnership(model) && transferCandidates(model).length > 0
      ? Update.combine(model, [
          openDialog(Entering.Transferring({ newOwner: Option.none(), isSending: false, failure: Option.none() }))
        ])
      : { model }

  /** Ask for the dialog that confirms removing `memberId`, where the person may remove them. */
  const askToRemove = (memberId: MemberId.MemberId) =>
    Option.match(findMember(model, memberId), {
      onNone: () => ({ model }),
      onSome: ({ member, pending }) =>
        member.status === "active" && mayRemove(model, memberId) && !pending
          ? Update.combine(model, [
              openDialog(Entering.Removing({ memberId, name: member.name, isSending: false, failure: Option.none() }))
            ])
          : { model }
    })

  /** Send the invitation the person drafted, when it names someone and they may invite. */
  const submitInvite = (model: Model) =>
    Option.match(model.entering, {
      onNone: () => ({ model }),
      onSome: (entering) =>
        Entering.matchOrElse(
          entering,
          {
            Inviting: (inviting) => {
              if (inviting.isSending || inviting.email.trim() === "") {
                return { model }
              }

              if (!mayInvite(model)) {
                return { model: atEntering(model, refusedEntering(failureOf("Invite", "Denied"))) }
              }

              const { workspaceId, memberId } = model
              return {
                model: atEntering(model, sentEntering),
                commands: [Invite({ workspaceId, memberId, email: inviting.email.trim(), roleId: inviting.roleId })]
              }
            }
          },
          () => ({ model })
        )
    })

  /** Send the revoking the person confirmed, when the invitation is still to be accepted and they may revoke it. */
  const submitRevocation = (model: Model) =>
    Option.match(model.entering, {
      onNone: () => ({ model }),
      onSome: (entering) =>
        Entering.matchOrElse(
          entering,
          {
            Revoking: ({ invitationId, isSending }) => {
              if (isSending) {
                return { model }
              }

              if (Option.isNone(findWaitingInvitation(model, invitationId))) {
                return { model: atEntering(model, refusedEntering(failureOf("Revoke", "Gone"))) }
              }

              if (!mayInvite(model)) {
                return { model: atEntering(model, refusedEntering(failureOf("Revoke", "Denied"))) }
              }

              const { workspaceId, memberId } = model
              return {
                model: atEntering(model, sentEntering),
                commands: [RevokeInvitation({ workspaceId, memberId, invitationId })]
              }
            }
          },
          () => ({ model })
        )
    })

  /** Send the handing over the person confirmed, from the owner's assignment they saw, to a member who can still become the owner. */
  const submitTransfer = (model: Model) =>
    Option.match(model.entering, {
      onNone: () => ({ model }),
      onSome: (entering) =>
        Entering.matchOrElse(
          entering,
          {
            Transferring: ({ newOwner, isSending }) => {
              if (isSending || Option.isNone(newOwner)) {
                return { model }
              }

              const refuse = (reason: Reason) => ({
                model: atEntering(model, refusedEntering(failureOf("Transfer", reason)))
              })
              const assignment = ownerAssignment(model)

              if (
                Option.isNone(assignment) ||
                !transferCandidates(model).some((candidate) => candidate.id === newOwner.value)
              ) {
                return refuse("Gone")
              }

              if (!mayTransferOwnership(model)) {
                return refuse("Denied")
              }

              const { workspaceId, memberId } = model
              return {
                model: atEntering(model, sentEntering),
                commands: [
                  TransferOwnership({
                    workspaceId,
                    memberId,
                    newOwnerMemberId: newOwner.value,
                    expectedOwnerAssignmentId: assignment.value.id
                  })
                ]
              }
            }
          },
          () => ({ model })
        )
    })

  /** Send the removal the person confirmed, when the member is still in the workspace and they may remove them. */
  const submitRemoval = (model: Model) =>
    Option.match(model.entering, {
      onNone: () => ({ model }),
      onSome: (entering) =>
        Entering.matchOrElse(
          entering,
          {
            Removing: ({ memberId: removeMemberId, isSending }) => {
              if (isSending) {
                return { model }
              }

              const refuse = (reason: Reason) => ({
                model: atEntering(model, refusedEntering(failureOf("Remove", reason)))
              })

              if (!Option.exists(findMember(model, removeMemberId), ({ member }) => member.status === "active")) {
                return refuse("Gone")
              }

              if (!mayRemove(model, removeMemberId)) {
                return refuse("Denied")
              }

              const { workspaceId, memberId } = model
              return {
                model: atEntering(model, sentEntering),
                commands: [RemoveMember({ workspaceId, memberId, removeMemberId })]
              }
            }
          },
          () => ({ model })
        )
    })

  /** What the store keeping an action means for the person: the form is done with, and the page is told to say so. */
  const keep = (written: Written) =>
    Written.match(written, {
      Rename: () => ({
        model: modifyFields(model, { workspaceName: () => Option.none() }),
        outMessage: OutMessage.RenamedWorkspace()
      }),
      RenameSelf: () => ({
        model: modifyFields(model, { ownName: () => Option.none() }),
        outMessage: OutMessage.RenamedSelf()
      }),
      ChangeRole: ({ memberId }) => ({
        model: atSelected(model, (selected) =>
          selected.memberId === memberId
            ? { ...selected, roleId: Option.none(), isSaving: false, failure: Option.none() }
            : selected
        ),
        outMessage: OutMessage.ChangedRole({ name: nameOfMember(model, memberId) })
      }),
      Remove: ({ memberId }) =>
        pipe(
          Update.combine(
            modifyFields(model, { selected: Option.filter((selected) => selected.memberId !== memberId) }),
            closeDialogWhen(Option.exists(model.entering, (entering) => isRemoving(entering, memberId)))
          ),
          Update.withOutMessage(OutMessage.RemovedMember({ name: nameOfMember(model, memberId) }))
        ),
      Transfer: ({ memberId }) =>
        pipe(
          Update.combine(model, closeDialogWhen(Option.exists(model.entering, Entering.isAnyOf(["Transferring"])))),
          Update.withOutMessage(OutMessage.TransferredOwnership({ name: nameOfMember(model, memberId) }))
        ),
      Invite: () =>
        pipe(
          Update.combine(model, closeDialogWhen(Option.exists(model.entering, Entering.isAnyOf(["Inviting"])))),
          Update.withOutMessage(OutMessage.InvitedMember())
        ),
      Revoke: ({ invitationId }) =>
        pipe(
          Update.combine(
            model,
            closeDialogWhen(Option.exists(model.entering, (entering) => isRevoking(entering, invitationId)))
          ),
          Update.withOutMessage(OutMessage.RevokedInvitation())
        )
    })

  /** What the store, or the app, refusing an action means for the person: the place it was made says why. */
  const refuse = (model: Model, written: Written, reason: Reason): Model =>
    Written.match(written, {
      Rename: () => atWorkspaceName(model, refusedName(failureOf("Rename", reason))),
      RenameSelf: () => atOwnName(model, refusedName(failureOf("RenameSelf", reason))),
      ChangeRole: ({ memberId }) =>
        atSelected(model, (selected) =>
          selected.memberId === memberId
            ? { ...selected, isSaving: false, failure: Option.some(failureOf("ChangeRole", reason)) }
            : selected
        ),
      Remove: ({ memberId }) => refuseEntering(model, "Remove", reason, (entering) => isRemoving(entering, memberId)),
      Transfer: () => refuseEntering(model, "Transfer", reason, Entering.isAnyOf(["Transferring"])),
      Invite: () => refuseEntering(model, "Invite", reason, Entering.isAnyOf(["Inviting"])),
      Revoke: ({ invitationId }) =>
        refuseEntering(model, "Revoke", reason, (entering) => isRevoking(entering, invitationId))
    })

  return Message.match(message, {
    ReceivedSettings: ({ workspace, members, roles, assignments, invitations, grants }) => ({
      model: modifyFields(model, {
        workspace: () => workspace,
        members: () => members,
        roles: () => roles,
        assignments: () => assignments,
        invitations: () => invitations,
        grants: () => grants,
        isUnreadable: () => false
      })
    }),
    FailedRead: () => ({ model: modifyFields(model, { isUnreadable: () => true }) }),
    // What the person sees is out of date: it is read again, and what failed is no longer shown.
    ClickedRefresh: () => ({
      model: modifyFields(model, {
        isUnreadable: () => false,
        reads: (reads) => reads + 1,
        workspaceName: Option.map((edit) => ({ ...edit, failure: Option.none() })),
        ownName: Option.map((edit) => ({ ...edit, failure: Option.none() })),
        selected: Option.map((selected) => ({ ...selected, failure: Option.none() })),
        entering: Option.map(unfailedEntering)
      })
    }),
    TypedWorkspaceName: ({ name }) => ({
      model: modifyFields(model, { workspaceName: (edit) => typedName(edit, name) })
    }),
    SubmittedWorkspaceName: () => submitWorkspaceName(model),
    TypedOwnName: ({ name }) => ({ model: modifyFields(model, { ownName: (edit) => typedName(edit, name) }) }),
    SubmittedOwnName: () => submitOwnName(model),
    ClickedCopyId: () => ({
      model: modifyFields(model, { copyAttempts: (attempts) => attempts + 1 }),
      commands: [CopyWorkspaceId({ workspaceId: model.workspaceId, attempt: model.copyAttempts + 1 })]
    }),
    CopiedWorkspaceId: ({ attempt }) => ({
      model: modifyFields(model, { copiedAttempt: () => Option.some(attempt) }),
      commands: [ExpireCopied({ attempt })]
    }),
    FailedCopyWorkspaceId: () => ({ model }),
    ExpiredCopied: ({ attempt }) => ({
      model: modifyFields(model, { copiedAttempt: Option.filter((copied) => copied !== attempt) })
    }),
    TypedMemberQuery: ({ query }) => ({
      model: modifyFields(model, { filter: (filter) => ({ ...filter, query }) })
    }),
    ChoseMemberStatus: ({ status }) => ({
      model: modifyFields(model, { filter: (filter) => ({ ...filter, status }) })
    }),
    ClickedMember: ({ memberId }) =>
      Option.isSome(findMember(model, memberId))
        ? {
            model: modifyFields(model, {
              selected: () => Option.some({ memberId, roleId: Option.none(), isSaving: false, failure: Option.none() })
            }),
            outMessage: OutMessage.OpenedMember({ memberId })
          }
        : { model },
    ClickedCloseMember: () => ({
      model: modifyFields(model, { selected: () => Option.none() }),
      outMessage: OutMessage.ClosedMember()
    }),
    ChoseRole: ({ roleId }) => ({
      model: atSelected(model, (selected) =>
        selected.isSaving ? selected : { ...selected, roleId: Option.some(roleId), failure: Option.none() }
      )
    }),
    SubmittedRole: () => submitRole(model),
    ClickedRemoveMember: ({ memberId }) => askToRemove(memberId),
    ConfirmedRemoval: () => submitRemoval(model),
    ClickedTransferOwnership: () => askToTransfer(),
    ChoseNewOwner: ({ memberId }) => ({
      model: atEntering(model, (entering) =>
        Entering.isAnyOf(["Transferring"])(entering) && !entering.isSending
          ? { ...entering, newOwner: memberId, failure: Option.none() }
          : entering
      )
    }),
    ConfirmedTransfer: () => submitTransfer(model),
    ClickedInvite: () => askToInvite(),
    TypedInviteEmail: ({ email }) => ({
      model: atInviting(model, (inviting) => ({ ...inviting, email, failure: Option.none() }))
    }),
    ChoseInviteRole: ({ roleId }) => ({
      model: atInviting(model, (inviting) => ({ ...inviting, roleId, failure: Option.none() }))
    }),
    SubmittedInvite: () => submitInvite(model),
    ClickedViewHistory: () => askToViewHistory(),
    ClickedRevoke: ({ invitationId }) => askToRevoke(invitationId),
    ConfirmedRevocation: () => submitRevocation(model),
    WroteAction: ({ written }) => keep(written),
    FailedWriteAction: ({ written, reason }) => ({ model: refuse(model, written, reason) })
  })
})
