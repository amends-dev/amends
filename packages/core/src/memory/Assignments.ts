/**
 * The memory implementation of `AssignmentStore` from `../authorization/AssignmentStore.ts`, over
 * the workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts,
 * and revoking conflicts unless the assignment is stored and active. A revoked assignment keeps
 * its row and its source. `AssignmentStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Assignment, AssignmentStore } from "../authorization/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Assignment.Record));

/**
 * Access assigned to memberships, by role or directly; revoked rows keep their source.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Assignments.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const select = (operation: string, predicate: (record: Assignment.Record) => boolean) =>
    Effect.flatMap(read, (space) => rows.all(space.records.of("assignments"))).pipe(
      Effect.map((records) => records.filter(predicate)),
      Effect.mapError(storeFailure(AssignmentStore, operation)),
    );
  const driver: AssignmentStore.AssignmentStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("assignments"), id)).pipe(
        Effect.mapError(storeFailure(AssignmentStore, "get")),
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
    insert: Effect.fn("Assignments.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(AssignmentStore, "insert")));
      if (space.records.of("assignments").has(record.id))
        return yield* new AssignmentStore.Conflict({
          operation: "insert",
          message: "Assignment ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AssignmentStore, "insert")));
      space.records.of("assignments").set(record.id, row);
    }),
    markRevoked: Effect.fn("Assignments.markRevoked")(function* (id) {
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(AssignmentStore, "markRevoked")),
      );
      const current = yield* rows
        .get(space.records.of("assignments"), id)
        .pipe(Effect.mapError(storeFailure(AssignmentStore, "markRevoked")));
      if (Option.isNone(current) || current.value.status !== "active")
        return yield* new AssignmentStore.Conflict({
          operation: "markRevoked",
          message: "Expected an active assignment",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "revoked" })
        .pipe(Effect.mapError(storeFailure(AssignmentStore, "markRevoked")));
      space.records.of("assignments").set(id, row);
    }),
  };
  return AssignmentStore.make(workspaceId, driver);
});

/**
 * Provide assignment storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(AssignmentStore.AssignmentStore, make());
