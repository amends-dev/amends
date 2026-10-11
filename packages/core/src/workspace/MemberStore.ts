/**
 * The storage contract for memberships, which every storage adapter implements and
 * `MemberProjection` writes. Reads honor the caller's transaction when there is one; writes require
 * it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import * as Identity from "../identity/Identity.ts";
import type * as Store from "../journal/Store.ts";
import * as Member from "./Member.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "./WorkspaceId.ts";

/**
 * Storage failed while reading or writing memberships.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("MemberStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused member ID, a
 * second active membership for one identity, or a membership that is missing or removed.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("MemberStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The membership store, bound to one workspace by the host.
 *
 * What a storage adapter implements for memberships. Reads use the current transaction when there
 * is one, including its staged writes, and committed state otherwise, and return records isolated
 * from the caller's mutation. Projection writes enlist in the same native transaction as journal
 * entries and checkpoints, enforce their constraints atomically across concurrent writers, reject
 * expired or foreign transaction handles, and never retry internally.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class MemberStore extends Context.Service<
  MemberStore,
  {
    /** Find an active or removed membership in this workspace; None if absent. */
    readonly get: (memberId: Member.Id) => Effect.Effect<Option.Option<Member.Member>, Failure>;

    /**
     * Find several active or removed memberships in one read. Absent IDs are omitted and each found
     * record appears once; order is unspecified, so callers index results by ID. An empty request
     * reads nothing.
     */
    readonly getMany: (
      memberIds: ReadonlyArray<Member.Id>,
    ) => Effect.Effect<ReadonlyArray<Member.Member>, Failure>;

    /** Match both the identity kind and ID, returning only an active membership. */
    readonly findActive: (
      identity: Identity.MemberReference,
    ) => Effect.Effect<Option.Option<Member.Member>, Failure>;

    /** Every membership in this workspace, active and removed, in a stable order. */
    readonly list: Effect.Effect<ReadonlyArray<Member.Member>, Failure>;

    /**
     * Insert an active membership. Fail with Conflict for a reused member ID, including removed
     * memberships, or an identity with an existing active membership. Never upsert.
     */
    readonly insert: (
      record: Member.Member,
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
>()("@amends-dev/core/workspace/member-store/Service") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: MemberStore["Service"],
): MemberStore["Service"] => {
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
      write("insert", Member.Member, record).pipe(
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
