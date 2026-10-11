import type { Workspace } from "../workspace/index.ts";
import { Layer } from "effect";
import * as Agents from "./agents.ts";
import * as Assignments from "./assignments.ts";
import * as Binding from "./binding.ts";
import * as ChannelBindings from "./channel-bindings.ts";
import * as Channels from "./channels.ts";
import * as Checkpoints from "./checkpoints.ts";
import * as ConnectionCredentials from "./connection-credentials.ts";
import * as Connections from "./connections.ts";
import * as Contacts from "./contacts.ts";
import * as Deliveries from "./deliveries.ts";
import * as GroupFollows from "./group-follows.ts";
import * as GroupMemberships from "./group-memberships.ts";
import * as Groups from "./groups.ts";
import * as Invitations from "./invitations.ts";
import * as Journal from "./journal.ts";
import * as Members from "./members.ts";
import * as Notifications from "./notifications.ts";
import * as ReadStates from "./read-states.ts";
import * as Roles from "./roles.ts";
import * as SessionLogs from "./session-logs.ts";
import * as SessionStates from "./session-states.ts";
import * as MemorySignalHub from "./signal-hub.ts";
import * as Tasks from "./tasks.ts";
import * as ThreadActivities from "./thread-activities.ts";
import * as ThreadMessages from "./thread-messages.ts";
import * as ThreadParticipations from "./thread-participations.ts";
import * as Threads from "./threads.ts";
import * as TurnRecords from "./turn-records.ts";
import * as Workspaces from "./workspaces.ts";

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
