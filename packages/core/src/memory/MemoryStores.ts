/**
 * Every store core requires, and the signal hub, merged over one workspace binding. `layer` is
 * what a host builds for each workspace it opens: the gateway's memory workspace storage builds
 * it over the host's `MemoryConnection`, and core's tests build it the same way. Adding a store
 * adds a line to `layerStores`.
 *
 * @since 0.1.0
 */
import type { Workspace } from "../workspace/index.ts";
import { Layer } from "effect";
import * as Agents from "./Agents.ts";
import * as Assignments from "./Assignments.ts";
import * as Binding from "./Binding.ts";
import * as ChannelBindings from "./ChannelBindings.ts";
import * as Channels from "./Channels.ts";
import * as Checkpoints from "./Checkpoints.ts";
import * as ConnectionCredentials from "./ConnectionCredentials.ts";
import * as Connections from "./Connections.ts";
import * as Contacts from "./Contacts.ts";
import * as Deliveries from "./Deliveries.ts";
import * as GroupFollows from "./GroupFollows.ts";
import * as GroupMemberships from "./GroupMemberships.ts";
import * as Groups from "./Groups.ts";
import * as Invitations from "./Invitations.ts";
import * as Journal from "./Journal.ts";
import * as Members from "./Members.ts";
import * as Notifications from "./Notifications.ts";
import * as ReadStates from "./ReadStates.ts";
import * as Roles from "./Roles.ts";
import * as SessionLogs from "./SessionLogs.ts";
import * as SessionStates from "./SessionStates.ts";
import * as MemorySignalHub from "./MemorySignalHub.ts";
import * as Tasks from "./Tasks.ts";
import * as ThreadActivities from "./ThreadActivities.ts";
import * as ThreadMessages from "./ThreadMessages.ts";
import * as ThreadParticipations from "./ThreadParticipations.ts";
import * as Threads from "./Threads.ts";
import * as TurnRecords from "./TurnRecords.ts";
import * as Workspaces from "./Workspaces.ts";

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
 * @since 0.1.0
 */
export const layer = (workspaceId: Workspace.Id) =>
  layerStores.pipe(Layer.provide(Binding.layer(workspaceId)));
