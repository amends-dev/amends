/**
 * Compose one workspace's core from its domains. Hosts bind storage to a
 * workspace and supply cryptography; a gateway resolves the acting member and
 * runs the application operations.
 */
import { Layer } from "effect";
import * as Authorization from "./authorization/index.ts";
import * as Journal from "./journal/index.ts";
import * as Workspace from "./workspace/index.ts";

/** Projections registered for journal publication, applied in this order. */
const projections = [
  Workspace.WorkspaceInitialization.projection,
  Workspace.MemberProjection.definition,
  Authorization.RoleProjection.definition,
  Authorization.AssignmentProjection.definition,
  Workspace.InvitationJournal.projection,
] as const;

/** Permissions the domains declare; requirements and grants must name one of these. */
const permissions = [
  Workspace.MemberPermissions.Read,
  Workspace.MemberPermissions.Remove,
  Workspace.InvitationPermissions.Manage,
];

/** The domain journal and its log, over host storage. */
const journal = Journal.Journal.layer({ logId: Journal.Log.Id.make("journal"), projections }).pipe(
  Layer.provideMerge(Journal.Log.layer),
);

/** Authorization for the acting member, with its grant resolution. */
const authorization = Authorization.Authorization.layer.pipe(
  Layer.provide(Authorization.GrantResolver.layer),
);

/**
 * Application operations, sharing one journal and one authorization check. These
 * are what hosts and protocols call; stores and the journal stay internal.
 */
const operations = Layer.mergeAll(
  Workspace.MemberApplication.layer,
  Workspace.InvitationApplication.layer,
);

/**
 * Complete core for one workspace: application operations over the journal,
 * authorization, and the permission catalog.
 *
 * @category layers
 */
export const layer = operations.pipe(
  Layer.provideMerge(Layer.mergeAll(journal, authorization)),
  Layer.provide(Authorization.PermissionCatalog.layer(permissions)),
);

/**
 * Host-provided dependencies derived from the layer: workspace-bound stores,
 * the checkpoint store, and cryptography. Adding a required store changes this
 * type and makes incomplete host compositions fail type checking.
 *
 * @category models
 */
export type HostServices = Layer.Services<typeof layer>;

/**
 * The application services a host runs for an actor. Programs a gateway
 * accepts may require only these, so they cannot bypass the membership and
 * permission checks each operation performs.
 *
 * @category models
 */
export type Operations = Layer.Success<typeof operations>;
