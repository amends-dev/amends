import { HttpApi, OpenApi } from "effect/http-api";
import { InvitationsGroup } from "./invitations.ts";
import { AssignmentsGroup } from "./assignments.ts";
import { MeGroup } from "./me.ts";
import { MembersGroup } from "./members.ts";
import { NotificationsGroup } from "./notifications.ts";
import { SessionGroup } from "./session.ts";
import { WorkspacesGroup } from "./workspaces.ts";
import { ChangeFeedGroup } from "./change-feed.ts";
import { AgentsV2Group } from "./agents-v2.ts";
import { ConnectionsV2Group } from "./connections-v2.ts";
import { GroupsGroup } from "./groups.ts";
import { ThreadsGroup } from "./threads.ts";
import { TurnsGroup } from "./turns.ts";

/** The public HTTP contract. Servers implement its groups; clients are generated from it. */
export class Api extends HttpApi.make("amends")
  .add(SessionGroup)
  .add(MeGroup)
  .add(WorkspacesGroup)
  .add(MembersGroup)
  .add(InvitationsGroup)
  .add(AssignmentsGroup)
  .add(GroupsGroup)
  .add(ThreadsGroup)
  .add(NotificationsGroup)
  .add(ConnectionsV2Group)
  .add(AgentsV2Group)
  .add(TurnsGroup)
  .add(ChangeFeedGroup)
  .annotateMerge(OpenApi.annotations({ title: "Amends API" })) {}
