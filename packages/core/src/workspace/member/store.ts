import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import { Identity } from "../../identity/identity.ts";
import type { Store } from "../../journal/store.ts";
import { Member } from "./member.ts";
import { StoreInput } from "../../journal/StoreInput.ts";
import type { WorkspaceId } from "../id.ts";

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
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
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
   * Insert an active membership. Fail with Conflict for a reused member ID, including removed
   * memberships, or an identity with an existing active membership. Never upsert.
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
  "@amends-dev/core/workspace/member-store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (memberId) => Effect.flatMap(read("get", Member.Id, memberId), driver.get),
    getMany: (memberIds) =>
      Effect.flatMap(read("getMany", Schema.Array(Member.Id), memberIds), driver.getMany),
    findActive: (identity) =>
      Effect.flatMap(read("findActive", Identity.MemberReference, identity), driver.findActive),
    list: driver.list,
    insert: (record) =>
      write("insert", Member.Record, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active",
          () => new Conflict({ operation: "insert", message: "Expected an active member" }),
        ),
        Effect.flatMap(driver.insert),
      ),
    rename: Effect.fn("MemberStore.rename")(function* (memberId, name) {
      return yield* driver.rename(
        yield* write("rename", Member.Id, memberId),
        yield* write("rename", Member.Name, name),
      );
    }),
    markRemoved: (memberId) =>
      Effect.flatMap(write("markRemoved", Member.Id, memberId), driver.markRemoved),
  };
};

export * as MemberStore from "./store.ts";
