import { Connection, ConnectionStore } from "@amends/core/connection";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { connections } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Connection.Record));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...Connection.Record.fields, createdAt: Schema.DateTimeUtcFromDate }),
  ),
);
type Row = typeof connections.$inferSelect;
const toRecord = ({ authentication, credentialId, ...common }: Row) => ({
  ...common,
  authentication: authentication === "ApiKey" ? { _tag: "ApiKey", credentialId } : { _tag: "None" },
});
const decode = (rows: ReadonlyArray<Row>) =>
  decodeRows(rows.map(toRecord)).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
  );
const toRow = (record: Connection.Record): typeof connections.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  name: record.name,
  implementationId: record.implementationId,
  settings: record.settings,
  authentication: record.authentication._tag,
  credentialId: Connection.Authentication.isAnyOf(["ApiKey"])(record.authentication)
    ? record.authentication.credentialId
    : null,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
});

/** Connection records in the workspace's database. @category constructors */
export const make = Effect.fn("Connections.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = (id: Connection.Id) =>
    and(eq(connections.workspaceId, workspaceId), eq(connections.id, id));
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Connection.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(ConnectionStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ConnectionStore.Conflict({
          operation,
          message: "Expected a connection in this workspace",
        });
      return record;
    });
  return ConnectionStore.Service.of({
    get: Effect.fn("Connections.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Connection.Id)(input);
        return yield* guard(db.select().from(connections).where(inWorkspace(id))).pipe(
          Effect.flatMap(decode),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(ConnectionStore, "get")),
    ),
    list: guard(db.select().from(connections).where(eq(connections.workspaceId, workspaceId))).pipe(
      Effect.flatMap(decode),
      Effect.mapError(storeFailure(ConnectionStore, "list")),
    ),
    insert: Effect.fn("Connections.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(connections).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(ConnectionStore, "insert")),
      );
    }),
    update: Effect.fn("Connections.update")(function* (input) {
      const record = yield* valid("update", input);
      const updated = yield* guard(
        db
          .update(connections)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: connections.id }),
        true,
      ).pipe(Effect.mapError(storeError(ConnectionStore, "update")));
      if (updated.length === 0)
        return yield* new ConnectionStore.Conflict({
          operation: "update",
          message: "Expected a stored connection",
        });
    }),
  });
});

/** Provide connection storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionStore.Service, make());

export * as Connections from "./connections.ts";
