/** Incoming settings, dialogs, account feedback, and message routing. */

import { BuiltinRoles } from "@amends-dev/core/authorization"
import type { Invitation, MemberId } from "@amends-dev/core/workspace"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { CopyWorkspaceId, ExpireCopied } from "./command.ts"
import { askToChangeName, DialogBinding, leaveDialog, openDialog, SettingsComposition } from "./composition.ts"
import {
  findWaitingInvitation,
  Entering,
  findMember,
  Message,
  type Model,
  mayInvite,
  mayRemove,
  mayTransferOwnership,
  OutMessage,
  type Reason,
  transferCandidates,
  Written
} from "./definition.ts"
import {
  failureOf,
  typedName,
  refusedName,
  atWorkspaceName,
  atSelected,
  atInviting,
  atChangingName,
  unfailedEntering,
  atEntering,
  refuseEntering
} from "./update/forms.ts"
import {
  submitWorkspaceName,
  submitOwnName,
  submitRole,
  submitInvite,
  submitRevocation,
  submitTransfer,
  submitRemoval
} from "./update/submission.ts"

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

  /** What the store keeping an action means for the person: the form is done with, and the page is told to say so. */
  const keep = (written: Written) =>
    Written.match(written, {
      Rename: () => ({
        model: modifyFields(model, { workspaceName: () => Option.none() }),
        outMessage: OutMessage.RenamedWorkspace()
      }),
      RenameSelf: () =>
        pipe(
          Update.combine(model, closeDialogWhen(Option.exists(model.entering, Entering.isAnyOf(["ChangingName"])))),
          Update.withOutMessage(OutMessage.RenamedSelf())
        ),
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
      RenameSelf: () => refuseEntering(model, "RenameSelf", reason, Entering.isAnyOf(["ChangingName"])),
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
        selected: Option.map((selected) => ({ ...selected, failure: Option.none() })),
        entering: Option.map(unfailedEntering)
      })
    }),
    TypedWorkspaceName: ({ name }) => ({
      model: modifyFields(model, { workspaceName: (edit) => typedName(edit, name) })
    }),
    SubmittedWorkspaceName: () => submitWorkspaceName(model),
    TypedOwnName: ({ name }) => ({
      model: atChangingName(model, (changing) => ({ ...changing, name, failure: Option.none() }))
    }),
    SubmittedOwnName: () => submitOwnName(model),
    CompletedSelectOnFocus: () => ({ model }),
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
    RequestedNameChange: () => Update.combine(model, [askToChangeName]),
    WroteAction: ({ written }) => keep(written),
    FailedWriteAction: ({ written, reason }) => ({ model: refuse(model, written, reason) })
  })
})
