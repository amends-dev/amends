/**
 * The gateway's `WorkspaceStorage.WorkspaceStorage` over one pool. `forWorkspace` builds a
 * workspace's views on demand: every store core requires and the workspace's signal hub, merged by
 * `layerWorkspace` over one `Binding.Binding`. The views acquire nothing of their own, so building
 * them is inexpensive, and adding a store adds a line to the private register beside
 * `layerWorkspace`. `make` checks the host's options and imports its credential key once, so
 * invalid ones stop the host starting.
 *
 * @since 0.1.0
 */

import type { Workspace } from "@amends-dev/core/workspace"
import { WorkspaceStorage } from "@amends-dev/gateway"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as Redacted from "effect/Redacted"
import * as Agents from "./Agents.ts"
import * as Assignments from "./Assignments.ts"
import * as Binding from "./Binding.ts"
import * as ChannelBindings from "./ChannelBindings.ts"
import * as Channels from "./Channels.ts"
import * as Checkpoints from "./Checkpoints.ts"
import * as ConnectionCredentials from "./ConnectionCredentials.ts"
import * as Connections from "./Connections.ts"
import * as Contacts from "./Contacts.ts"
import * as CredentialKey from "./CredentialKey.ts"
import * as Deliveries from "./Deliveries.ts"
import * as GroupFollows from "./GroupFollows.ts"
import * as GroupMemberships from "./GroupMemberships.ts"
import * as Groups from "./Groups.ts"
import * as Invitations from "./Invitations.ts"
import * as Journal from "./Journal.ts"
import * as Members from "./Members.ts"
import * as Notifications from "./Notifications.ts"
import * as PostgresDatabase from "./PostgresDatabase.ts"
import * as PostgresSignalHub from "./PostgresSignalHub.ts"
import * as ReadStates from "./ReadStates.ts"
import * as Roles from "./Roles.ts"
import * as SessionLogs from "./SessionLogs.ts"
import * as SessionStates from "./SessionStates.ts"
import * as Tasks from "./Tasks.ts"
import * as ThreadActivities from "./ThreadActivities.ts"
import * as ThreadMessages from "./ThreadMessages.ts"
import * as ThreadParticipations from "./ThreadParticipations.ts"
import * as Threads from "./Threads.ts"
import * as TurnRecords from "./TurnRecords.ts"
import * as Workspaces from "./Workspaces.ts"

/**
 * The binding's limits, and the host's credential key.
 *
 * @category options
 * @since 0.1.0
 */
export interface Options extends Binding.Options {
  /**
   * The key that seals connections' credentials at rest: 32 bytes, encoded as base64. Without
   * one, the host stores no credentials, and setting one reports that it cannot.
   */
  readonly credentialKey?: Redacted.Redacted<string> | undefined
}

/**
 * Provide every store core requires, and the signal hub, over the same workspace binding.
 * Adding a store adds a line here.
 */
const layerStores = Layer.mergeAll(
  Journal.layer,
  Checkpoints.layer,
  Workspaces.layer,
  Members.layer,
  Roles.layer,
  Assignments.layer,
  Invitations.layer,
  Notifications.layer,
  Groups.layer,
  GroupMemberships.layer,
  GroupFollows.layer,
  Threads.layer,
  ThreadParticipations.layer,
  ThreadMessages.layer,
  ThreadActivities.layer,
  Tasks.layer,
  Channels.layer,
  ChannelBindings.layer,
  Contacts.layer,
  Deliveries.layer,
  ReadStates.layer,
  Connections.layer,
  ConnectionCredentials.layer,
  SessionStates.layer,
  SessionLogs.layer,
  Agents.layer,
  TurnRecords.layer,
  PostgresSignalHub.layer
)

/**
 * Provide the stores bound to one workspace, and its signal hub, over the caller's database, with
 * the credential key `make` imported, or none.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerWorkspace = (
  workspaceId: Workspace.Id,
  options: Options = {},
  credentialKey: Option.Option<CredentialKey.Cipher> = Option.none()
) =>
  layerStores.pipe(
    Layer.provide(Layer.mergeAll(Binding.layer(workspaceId, options), CredentialKey.layer(credentialKey)))
  )

/**
 * One pool, with inexpensive workspace-bound views over it. The stores hold no
 * resources, so the scope that builds them can close at once.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (options: Options = {}) {
  // Invalid options stop the host starting, rather than its first workspace.
  yield* Binding.settings(options)
  const credentialKey =
    options.credentialKey === undefined
      ? Option.none()
      : Option.some(yield* Effect.orDie(CredentialKey.make(options.credentialKey)))
  const postgresDatabase = yield* PostgresDatabase.PostgresDatabase
  const forWorkspace: WorkspaceStorage.WorkspaceStorage["Service"]["forWorkspace"] = Effect.fn(
    "PostgresWorkspaceStorage.forWorkspace"
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(layerWorkspace(workspaceId, options, credentialKey)))
    },
    Effect.provideService(PostgresDatabase.PostgresDatabase, postgresDatabase)
  )
  return WorkspaceStorage.WorkspaceStorage.of({ forWorkspace })
})

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (options: Options = {}) => Layer.effect(WorkspaceStorage.WorkspaceStorage, make(options))
