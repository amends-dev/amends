/** What the person does to the workspace, its members, roles, and invitations, each an action written to their store. */

import { Assignment, Role } from "@amends-dev/core/authorization"
import { Invitation, Member, MemberId, WorkspaceSettings } from "@amends-dev/core/workspace"
import * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { Message, SettingsDefinition } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** How long an invitation can be accepted for. */
const invitationLasts = { days: 7 }

/** Rename the workspace to `name`, from the name the person saw. */
export const RenameWorkspace = SettingsDefinition.command("RenameWorkspace", {
  args: { ...Stores.AsMember, name: Schema.String, expectedName: Schema.String },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ name, expectedName, ...member }) =>
      Stores.decoded(WorkspaceSettings.RenameInput, { name, expectedName }, failed("A workspace needs a name.")).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("WorkspaceRenamed", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Change the name the person goes by in the workspace to `name`. */
export const RenameSelf = SettingsDefinition.command("RenameSelf", {
  args: { ...Stores.AsMember, name: Schema.String },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ name, ...member }) =>
      Stores.decoded(Member.NewName, name, failed("Your name can't be empty.")).pipe(
        Effect.flatMap((name) => write(member, (store) => store.write("MemberRenamed", { name }))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Remove `memberId` from the workspace. */
export const RemoveMember = SettingsDefinition.command("RemoveMember", {
  args: { ...Stores.AsMember, removeMemberId: MemberId.MemberId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ removeMemberId, ...member }) =>
      write(member, (store) => store.write("MemberRemoved", { memberId: removeMemberId }))
  }
})

/** Give `changeMemberId` the role `roleId` in place of the workspace roles the person saw them hold. */
export const ChangeRole = SettingsDefinition.command("ChangeRole", {
  args: {
    ...Stores.AsMember,
    changeMemberId: MemberId.MemberId,
    roleId: Role.RoleId,
    expectedAssignmentIds: Schema.Array(Assignment.AssignmentId)
  },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ changeMemberId, roleId, expectedAssignmentIds, ...member }) =>
      write(member, (store) =>
        store.write("RolesReplaced", { memberId: changeMemberId, roleId, expectedAssignmentIds })
      )
  }
})

/** Hand the workspace to `newOwnerMemberId`, from the owner's assignment the person saw. */
export const TransferOwnership = SettingsDefinition.command("TransferOwnership", {
  args: { ...Stores.AsMember, newOwnerMemberId: MemberId.MemberId, expectedOwnerAssignmentId: Assignment.AssignmentId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ newOwnerMemberId, expectedOwnerAssignmentId, ...member }) =>
      write(member, (store) =>
        store.write("OwnershipTransferred", { memberId: newOwnerMemberId, expectedOwnerAssignmentId })
      )
  }
})

/** Invite whoever `email` names, with `roleId`, for as long as an invitation lasts. */
export const Invite = SettingsDefinition.command("Invite", {
  args: { ...Stores.AsMember, email: Schema.String, roleId: Role.RoleId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ email, roleId, ...member }) =>
      Effect.flatMap(DateTime.now, (now) =>
        Stores.decoded(
          WorkspaceSync.IssueInput,
          { email, roleId, expiresAt: DateTime.formatIso(DateTime.add(now, invitationLasts)) },
          failed("Enter an email address.")
        )
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("InvitationIssued", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Revoke the invitation `invitationId`. */
export const RevokeInvitation = SettingsDefinition.command("RevokeInvitation", {
  args: { ...Stores.AsMember, invitationId: Invitation.InvitationId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ invitationId, ...member }) => write(member, (store) => store.write("InvitationRevoked", { invitationId }))
  }
})

export const EffectsLayer = Layer.mergeAll(
  RenameWorkspace.layer,
  RenameSelf.layer,
  RemoveMember.layer,
  ChangeRole.layer,
  TransferOwnership.layer,
  Invite.layer,
  RevokeInvitation.layer
)
