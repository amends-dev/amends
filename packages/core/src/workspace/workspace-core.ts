import { Layer } from "effect";
import { AssignmentProjection } from "../authorization/assignment-projection.ts";
import { Authorization } from "../authorization/authorization.ts";
import { GrantResolver } from "../authorization/grant-resolver.ts";
import { PermissionCatalog } from "../authorization/permission-catalog.ts";
import { RoleProjection } from "../authorization/role-projection.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import { MemberApplication } from "./member-application.ts";
import { MemberPermissions } from "./member-permissions.ts";
import { MemberProjection } from "./member-projection.ts";
import { WorkspaceInitialization } from "./workspace-initialization.ts";
import { InvitationApplication } from "./invitation-application.ts";
import { InvitationPermissions } from "./invitation-permissions.ts";
import { InvitationJournal } from "./invitation-journal.ts";

/** Hosts bind storage to a workspace; core owns its permission and projection registrations. */
const journal = Journal.layer({
  logId: Log.Id.make("journal"),
  projections: [
    WorkspaceInitialization.projection,
    MemberProjection.definition,
    RoleProjection.definition,
    AssignmentProjection.definition,
    InvitationJournal.projection,
  ],
}).pipe(Layer.provideMerge(Log.layer));
const authorization = Authorization.layer.pipe(Layer.provide(GrantResolver.layer));

export const layer = Layer.mergeAll(MemberApplication.layer, InvitationApplication.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(journal, authorization)),
  Layer.provide(
    PermissionCatalog.layer([
      MemberPermissions.Read,
      MemberPermissions.Remove,
      InvitationPermissions.Manage,
    ]),
  ),
);

export * as WorkspaceCore from "./workspace-core.ts";
