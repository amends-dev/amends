/**
 * The storage contract for assignments, which every storage adapter implements and
 * `AssignmentProjection` writes. `GrantResolver` reads a member's active assignments,
 * `OwnershipService` the Owner role's, and `AssignmentService` one by ID. Reads honor the caller's
 * transaction when there is one; writes require it. The store checks what it is given and
 * authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as Member from "../workspace/Member.ts";
import * as Assignment from "./Assignment.ts";
import * as Role from "./Role.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import { storeFailure } from "../journal/internal/storeFailure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing assignments.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("AssignmentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, or a missing
 * or already revoked assignment.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("AssignmentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The assignment store, bound to one workspace by the host.
 *
 * Host-owned assignment read model for one workspace. Reads use the current host
 * transaction when present, including its staged writes; otherwise committed
 * state. Isolate stored inputs and returned arrays and records from caller mutation.
 * List reads return every match exactly once, with unspecified ordering.
 *
 * Projection writes enlist in the same native transaction as journal entries and
 * checkpoints. List reads participate in its serializable view, including concurrent
 * inserts and revocations. Enforce constraints atomically across concurrent writers.
 * Reject expired or foreign transaction handles and never retry the program internally.
 * Membership, role ownership, permission compatibility, and grant authority are
 * checked by services before publication.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class AssignmentStore extends Context.Service<
  AssignmentStore,
  {
    /** Find an active or revoked assignment in this workspace; None if absent. */
    readonly get: (
      assignmentId: Assignment.Id,
    ) => Effect.Effect<Option.Option<Assignment.Assignment>, Failure>;

    /** All active role and direct grant assignments for this member in this workspace. */
    readonly listActiveByMember: (
      memberId: Member.Id,
    ) => Effect.Effect<ReadonlyArray<Assignment.Assignment>, Failure>;

    /** All active Role-source assignments referencing this role in this workspace. */
    readonly listActiveByRole: (
      roleId: Role.Id,
    ) => Effect.Effect<ReadonlyArray<Assignment.Assignment>, Failure>;

    /**
     * Insert an active assignment. Fail with Conflict for a reused assignment ID, including
     * revoked IDs. Overlapping grants remain separate assignments. Never upsert.
     */
    readonly insert: (
      record: Assignment.Assignment,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

    /**
     * Change an active assignment to revoked, retaining its ID, workspace, member,
     * and source. Fail with Conflict if absent or already revoked. Assigning access
     * again requires a fresh ID.
     */
    readonly markRevoked: (
      assignmentId: Assignment.Id,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/authorization/AssignmentStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: AssignmentStore["Service"],
): AssignmentStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (assignmentId) => Effect.flatMap(read("get", Assignment.Id, assignmentId), driver.get),
    listActiveByMember: (memberId) =>
      Effect.flatMap(read("listActiveByMember", Member.Id, memberId), driver.listActiveByMember),
    listActiveByRole: (roleId) =>
      Effect.flatMap(read("listActiveByRole", Role.Id, roleId), driver.listActiveByRole),
    insert: (record) =>
      write("insert", Assignment.Assignment, record).pipe(
        Effect.filterOrFail(
          (record) => record.status === "active",
          () => new Conflict({ operation: "insert", message: "Expected an active assignment" }),
        ),
        Effect.flatMap(driver.insert),
      ),
    markRevoked: (assignmentId) =>
      Effect.flatMap(write("markRevoked", Assignment.Id, assignmentId), driver.markRevoked),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Assignment.Assignment));

/**
 * Access assigned to memberships, by role or directly; revoked rows keep their source.
 */
const makeMemory = Effect.fn("AssignmentStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const select = (operation: string, predicate: (record: Assignment.Assignment) => boolean) =>
    Effect.flatMap(read, (space) => rows.all(space.records.of("assignments"))).pipe(
      Effect.map((records) => records.filter(predicate)),
      Effect.mapError(storeFailure(Failure, operation)),
    );
  const driver: AssignmentStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("assignments"), id)).pipe(
        Effect.mapError(storeFailure(Failure, "get")),
      ),
    listActiveByMember: (memberId) =>
      select(
        "listActiveByMember",
        (record) => record.status === "active" && record.memberId === memberId,
      ),
    listActiveByRole: (roleId) =>
      select(
        "listActiveByRole",
        (record) =>
          record.status === "active" &&
          Assignment.Source.isAnyOf(["Role"])(record.source) &&
          record.source.roleId === roleId,
      ),
    insert: Effect.fn("AssignmentStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("assignments").has(record.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Assignment ID already exists",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("assignments").set(record.id, row);
    }),
    markRevoked: Effect.fn("AssignmentStore.memory.markRevoked")(function* (id) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "markRevoked")));
      const current = yield* rows
        .get(space.records.of("assignments"), id)
        .pipe(Effect.mapError(storeFailure(Failure, "markRevoked")));
      if (Option.isNone(current) || current.value.status !== "active")
        return yield* new Conflict({
          operation: "markRevoked",
          message: "Expected an active assignment",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "revoked" })
        .pipe(Effect.mapError(storeFailure(Failure, "markRevoked")));
      space.records.of("assignments").set(id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `AssignmentStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID conflicts, and revoking conflicts unless the
 * assignment is stored and active. A revoked assignment keeps its row and its source. `make` checks
 * every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(AssignmentStore, makeMemory());
