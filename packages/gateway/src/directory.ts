import type { Identity } from "@amends-dev/core/identity";
import { Invitation, Member, Workspace } from "@amends-dev/core/workspace";
import { Context, Schema } from "effect";
import type { Effect } from "effect";

/** One identity's membership of one workspace, with that workspace's active member count. */
export const Membership = Schema.Struct({
  workspace: Workspace.Record,
  member: Member.Record,
  /** Active human and agent memberships; JSON retains the existing people field. */
  activeMemberCount: Schema.Natural,
})
  .pipe(Schema.encodeKeys({ activeMemberCount: "people" }))
  .annotate({ identifier: "WorkspaceDirectoryMembership" });
export interface Membership extends Schema.Schema.Type<typeof Membership> {}

export const PendingInvitation = Invitation.Record.pipe(
  Schema.fieldsAssign({ workspaceName: Schema.optionalKey(Workspace.Name) }),
);

/** Everything an identity can reach: active and removed memberships, and pending invitations. */
export const Listing = Schema.Struct({
  memberships: Schema.Array(Membership),
  invitations: Schema.Array(PendingInvitation),
}).annotate({ identifier: "WorkspaceDirectoryListing" });
export interface Listing extends Schema.Schema.Type<typeof Listing> {}

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
