/**
 * The storage contract for invitations, which every storage adapter implements and
 * `InvitationProjection` writes. Reads honor the caller's transaction when there is one; writes
 * require it. The store checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as Identity from "../identity/Identity.ts";
import * as Store from "../journal/Store.ts";
import * as Invitation from "./Invitation.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "./WorkspaceId.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing invitations.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("InvitationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused invitation ID, or
 * settling one that is missing or settled already.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("InvitationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The invitation store, bound to one workspace by the host.
 *
 * What a storage adapter implements for invitations. Its writes share the journal's native
 * transaction.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class InvitationStore extends Context.Service<
  InvitationStore,
  {
    /** Return an isolated record from the current transaction or committed state. */
    readonly get: (
      id: Invitation.Id,
    ) => Effect.Effect<Option.Option<Invitation.Invitation>, Failure>;
    /** All Pending invitations for this human in this workspace, including expired ones. */
    readonly listPendingByRecipient: (
      recipientId: Identity.HumanId,
    ) => Effect.Effect<ReadonlyArray<Invitation.Invitation>, Failure>;
    /** Every invitation in this workspace in issue order, whatever its state. */
    readonly list: Effect.Effect<ReadonlyArray<Invitation.Invitation>, Failure>;
    /** Insert a pending invitation; a duplicate ID conflicts. Never upsert. */
    readonly insert: (
      record: Invitation.Invitation,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Move a pending invitation to its terminal state. A missing or settled invitation conflicts;
     * the issuance is retained as it was.
     */
    readonly settle: (
      id: Invitation.Id,
      state: Exclude<Invitation.State, { readonly _tag: "Pending" }>,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/workspace/InvitationStore") {}

/** The states an invitation settles into. */
const Settled = Schema.Union([Invitation.State.cases.Accepted, Invitation.State.cases.Revoked]);

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: InvitationStore["Service"],
): InvitationStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Invitation.Id, id), driver.get),
    listPendingByRecipient: (recipientId) =>
      Effect.flatMap(
        read("listPendingByRecipient", Identity.HumanId, recipientId),
        driver.listPendingByRecipient,
      ),
    list: driver.list,
    insert: (record) =>
      write("insert", Invitation.Invitation, record).pipe(
        Effect.filterOrFail(
          (record) =>
            record.details.workspaceId === workspaceId &&
            Invitation.State.isAnyOf(["Pending"])(record.state),
          () =>
            new Conflict({
              operation: "insert",
              message: "Expected a pending invitation in this workspace",
            }),
        ),
        Effect.flatMap(driver.insert),
      ),
    settle: Effect.fn("InvitationStore.settle")(function* (id, state) {
      return yield* driver.settle(
        yield* write("settle", Invitation.Id, id),
        yield* write("settle", Settled, state),
      );
    }),
  };
};

/**
 * How invitation records are stored: the JSON of each record's encoded form, keyed by its ID.
 */
const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Invitation.Invitation));

/**
 * Issue order: issue time, then ID in binary order. `list` returns a workspace's invitations in
 * it.
 */
const byIssue = (left: Invitation.Invitation, right: Invitation.Invitation) =>
  DateTime.toEpochMillis(left.details.issuedAt) - DateTime.toEpochMillis(right.details.issuedAt) ||
  MemoryDatabase.compareBinary(left.details.id, right.details.id);

/**
 * Invitations and their grants; settlement records who acted and when.
 */
const makeMemory = Effect.fn("InvitationStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const all = (operation: string) =>
    Effect.flatMap(read, (space) => rows.all(space.records.of("invitations"))).pipe(
      Effect.mapError(storeFailure(Failure, operation)),
    );
  const driver: InvitationStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("invitations"), id)).pipe(
        Effect.mapError(storeFailure(Failure, "get")),
      ),
    listPendingByRecipient: (recipientId) =>
      Effect.map(all("listPendingByRecipient"), (records) =>
        records
          .filter(
            (record) =>
              record.details.recipientId === recipientId &&
              Invitation.State.isAnyOf(["Pending"])(record.state),
          )
          .toSorted((left, right) =>
            MemoryDatabase.compareBinary(left.details.id, right.details.id),
          ),
      ),
    list: Effect.map(all("list"), (records) => records.toSorted(byIssue)),
    insert: Effect.fn("InvitationStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("invitations").has(record.details.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Invitation ID already exists",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("invitations").set(record.details.id, row);
    }),
    settle: Effect.fn("InvitationStore.memory.settle")(function* (id, state) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "settle")));
      const current = yield* rows
        .get(space.records.of("invitations"), id)
        .pipe(Effect.mapError(storeFailure(Failure, "settle")));
      if (Option.isNone(current) || !Invitation.State.isAnyOf(["Pending"])(current.value.state))
        return yield* new Conflict({
          operation: "settle",
          message: "Expected a pending invitation",
        });
      const row = yield* rows
        .encode({ ...current.value, state })
        .pipe(Effect.mapError(storeFailure(Failure, "settle")));
      space.records.of("invitations").set(id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `InvitationStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID conflicts, and settling conflicts unless the
 * invitation is stored and pending. A settled invitation keeps its row, with who acted and when.
 * `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(InvitationStore, makeMemory());
