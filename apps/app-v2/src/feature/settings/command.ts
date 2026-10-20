/**
 * What the person does to the workspace's name, their own, and a member's role, each an action written to their store;
 * and copying the workspace's ID to the clipboard, and waiting for the word that says so to go.
 */

import { Assignment, Role } from "@amends-dev/core/authorization"
import { Member, MemberId, WorkspaceId, WorkspaceSettings } from "@amends-dev/core/workspace"
import * as Clipboard from "@effect/platform-browser/Clipboard"
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

/** Wait a moment, then report that the person's `attempt` at copying the workspace's ID has shown as done long enough. */
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
  ChangeRole.layer,
  CopyWorkspaceId.layer,
  ExpireCopied.layer
)
