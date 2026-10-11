import * as Threads from "./threads.ts";
import * as ThreadParticipations from "./thread-participations.ts";
import * as ThreadMessages from "./thread-messages.ts";
import * as ThreadActivities from "./thread-activities.ts";
import * as Tasks from "./tasks.ts";
import * as Channels from "./channels.ts";
import * as ChannelBindings from "./channel-bindings.ts";
import * as Contacts from "./contacts.ts";
import * as Deliveries from "./deliveries.ts";
import type { Workspace } from "@amends-dev/core/workspace";
import { WorkspaceStorage } from "@amends-dev/gateway";
import { Effect, Layer, Option } from "effect";
import type { Redacted } from "effect";
import * as Agents from "./agents.ts";
import * as TurnRecords from "./turn-records.ts";
import * as Assignments from "./assignments.ts";
import * as Groups from "./groups.ts";
import * as GroupMemberships from "./group-memberships.ts";
import * as GroupFollows from "./group-follows.ts";
import * as ReadStates from "./read-states.ts";
import * as PostgresSignalHub from "./signal-hub.ts";
import * as Binding from "./binding.ts";
import * as Checkpoints from "./checkpoints.ts";
import * as ConnectionCredentials from "./connection-credentials.ts";
import * as SessionLogs from "./session-logs.ts";
import * as SessionStates from "./session-states.ts";
import * as Connections from "./connections.ts";
import * as CredentialKey from "./credential-key.ts";
import * as PostgresDatabase from "./database.ts";
import * as Invitations from "./invitations.ts";
import * as Journal from "./journal.ts";
import * as Members from "./members.ts";
import * as Notifications from "./notifications.ts";
import * as Roles from "./roles.ts";
import * as Workspaces from "./workspaces.ts";

export interface Options extends Binding.Options {
  /**
   * The key that seals connections' credentials at rest: 32 bytes, encoded as base64. Without
   * one, the host stores no credentials, and setting one reports that it cannot.
   */
  readonly credentialKey?: Redacted.Redacted<string> | undefined;
}

/**
 * Provide every store core requires, and the signal hub, over the same workspace binding.
 * Adding a store adds a line here.
 *
 * @category layers
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
  PostgresSignalHub.layer,
);

/**
 * Provide the stores bound to one workspace over the caller's database.
 *
 * @category layers
 */
export const layerWorkspace = (
  workspaceId: Workspace.Id,
  options: Options = {},
  credentialKey: Option.Option<CredentialKey.Cipher> = Option.none(),
) =>
  layerStores.pipe(
    Layer.provide(
      Layer.mergeAll(Binding.layer(workspaceId, options), CredentialKey.layer(credentialKey)),
    ),
  );

/**
 * One pool, with inexpensive workspace-bound views over it. The stores hold no
 * resources, so the scope that builds them can close at once.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresWorkspaceStorage.make")(function* (options: Options = {}) {
  // Invalid options stop the host starting, rather than its first workspace.
  yield* Binding.settings(options);
  const credentialKey =
    options.credentialKey === undefined
      ? Option.none()
      : Option.some(yield* Effect.orDie(CredentialKey.make(options.credentialKey)));
  const postgresDatabase = yield* PostgresDatabase.PostgresDatabase;
  const forWorkspace: WorkspaceStorage.WorkspaceStorage["Service"]["forWorkspace"] = Effect.fn(
    "PostgresWorkspaceStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(layerWorkspace(workspaceId, options, credentialKey)));
    },
    Effect.provideService(PostgresDatabase.PostgresDatabase, postgresDatabase),
  );
  return WorkspaceStorage.WorkspaceStorage.of({ forWorkspace });
});

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 */
export const layer = (options: Options = {}) =>
  Layer.effect(WorkspaceStorage.WorkspaceStorage, make(options));
