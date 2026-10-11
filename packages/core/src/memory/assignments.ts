import { Assignment, AssignmentStore } from "../authorization/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./binding.ts";
import { storeFailure } from "./errors.ts";
import * as Rows from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Assignment.Record));

/**
 * Access assigned to memberships, by role or directly; revoked rows keep their source.
 *
 * @category constructors
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
 * Provide AssignmentStore.AssignmentStore using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(AssignmentStore.AssignmentStore, make());
