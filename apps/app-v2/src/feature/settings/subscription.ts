/**
 * The workspace, its members, roles, role assignments, and invitations, and what the person may
 * do, read from their store as they change.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { Message, SettingsDefinition } from "./definition.ts"

/** The settings as `store` holds them, each time any of them changes. */
export const readSettings = (store: Store.Store["Service"]) =>
  Stream.zipLatestAll(
    store.list("Workspace", Store.workspacePlace),
    store.list("Member", Store.workspacePlace),
    store.list("Role", Store.workspacePlace),
    store.list("Assignment", Store.workspacePlace),
    store.list("Invitation", Store.workspacePlace),
    store.grants
  ).pipe(
    Stream.map(([workspaces, members, roles, assignments, invitations, grants]) =>
      Message.ReceivedSettings({
        workspace: Option.map(Array.head(workspaces), ({ record, pending }) => ({ workspace: record.value, pending })),
        members: members.map(({ record, pending }) => ({ member: record.value, pending })),
        roles: roles.map(({ record }) => record.value),
        assignments: assignments.map(({ record, pending }) => ({ assignment: record.value, pending })),
        invitations: invitations.map(({ record, pending }) => ({ invitation: record.value, pending })),
        grants
      })
    )
  )

/**
 * The settings are read once the Block opens, and again each time the person asks to refresh them, which a failed read
 * leaves them to ask for. Each time the page asks for the dialog that changes the person's name, which counts the asks,
 * the Block is told to open it, and the settings are read again.
 */
export const subscriptions = SettingsDefinition.subscriptions((entry) => ({
  settings: entry(
    "ReadSettings",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int, nameChanges: Schema.Int },
    {
      messages: [Message.ReceivedSettings, Message.FailedRead, Message.RequestedChangeName],
      modelToDependencies: ({ workspaceId, memberId, reads, nameChangeRequests }) => ({
        workspaceId,
        memberId,
        reads,
        nameChanges: nameChangeRequests
      }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, nameChanges }) =>
          Stream.merge(
            stores
              .read(workspaceId, memberId, readSettings)
              .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead()))),
            nameChanges === 0 ? Stream.empty : Stream.make(Message.RequestedChangeName())
          )
      }
    }
  )
}))
