import { Threads } from "./threads.ts";
import { ThreadParticipations } from "./thread-participations.ts";
import { ThreadMessages } from "./thread-messages.ts";
import { ThreadActivities } from "./thread-activities.ts";
import { Tasks } from "./tasks.ts";
import { Channels } from "./channels.ts";
import { ChannelBindings } from "./channel-bindings.ts";
import { Contacts } from "./contacts.ts";
import { Deliveries } from "./deliveries.ts";
import type { Workspace } from "@amends/core/workspace";
import { WorkspaceStorage } from "@amends/gateway";
import { Effect, Layer, Option } from "effect";
import type { Redacted } from "effect";
import { Agents } from "./agents.ts";
import { TurnRecords } from "./turn-records.ts";
import { Assignments } from "./assignments.ts";
import { Groups } from "./groups.ts";
import { GroupMemberships } from "./group-memberships.ts";
import { GroupFollows } from "./group-follows.ts";
import { ReadStates } from "./read-states.ts";
import { PostgresSignalHub } from "./signal-hub.ts";
import { Binding } from "./binding.ts";
import { Checkpoints } from "./checkpoints.ts";
import { ConnectionCredentials } from "./connection-credentials.ts";
import { SessionLogs } from "./session-logs.ts";
import { SessionStates } from "./session-states.ts";
import { Connections } from "./connections.ts";
import { CredentialKey } from "./credential-key.ts";
import { PostgresDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
import { Journal } from "./journal.ts";
import { Members } from "./members.ts";
import { Notifications } from "./notifications.ts";
import { Roles } from "./roles.ts";
import { Workspaces } from "./workspaces.ts";

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
  credentialKey: Option.Option<CredentialKey.Interface> = Option.none(),
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
export const make = Effect.fn("PostgresStorage.make")(function* (options: Options = {}) {
  // Invalid options stop the host starting, rather than its first workspace.
  yield* Binding.settings(options);
  const credentialKey =
    options.credentialKey === undefined
      ? Option.none()
      : Option.some(yield* Effect.orDie(CredentialKey.make(options.credentialKey)));
  const postgresDatabase = yield* PostgresDatabase.Service;
  const forWorkspace: WorkspaceStorage.Interface["forWorkspace"] = Effect.fn(
    "PostgresStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(layerWorkspace(workspaceId, options, credentialKey)));
    },
    Effect.provideService(PostgresDatabase.Service, postgresDatabase),
  );
  return WorkspaceStorage.Service.of({ forWorkspace });
});

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 */
export const layer = (options: Options = {}) =>
  Layer.effect(WorkspaceStorage.Service, make(options));

export * as PostgresStorage from "./storage.ts";
