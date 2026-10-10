import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Identity } from "../../identity/identity.ts";
import type { Store } from "../../journal/store.ts";

import type { Invitation } from "./invitation.ts";

export class Failure extends Schema.TaggedError<Failure>()("InvitationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("InvitationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Workspace-bound read model. All writes share the journal's native transaction. */
export interface Interface {
  /** Return an isolated record from the current transaction or committed state. */
  readonly get: (id: Invitation.Id) => Effect.Effect<Option.Option<Invitation.Record>, Failure>;
  /** All Pending invitations for this human in this workspace, including expired ones. */
  readonly listPendingByRecipient: (
    recipientId: Identity.HumanId,
  ) => Effect.Effect<ReadonlyArray<Invitation.Record>, Failure>;
  /** Every invitation in this workspace in issue order, whatever its state. */
  readonly list: Effect.Effect<ReadonlyArray<Invitation.Record>, Failure>;
  /** Insert a valid Pending invitation with a fresh ID in this workspace; invalid records and duplicate IDs conflict. Never upsert. */
  readonly insert: (
    record: Invitation.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Transition Pending to a terminal state; reject absent/terminal records and retain all intent. */
  readonly settle: (
    id: Invitation.Id,
    state: Exclude<Invitation.State, { readonly _tag: "Pending" }>,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/workspace/invitation-store/Service",
) {}

export * as InvitationStore from "./store.ts";
