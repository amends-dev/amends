import { ConnectionV2, ConnectionV2Store } from "@amends/core/connection-v2";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(ConnectionV2.Record));
const rows = Rows.make(Schema.fromJsonString(ConnectionV2.Record));

/** Connection records over the current workspace transaction. @category constructors */
export const make = Effect.fn("ConnectionsV2.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
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
        return yield* rows.get((yield* read).records.connectionsV2, id);
      },
      Effect.mapError(storeFailure(ConnectionV2Store, "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.connectionsV2);
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(storeFailure(ConnectionV2Store, "listActive"))),
    insert: Effect.fn("ConnectionsV2.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(ConnectionV2Store, "insert")));
      if (space.records.connectionsV2.has(record.id))
        return yield* new ConnectionV2Store.Conflict({
          operation: "insert",
          message: "Connection ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ConnectionV2Store, "insert")));
      space.records.connectionsV2.set(record.id, row);
    }),
    update: Effect.fn("ConnectionsV2.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(ConnectionV2Store, "update")));
      const found = yield* rows
        .get(space.records.connectionsV2, record.id)
        .pipe(Effect.mapError(storeFailure(ConnectionV2Store, "update")));
      if (Option.isNone(found))
        return yield* new ConnectionV2Store.Conflict({
          operation: "update",
          message: "Expected a stored connection",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ConnectionV2Store, "update")));
      space.records.connectionsV2.set(record.id, row);
    }),
  });
});

/** Provide connection storage over the caller's binding. @category layers */
export const layer = Layer.effect(ConnectionV2Store.Service, make());

export * as ConnectionsV2 from "./connections-v2.ts";
