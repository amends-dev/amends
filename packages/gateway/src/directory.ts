import type { Identity } from "@amends/core/identity";
import { Invitation, Member, Workspace } from "@amends/core/workspace";
import { Context, Schema } from "effect";
import type { Effect } from "effect";

/** One identity's membership of one workspace, with that workspace's active member count. */
export const Membership = Schema.Struct({
  workspace: Workspace.Record,
  member: Member.Record,
  people: Schema.Int,
});
export interface Membership extends Schema.Schema.Type<typeof Membership> {}

/** Everything an identity can reach: active and removed memberships, and pending invitations. */
export const Listing = Schema.Struct({
  memberships: Schema.Array(Membership),
  invitations: Schema.Array(Invitation.Record),
});
export interface Listing extends Schema.Schema.Type<typeof Listing> {}

export interface Interface {
  /**
   * Hosts route workspaces; this is one identity's routing table, read from
   * host-owned indexes across workspaces. Removed memberships stay listed so a
   * client can explain them. Invitations are listed for humans only.
   */
  readonly list: (identity: Identity.Reference) => Effect.Effect<Listing>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/directory/Service",
) {}

export * as WorkspaceDirectory from "./directory.ts";
