import { Assignment, AssignmentStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { Array, Effect, Layer, Schema } from "effect";
import type { Statement } from "effect/unstable/sql";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { recordColumn } from "./record-column.ts";

const codec = Schema.fromJsonString(Assignment.Record);
const decode = recordColumn(codec);
const encode = Schema.encodeEffect(codec);

/** Access assigned to memberships, by role or directly; revoked rows keep their source. */
export const make = Effect.fn("Assignments.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const select = (operation: string, query: Statement.Statement<unknown>) =>
    guard(query).pipe(
      Effect.flatMap(decode),
      Effect.mapError(storeFailure(AssignmentStore, operation)),
    );
  return AssignmentStore.Service.of({
    workspaceId,
    get: (id) =>
      Effect.map(
        select(
          "get",
          sql`SELECT record FROM assignments WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ),
        Array.head,
      ),
    listActiveByMember: (memberId) =>
      select(
        "listActiveByMember",
        sql`SELECT record FROM assignments WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.memberId') = ${memberId} AND json_extract(record, '$.status') = 'active'`,
      ),
    listActiveByRole: (roleId) =>
      select(
        "listActiveByRole",
        sql`SELECT record FROM assignments WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.source._tag') = 'Role' AND json_extract(record, '$.source.roleId') = ${roleId} AND json_extract(record, '$.status') = 'active'`,
      ),
    insert: Effect.fn("Assignments.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new AssignmentStore.Conflict({
          operation: "insert",
          message: "Expected an active assignment in this workspace",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(AssignmentStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO assignments VALUES (${workspaceId}, ${record.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(AssignmentStore, "insert")));
    }),
    markRevoked: Effect.fn("Assignments.markRevoked")(function* (id) {
      yield* Store.Transaction;
      const rows = yield* guard(
        sql`UPDATE assignments SET record = json_set(record, '$.status', 'revoked') WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.status') = 'active' RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(AssignmentStore, "markRevoked")));
      if (rows.length === 0)
        return yield* new AssignmentStore.Conflict({
          operation: "markRevoked",
          message: "Expected an active assignment",
        });
    }),
  });
});

export const layer = Layer.effect(AssignmentStore.Service, make());

export * as Assignments from "./assignments.ts";
