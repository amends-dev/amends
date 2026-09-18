import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { InvitationsGroup } from "./invitations.ts";
import { MeGroup } from "./me.ts";
import { MembersGroup } from "./members.ts";
import { SessionGroup } from "./session.ts";
import { WorkspacesGroup } from "./workspaces.ts";

/** The public HTTP contract. Servers implement its groups; clients are generated from it. */
export class Api extends HttpApi.make("amends")
  .add(SessionGroup)
  .add(MeGroup)
  .add(WorkspacesGroup)
  .add(MembersGroup)
  .add(InvitationsGroup)
  .annotateMerge(OpenApi.annotations({ title: "Amends API" })) {}
