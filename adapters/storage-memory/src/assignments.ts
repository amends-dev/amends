import { Assignment, AssignmentStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Assignment.Record));
const rows = Rows.make(Schema.fromJsonString(Assignment.Record));

/**
 * Access assigned to memberships, by role or directly; revoked rows keep their source.
 *
 * @category constructors
 */
export const make = Effect.fn("Assignments.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const select = (operation: string, predicate: (record: Assignment.Record) => boolean) =>
    Effect.flatMap(read, (space) => rows.all(space.records.assignments)).pipe(
      Effect.map((records) => records.filter(predicate)),
      Effect.mapError(storeFailure(AssignmentStore, operation)),
    );
  return AssignmentStore.Service.of({
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.assignments, id)).pipe(
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
          record.source._tag === "Role" &&
          record.source.roleId === roleId,
      ),
    insert: Effect.fn("Assignments.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(AssignmentStore, "insert")),
      );
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new AssignmentStore.Conflict({
          operation: "insert",
          message: "Expected an active assignment in this workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(AssignmentStore, "insert")));
      if (space.records.assignments.has(record.id))
        return yield* new AssignmentStore.Conflict({
          operation: "insert",
          message: "Assignment ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AssignmentStore, "insert")));
      space.records.assignments.set(record.id, row);
    }),
    markRevoked: Effect.fn("Assignments.markRevoked")(function* (id) {
      yield* Store.Transaction;
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(AssignmentStore, "markRevoked")),
      );
      const current = yield* rows
        .get(space.records.assignments, id)
        .pipe(Effect.mapError(storeFailure(AssignmentStore, "markRevoked")));
      if (Option.isNone(current) || current.value.status !== "active")
        return yield* new AssignmentStore.Conflict({
          operation: "markRevoked",
          message: "Expected an active assignment",
        });
      const row = yield* rows
        .encode({ ...current.value, status: "revoked" })
        .pipe(Effect.mapError(storeFailure(AssignmentStore, "markRevoked")));
      space.records.assignments.set(id, row);
    }),
  });
});

/**
 * Provide AssignmentStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(AssignmentStore.Service, make());

export * as Assignments from "./assignments.ts";
