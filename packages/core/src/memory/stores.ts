import type { Workspace } from "../workspace/index.ts";
import { Layer } from "effect";
import { Agents } from "./agents.ts";
import { Assignments } from "./assignments.ts";
import { Binding } from "./binding.ts";
import { ChannelBindings } from "./channel-bindings.ts";
import { Channels } from "./channels.ts";
import { Checkpoints } from "./checkpoints.ts";
import { ConnectionCredentials } from "./connection-credentials.ts";
import { Connections } from "./connections.ts";
import { Contacts } from "./contacts.ts";
import { Deliveries } from "./deliveries.ts";
import { GroupFollows } from "./group-follows.ts";
import { GroupMemberships } from "./group-memberships.ts";
import { Groups } from "./groups.ts";
import { Invitations } from "./invitations.ts";
import { Journal } from "./journal.ts";
import { Members } from "./members.ts";
import { Notifications } from "./notifications.ts";
import { ReadStates } from "./read-states.ts";
import { Roles } from "./roles.ts";
import { SessionLogs } from "./session-logs.ts";
import { SessionStates } from "./session-states.ts";
import { MemorySignalHub } from "./signal-hub.ts";
import { Tasks } from "./tasks.ts";
import { ThreadActivities } from "./thread-activities.ts";
import { ThreadMessages } from "./thread-messages.ts";
import { ThreadParticipations } from "./thread-participations.ts";
import { Threads } from "./threads.ts";
import { TurnRecords } from "./turn-records.ts";
import { Workspaces } from "./workspaces.ts";

/**
 * Every store core requires, and the signal hub, over the same workspace binding. Adding a store
 * adds a line here.
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
  Agents.layer,
  TurnRecords.layer,
  SessionStates.layer,
  SessionLogs.layer,
  MemorySignalHub.layer,
);

/**
 * Every store core requires, and the signal hub, bound to one workspace over the caller's
 * connection to memory storage. The stores hold no resources, so the scope that builds them can
 * close at once.
 *
 * @category layers
 */
export const layer = (workspaceId: Workspace.Id) =>
  layerStores.pipe(Layer.provide(Binding.layer(workspaceId)));

export * as MemoryStores from "./stores.ts";
