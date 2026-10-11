import { HttpApi, OpenApi } from "effect/http-api";
import { AccountsGroup } from "./AccountsGroup.ts";
import { InvitationsGroup } from "./InvitationsGroup.ts";
import { AssignmentsGroup } from "./AssignmentsGroup.ts";
import { MeGroup } from "./MeGroup.ts";
import { MembersGroup } from "./MembersGroup.ts";
import { NotificationsGroup } from "./NotificationsGroup.ts";
import { SessionGroup } from "./SessionGroup.ts";
import { WorkspacesGroup } from "./WorkspacesGroup.ts";
import { ChangeFeedGroup } from "./ChangeFeedGroup.ts";
import { AgentsGroup } from "./AgentsGroup.ts";
import { ChannelEventsGroup, ChannelsGroup } from "./ChannelsGroup.ts";
import { ConnectionsGroup } from "./ConnectionsGroup.ts";
import { GroupsGroup } from "./GroupsGroup.ts";
import { TasksGroup } from "./TasksGroup.ts";
import { ThreadsGroup } from "./ThreadsGroup.ts";
import { TurnsGroup } from "./TurnsGroup.ts";

/** The public HTTP contract. Servers implement its groups; clients are generated from it. */
export class Api extends HttpApi.make("amends")
  .add(SessionGroup)
  .add(MeGroup)
  .add(AccountsGroup)
  .add(WorkspacesGroup)
  .add(MembersGroup)
  .add(InvitationsGroup)
  .add(AssignmentsGroup)
  .add(GroupsGroup)
  .add(ThreadsGroup)
  .add(TasksGroup)
  .add(NotificationsGroup)
  .add(ConnectionsGroup)
  .add(AgentsGroup)
  .add(TurnsGroup)
  .add(ChannelsGroup)
  .add(ChannelEventsGroup)
  .add(ChangeFeedGroup)
  .annotateMerge(OpenApi.annotations({ title: "Amends API" })) {}
