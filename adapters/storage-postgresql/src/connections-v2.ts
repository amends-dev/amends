import { ConnectionV2, ConnectionV2Store } from "@amends/core/connection-v2";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { connectionsV2 } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(ConnectionV2.Record));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ConnectionV2.Record.fields, createdAt: Schema.DateTimeUtcFromDate }),
  ),
);
const toRow = (record: ConnectionV2.Record): typeof connectionsV2.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  integration: record.integration,
  name: record.name,
  settings: record.settings,
  auth: record.auth,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
});

/** Connection records in the workspace's database. @category constructors */
export const make = Effect.fn("ConnectionsV2.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = (id: ConnectionV2.Id) =>
    and(eq(connectionsV2.workspaceId, workspaceId), eq(connectionsV2.id, id));
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: ConnectionV2.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(ConnectionV2Store, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ConnectionV2Store.Conflict({
          operation,
          message: "Expected a connection in this workspace",
        });
      return record;
    });
  return ConnectionV2Store.Service.of({
    get: Effect.fn("ConnectionsV2.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ConnectionV2.Id)(input);
        return yield* guard(db.select().from(connectionsV2).where(inWorkspace(id))).pipe(
          Effect.flatMap(decodeRows),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(ConnectionV2Store, "get")),
    ),
    listActive: guard(
      db
        .select()
        .from(connectionsV2)
        .where(and(eq(connectionsV2.workspaceId, workspaceId), eq(connectionsV2.status, "active"))),
    ).pipe(
      Effect.flatMap(decodeRows),
      Effect.mapError(storeFailure(ConnectionV2Store, "listActive")),
    ),
    insert: Effect.fn("ConnectionsV2.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(connectionsV2).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(ConnectionV2Store, "insert")),
      );
    }),
    update: Effect.fn("ConnectionsV2.update")(function* (input) {
      const record = yield* valid("update", input);
      const updated = yield* guard(
        db
          .update(connectionsV2)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: connectionsV2.id }),
        true,
      ).pipe(Effect.mapError(storeError(ConnectionV2Store, "update")));
      if (updated.length === 0)
        return yield* new ConnectionV2Store.Conflict({
          operation: "update",
          message: "Expected a stored connection",
        });
    }),
  });
});

/** Provide connection storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionV2Store.Service, make());

export * as ConnectionsV2 from "./connections-v2.ts";
