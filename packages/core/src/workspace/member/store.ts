import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Identity } from "../../identity/identity.ts";
import type { Store } from "../../journal/store.ts";
import type { Member } from "./member.ts";

export class Failure extends Schema.TaggedError<Failure>()("MemberStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("MemberStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Host-owned membership read model for one workspace. Reads use the current host
 * transaction when present, including its staged writes; otherwise committed
 * state. Returned records must be isolated from caller mutation.
 *
 * Projection writes enlist in the same native transaction as journal entries and
 * checkpoints. Enforce constraints atomically across concurrent writers. Reject
 * expired or foreign transaction handles and never retry the program internally.
 */
export interface Interface {
  /** Find an active or removed membership in this workspace; None if absent. */
  readonly get: (memberId: Member.Id) => Effect.Effect<Option.Option<Member.Record>, Failure>;

  /**
   * Find several active or removed memberships in one read. Absent IDs are omitted and each found
   * record appears once; order is unspecified, so callers index results by ID. An empty request
   * reads nothing.
   */
  readonly getMany: (
    memberIds: ReadonlyArray<Member.Id>,
  ) => Effect.Effect<ReadonlyArray<Member.Record>, Failure>;

  /** Match both the identity kind and ID, returning only an active membership. */
  readonly findActive: (
    identity: Identity.MemberReference,
  ) => Effect.Effect<Option.Option<Member.Record>, Failure>;

  /** Every membership in this workspace, active and removed, in a stable order. */
  readonly list: Effect.Effect<ReadonlyArray<Member.Record>, Failure>;

  /**
   * Insert an active record belonging to this workspace. Fail with Conflict for a
   * schema violation, workspace mismatch, inactive record, reused member ID (including removed
   * memberships), or an identity with an existing active membership. Never upsert.
   */
  readonly insert: (
    record: Member.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

  /**
   * Projection write that sets an active membership's name. Fail with Conflict if absent or
   * removed; the same name again changes nothing.
   */
  readonly rename: (
    memberId: Member.Id,
    name: Member.Name,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

  /**
   * Change an active membership to removed, retaining its ID, workspace, and
   * identity. Fail with Conflict if absent or already removed. A later admission
   * for this identity must use a fresh member ID.
   */
  readonly markRemoved: (
    memberId: Member.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/member-store/Service",
) {}

export * as MemberStore from "./store.ts";
