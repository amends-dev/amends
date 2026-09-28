import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { InvitationsGroup } from "./invitations.ts";
import { AssignmentsGroup } from "./assignments.ts";
import { MeGroup } from "./me.ts";
import { MembersGroup } from "./members.ts";
import { NotificationsGroup } from "./notifications.ts";
import { SessionGroup } from "./session.ts";
import { WorkspacesGroup } from "./workspaces.ts";
import { ChangesGroup } from "./changes.ts";
import { ConnectionsGroup } from "./connections.ts";
import { GroupsGroup } from "./groups.ts";
import { ThreadsGroup } from "./threads.ts";

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
  .add(ConnectionsGroup)
  .add(ChangesGroup)
  .annotateMerge(OpenApi.annotations({ title: "Amends API" })) {}
