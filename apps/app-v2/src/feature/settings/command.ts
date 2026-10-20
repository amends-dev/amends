/**
 * What the person does to the workspace, its members, roles, and invitations, each an action written to their store;
 * and copying the workspace's ID to the clipboard, and waiting for the word that says so to go.
 */

import { Assignment, Role } from "@amends-dev/core/authorization"
import { Invitation, Member, MemberId, WorkspaceId, WorkspaceSettings } from "@amends-dev/core/workspace"
import * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import * as Clipboard from "@effect/platform-browser/Clipboard"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { Message, SettingsDefinition, Written } from "./definition.ts"

const outcomes = [Message.WroteAction, Message.FailedWriteAction]

/** What the action `done` reports when the store kept it. */
const wrote = (done: Written) => Message.WroteAction({ written: done })

/** What the action `done` reports when it can't be made as entered. */
const refused = (done: Written) => Message.FailedWriteAction({ written: done, reason: "Invalid" })

/** What the action `done` reports when this browser could not keep it. */
const unkept = (done: Written) => Message.FailedWriteAction({ written: done, reason: "Failed" })

/** How long an invitation can be accepted for. */
const invitationLasts = { days: 7 }

/** How long "Copied" shows after the workspace's ID is on the clipboard. */
const copiedShows = "2 seconds"

/** Rename the workspace to `name`, from the name the person saw. */
export const RenameWorkspace = SettingsDefinition.command("RenameWorkspace", {
  args: { ...Stores.AsMember, name: Schema.String, expectedName: Schema.String },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ name, expectedName, ...member }) => {
      const done = Written.Rename()
      return Stores.decoded(WorkspaceSettings.RenameInput, { name, expectedName }, refused(done)).pipe(
        Effect.flatMap((input) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
            store.write("WorkspaceRenamed", input)
          )
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Change the name the person goes by in the workspace to `name`. */
export const RenameSelf = SettingsDefinition.command("RenameSelf", {
  args: { ...Stores.AsMember, name: Schema.String },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ name, ...member }) => {
      const done = Written.RenameSelf()
      return Stores.decoded(Member.NewName, name, refused(done)).pipe(
        Effect.flatMap((name) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
            store.write("MemberRenamed", { name })
          )
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Remove `removeMemberId` from the workspace. */
export const RemoveMember = SettingsDefinition.command("RemoveMember", {
  args: { ...Stores.AsMember, removeMemberId: MemberId.MemberId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ removeMemberId, ...member }) => {
      const done = Written.Remove({ memberId: removeMemberId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("MemberRemoved", { memberId: removeMemberId })
      )
    }
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
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ changeMemberId, roleId, expectedAssignmentIds, ...member }) => {
      const done = Written.ChangeRole({ memberId: changeMemberId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("RolesReplaced", { memberId: changeMemberId, roleId, expectedAssignmentIds })
      )
    }
  }
})

/** Hand the workspace to `newOwnerMemberId`, from the owner's assignment the person saw. */
export const TransferOwnership = SettingsDefinition.command("TransferOwnership", {
  args: { ...Stores.AsMember, newOwnerMemberId: MemberId.MemberId, expectedOwnerAssignmentId: Assignment.AssignmentId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ newOwnerMemberId, expectedOwnerAssignmentId, ...member }) => {
      const done = Written.Transfer({ memberId: newOwnerMemberId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("OwnershipTransferred", { memberId: newOwnerMemberId, expectedOwnerAssignmentId })
      )
    }
  }
})

/** Invite whoever `email` names, with `roleId`, for as long as an invitation lasts. */
export const Invite = SettingsDefinition.command("Invite", {
  args: { ...Stores.AsMember, email: Schema.String, roleId: Role.RoleId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ email, roleId, ...member }) => {
      const done = Written.Invite()
      return Effect.flatMap(DateTime.now, (now) =>
        Stores.decoded(
          WorkspaceSync.IssueInput,
          { email, roleId, expiresAt: DateTime.formatIso(DateTime.add(now, invitationLasts)) },
          refused(done)
        )
      ).pipe(
        Effect.flatMap((input) =>
          Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
            store.write("InvitationIssued", input)
          )
        ),
        Effect.catch(Effect.succeed)
      )
    }
  }
})

/** Revoke the invitation `invitationId`. */
export const RevokeInvitation = SettingsDefinition.command("RevokeInvitation", {
  args: { ...Stores.AsMember, invitationId: Invitation.InvitationId },
  messages: outcomes,
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ invitationId, ...member }) => {
      const done = Written.Revoke({ invitationId })
      return Stores.writer(stores, wrote(done), () => unkept(done))(member, (store) =>
        store.write("InvitationRevoked", { invitationId })
      )
    }
  }
})

/** Put the workspace's ID on the browser's clipboard, for the person's `attempt` at copying it. */
export const CopyWorkspaceId = SettingsDefinition.command("CopyWorkspaceId", {
  args: { workspaceId: WorkspaceId.WorkspaceId, attempt: Schema.Int },
  messages: [Message.CopiedWorkspaceId, Message.FailedCopyWorkspaceId],
  handler: function* () {
    const clipboard = yield* Clipboard.Clipboard
    return ({ workspaceId, attempt }) =>
      clipboard.writeString(workspaceId).pipe(
        Effect.as(Message.CopiedWorkspaceId({ attempt })),
        Effect.orElseSucceed(() => Message.FailedCopyWorkspaceId())
      )
  }
})

/**
 * Wait a moment, then report that the person's `attempt` at copying the workspace's ID has shown as done long enough.
 */
export const ExpireCopied = SettingsDefinition.command("ExpireCopied", {
  args: { attempt: Schema.Int },
  messages: [Message.ExpiredCopied],
  handler: function* () {
    return ({ attempt }) => Effect.sleep(copiedShows).pipe(Effect.as(Message.ExpiredCopied({ attempt })))
  }
})

export const EffectsLayer = Layer.mergeAll(
  RenameWorkspace.layer,
  RenameSelf.layer,
  RemoveMember.layer,
  ChangeRole.layer,
  TransferOwnership.layer,
  Invite.layer,
  RevokeInvitation.layer,
  CopyWorkspaceId.layer,
  ExpireCopied.layer
)
