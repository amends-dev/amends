/** Settings submission guards, validation, and commands. */

import * as Option from "effect/Option"
import {
  ChangeRole,
  Invite,
  RemoveMember,
  RenameSelf,
  RenameWorkspace,
  RevokeInvitation,
  TransferOwnership
} from "../command.ts"
import {
  findWaitingInvitation,
  Entering,
  findMember,
  isNameChanged,
  isRoleChanged,
  type Model,
  mayChangeRole,
  mayInvite,
  mayRemove,
  mayRename,
  mayTransferOwnership,
  ownerAssignment,
  ownName,
  type Reason,
  transferCandidates,
  workspaceRolesOf
} from "../definition.ts"
import {
  failureOf,
  atWorkspaceName,
  refusedName,
  sentName,
  atEntering,
  refusedEntering,
  sentEntering,
  atSelected
} from "./forms.ts"

/** Send the workspace name once it changed, access allows it, and no save is underway. */
export const submitWorkspaceName = (model: Model) => {
  if (Option.isNone(model.workspaceName) || model.workspaceName.value.isSaving) return { model }
  const edit = model.workspaceName.value
  if (Option.isNone(model.workspace)) {
    return { model: atWorkspaceName(model, refusedName(failureOf("Rename", "Gone"))) }
  }
  const { workspace } = model.workspace.value
  if (!isNameChanged(edit.name, workspace.name)) return { model }
  if (!mayRename(model)) {
    return { model: atWorkspaceName(model, refusedName(failureOf("Rename", "Denied"))) }
  }
  const { workspaceId, memberId } = model
  return {
    model: atWorkspaceName(model, sentName),
    commands: [RenameWorkspace({ workspaceId, memberId, name: edit.name.trim(), expectedName: workspace.name })]
  }
}

/** Send the name the person typed for themselves, when it is one to save and the replica holds their membership. */
export const submitOwnName = (model: Model) => {
  const form = Option.filter(model.entering, Entering.isAnyOf(["ChangingName"]))
  if (Option.isNone(form)) return { model }
  const { name, isSending } = form.value
  if (isSending) {
    return { model }
  }

  if (Option.isNone(findMember(model, model.memberId))) {
    return { model: atEntering(model, refusedEntering(failureOf("RenameSelf", "Gone"))) }
  }

  if (!isNameChanged(name, ownName(model))) {
    return { model }
  }

  const { workspaceId, memberId } = model
  return {
    model: atEntering(model, sentEntering),
    commands: [RenameSelf({ workspaceId, memberId, name: name.trim() })]
  }
}

/** Send the role the person chose for the member open as a replacement of the roles they saw the member hold. */
export const submitRole = (model: Model) => {
  const form = model.selected
  if (Option.isNone(form)) return { model }
  const selected = form.value
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

/** Send the invitation the person drafted, when it names someone and they may invite. */
export const submitInvite = (model: Model) => {
  const form = Option.filter(model.entering, Entering.isAnyOf(["Inviting"]))
  if (Option.isNone(form)) return { model }
  const inviting = form.value
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

/** Send the revoking the person confirmed, when the invitation is still to be accepted and they may revoke it. */
export const submitRevocation = (model: Model) => {
  const form = Option.filter(model.entering, Entering.isAnyOf(["Revoking"]))
  if (Option.isNone(form)) return { model }
  const { invitationId, isSending } = form.value
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

/**
 * Send the handing over the person confirmed, from the owner's assignment they saw, to a member who can still become
 * the owner.
 */
export const submitTransfer = (model: Model) => {
  const form = Option.filter(model.entering, Entering.isAnyOf(["Transferring"]))
  if (Option.isNone(form)) return { model }
  const { newOwner, isSending } = form.value
  if (isSending || Option.isNone(newOwner)) {
    return { model }
  }

  const refuse = (reason: Reason) => ({
    model: atEntering(model, refusedEntering(failureOf("Transfer", reason)))
  })
  const assignment = ownerAssignment(model)

  if (Option.isNone(assignment) || !transferCandidates(model).some((candidate) => candidate.id === newOwner.value)) {
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

/** Send the removal the person confirmed, when the member is still in the workspace and they may remove them. */
export const submitRemoval = (model: Model) => {
  const form = Option.filter(model.entering, Entering.isAnyOf(["Removing"]))
  if (Option.isNone(form)) return { model }
  const { memberId: removeMemberId, isSending } = form.value
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
