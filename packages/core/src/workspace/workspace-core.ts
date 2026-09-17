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

/** Hosts bind storage to a workspace; core owns its permission and projection registrations. */
const journal = Journal.layer({
  logId: Log.Id.make("journal"),
  projections: [
    WorkspaceInitialization.projection,
    MemberProjection.definition,
    RoleProjection.definition,
    AssignmentProjection.definition,
  ],
}).pipe(Layer.provideMerge(Log.layer));
const authorization = Authorization.layer.pipe(
  Layer.provide(GrantResolver.layer),
  Layer.provide(PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove])),
);

export const layer = MemberApplication.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(journal, authorization)),
);

export * as WorkspaceCore from "./workspace-core.ts";
