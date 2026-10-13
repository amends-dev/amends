import { Assignment, Scope } from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import { Invitation, Member, Ownership, Workspace, WorkspaceSettings } from "@amends-dev/core/workspace"
import type { SettingsTab } from "@amends-dev/ui/screens/settings"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"
import type { ApiClient, WorkspaceApi } from "../api/client.ts"
import { Accounts } from "../api/contracts.ts"
import { directoryQuery } from "../api/directory.ts"
import { command } from "../api/failures.ts"
import { workspaceKey } from "../api/keys.ts"
import { refreshResult } from "../api/refresh.ts"
import { newWorkspaceRequestKey } from "../workspaces/api.ts"

export { Assignment, Scope, Invitation, Identity }

/**
 * The Workspace tab reads settings and ownership; Members adds the roster and invitations, with
 * the addresses of the people in them for a reader who manages invitations.
 */
export interface SettingsData {
  readonly settings: WorkspaceSettings.View
  readonly ownership: Ownership.View
  readonly members: ReadonlyArray<WorkspaceSettings.MemberEntry>
  readonly invitations: ReadonlyArray<Invitation.Invitation>
  readonly accounts: ReadonlyArray<Accounts.Account>
}
/** A change the reader makes in settings. */
export type SettingsCommand =
  | { kind: "rename"; name: string; expectedName: string }
  | { kind: "transfer"; memberId: string; expectedOwnerAssignmentId: string }
  | { kind: "role"; memberId: string; roleId: string; expectedAssignmentIds: ReadonlyArray<string> }
  | { kind: "remove"; memberId: string }
  | {
      kind: "invite"
      email: string
      roleId: string
      expiresAt: DateTime.Utc
      key: ReturnType<typeof newWorkspaceRequestKey>
    }
  | { kind: "revoke"; invitationId: string }
export const invitationIntent = (email: string, roleId: string) => ({
  kind: "invite" as const,
  email: email.trim(),
  roleId,
  expiresAt: DateTime.add(DateTime.makeUnsafe(Date.now()), { days: 7 }),
  key: newWorkspaceRequestKey()
})
/** A read left unmounted: it reports nothing and makes no request. */
const idle = <A>(atom: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<A>, unknown>>) =>
  Atom.make(AsyncResult.success([])) as unknown as typeof atom
const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const members = client.query("settings", "members", {
    reactivityKeys: [workspaceKey(workspaceId, "members")]
  })
  const invitations = client.query("invitations", "list", {
    reactivityKeys: [workspaceKey(workspaceId, "invitations")]
  })
  // Whom the roster and the invitations name changes with either.
  const accounts = client.query("accounts", "list", {
    reactivityKeys: [workspaceKey(workspaceId, "members"), workspaceKey(workspaceId, "invitations")]
  })
  const idleMembers = idle(members),
    idleInvitations = idle(invitations),
    idleAccounts = idle(accounts)
  return {
    settings: client.query("settings", "get", {
      reactivityKeys: [workspaceKey(workspaceId, "settings")]
    }),
    ownership: client.query("settings", "ownership", {
      reactivityKeys: [workspaceKey(workspaceId, "ownership")]
    }),
    members: (enabled: boolean) => (enabled ? members : idleMembers),
    invitations: (enabled: boolean) => (enabled ? invitations : idleInvitations),
    accounts: (enabled: boolean) => (enabled ? accounts : idleAccounts)
  }
}
/**
 * The reads behind the settings sections, through the workspace's client. Each registers its
 * invalidation key, so the workspace change feed and writes refresh whichever are mounted.
 * Undefined for an invalid workspace ID.
 */
export const settingsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)))
export type SettingsReads = ReturnType<typeof reads>

/** Make one change to the workspace's settings, answering with the invitation it issued, if any. */
export const changeSettings = (api: WorkspaceApi, change: SettingsCommand) =>
  Effect.gen(function* () {
    switch (change.kind) {
      case "rename":
        yield* api.settings.rename({
          payload: yield* command(WorkspaceSettings.RenameInput)(change)
        })
        return undefined
      case "transfer":
        yield* api.settings.transferOwnership({
          payload: yield* command(Ownership.TransferInput)(change)
        })
        return undefined
      case "role":
        yield* api.assignments.change({
          payload: yield* command(Assignment.ChangeInput)(change)
        })
        return undefined
      case "remove":
        yield* api.members.remove({
          params: { memberId: yield* command(Member.Id)(change.memberId) }
        })
        return undefined
      case "invite": {
        const issued = yield* api.invitations.issue({
          payload: {
            email: yield* command(Accounts.Email)(change.email),
            roleId: yield* command(Invitation.IssueInput.fields.roleId)(change.roleId),
            expiresAt: change.expiresAt
          },
          headers: { "idempotency-key": change.key }
        })
        return issued.details.id as string
      }
      case "revoke":
        yield* api.invitations.revoke({
          params: { invitationId: yield* command(Invitation.Id)(change.invitationId) }
        })
        return undefined
    }
  })
/**
 * Reload a section and the directory, which names the workspace, as a change's result shows; the
 * directory is the session `client`'s read.
 */
export const reloadSettings = (client: ApiClient, reads: SettingsReads, section: SettingsTab) =>
  Effect.gen(function* () {
    const [settings] = yield* Effect.all(
      [
        refreshResult(reads.settings),
        refreshResult(reads.ownership),
        refreshResult(directoryQuery(client)),
        section === "members" ? refreshResult(reads.members(true)) : Effect.void
      ],
      { concurrency: "unbounded" }
    )
    if (section === "members" && settings.canReadInvitations)
      yield* Effect.all([refreshResult(reads.invitations(true)), refreshResult(reads.accounts(true))], {
        concurrency: "unbounded"
      })
  })
