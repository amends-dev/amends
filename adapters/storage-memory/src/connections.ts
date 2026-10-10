import { Connection, ConnectionStore } from "@amends-dev/core/connection";
import { Store } from "@amends-dev/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Connection.Record));
const rows = Rows.make(Schema.fromJsonString(Connection.Record));

/** Connection records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Connections.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
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
        return yield* rows.get((yield* read).records.connections, id);
      },
      Effect.mapError(storeFailure(ConnectionStore, "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.connections);
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(storeFailure(ConnectionStore, "listActive"))),
    insert: Effect.fn("Connections.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(ConnectionStore, "insert")));
      if (space.records.connections.has(record.id))
        return yield* new ConnectionStore.Conflict({
          operation: "insert",
          message: "Connection ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ConnectionStore, "insert")));
      space.records.connections.set(record.id, row);
    }),
    update: Effect.fn("Connections.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(ConnectionStore, "update")));
      const found = yield* rows
        .get(space.records.connections, record.id)
        .pipe(Effect.mapError(storeFailure(ConnectionStore, "update")));
      if (Option.isNone(found))
        return yield* new ConnectionStore.Conflict({
          operation: "update",
          message: "Expected a stored connection",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ConnectionStore, "update")));
      space.records.connections.set(record.id, row);
    }),
  });
});

/** Provide connection storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionStore.Service, make());

export * as Connections from "./connections.ts";
