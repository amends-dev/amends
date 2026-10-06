import type { Workspace } from "@amends/core/workspace";
import { WorkspaceStorage } from "@amends/gateway";
import { Effect, Layer } from "effect";
import { Agents } from "./agents.ts";
import { AgentsV2 } from "./agents-v2.ts";
import { Assignments } from "./assignments.ts";
import { Binding } from "./binding.ts";
import { Checkpoints } from "./checkpoints.ts";
import { ConnectionCredentials } from "./connection-credentials.ts";
import { Connections } from "./connections.ts";
import { ConnectionV2Credentials } from "./connection-v2-credentials.ts";
import { ConnectionsV2 } from "./connections-v2.ts";
import { Environments } from "./environments.ts";
import { MemoryConnection } from "./connection.ts";
import { GroupFollows } from "./group-follows.ts";
import { GroupMemberships } from "./group-memberships.ts";
import { Groups } from "./groups.ts";
import { Invitations } from "./invitations.ts";
import { Journal } from "./journal.ts";
import { Members } from "./members.ts";
import { Notifications } from "./notifications.ts";
import { ReadStates } from "./read-states.ts";
import { MemorySignalHub } from "./signal-hub.ts";
import { Roles } from "./roles.ts";
import { ThreadActivities } from "./thread-activities.ts";
import { ThreadMessages } from "./thread-messages.ts";
import { ThreadParticipations } from "./thread-participations.ts";
import { Threads } from "./threads.ts";
import { TurnRecords } from "./turn-records.ts";
import { Workspaces } from "./workspaces.ts";

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
  ReadStates.layer,
  Connections.layer,
  ConnectionCredentials.layer,
  ConnectionsV2.layer,
  ConnectionV2Credentials.layer,
  Environments.layer,
  Agents.layer,
  AgentsV2.layer,
  TurnRecords.layer,
  MemorySignalHub.layer,
);

/**
 * Provide the stores bound to one workspace over the caller's connection.
 *
 * @category layers
 */
export const layerWorkspace = (workspaceId: Workspace.Id) =>
  layerStores.pipe(Layer.provide(Binding.layer(workspaceId)));

/**
 * One connection, with inexpensive workspace-bound views over it. The stores
 * hold no resources, so the scope that builds them can close at once.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryStorage.make")(function* () {
  const memoryConnection = yield* MemoryConnection.Service;
  const forWorkspace: WorkspaceStorage.Interface["forWorkspace"] = Effect.fn(
    "MemoryStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(layerWorkspace(workspaceId)));
    },
    Effect.provideService(MemoryConnection.Service, memoryConnection),
  );
  return WorkspaceStorage.Service.of({ forWorkspace });
});

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStorage.Service, make());

export * as MemoryStorage from "./storage.ts";
