/**
 * One identity's routing table across a host's workspaces: its memberships, ended ones included,
 * and its pending invitations. Reading it spans workspaces, which core never does, so storage
 * adapters implement it over what they store, `MemoryDirectory` in process memory. server-http
 * serves it at `GET /me/workspaces`, and the HTTP contract imports its schemas from
 * `@amends-dev/gateway/WorkspaceDirectory`.
 *
 * @since 0.1.0
 */
import type { Identity } from "@amends-dev/core/identity";
import { Invitation, Member, Workspace } from "@amends-dev/core/workspace";
import { Context, Schema } from "effect";
import type { Effect } from "effect";

/**
 * One identity's membership of one workspace, with that workspace's active member count.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Membership = Schema.Struct({
  workspace: Workspace.Workspace,
  member: Member.Member,
  /** The workspace's active human and agent memberships, encoded as `people`. */
  activeMemberCount: Schema.Natural,
})
  .pipe(Schema.encodeKeys({ activeMemberCount: "people" }))
  .annotate({ identifier: "WorkspaceDirectoryMembership" });
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Membership extends Schema.Schema.Type<typeof Membership> {}

/**
 * An invitation still open to the identity, with its workspace's name when the directory finds
 * the workspace's record.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PendingInvitation = Invitation.Invitation.pipe(
  Schema.fieldsAssign({ workspaceName: Schema.optionalKey(Workspace.Name) }),
);

/**
 * Everything an identity can reach: active and removed memberships, and pending invitations.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Listing = Schema.Struct({
  memberships: Schema.Array(Membership),
  invitations: Schema.Array(PendingInvitation),
}).annotate({ identifier: "WorkspaceDirectoryListing" });
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Listing extends Schema.Schema.Type<typeof Listing> {}

/**
 * The directory of a host's workspaces, which lists what one identity can reach across them.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceDirectory extends Context.Service<
  WorkspaceDirectory,
  {
    /**
     * Hosts route workspaces; this is one identity's routing table, read from
     * host-owned indexes across workspaces. Removed memberships stay listed so a
     * client can explain them. Invitations are listed for humans only.
     */
    readonly list: (identity: Identity.MemberReference) => Effect.Effect<Listing>;
  }
>()("@amends-dev/gateway/directory/Service") {}
