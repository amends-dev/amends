/**
 * The memory implementation of `ConnectionStore` from `../connection/ConnectionStore.ts`, over the
 * workspace's `Binding`. It keeps what the contract leaves to storage: a reused ID conflicts, and
 * so does an update of a missing connection. The connection's credential is kept apart, by
 * `ConnectionCredentials`. `ConnectionStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Connection, ConnectionStore } from "../connection/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Connection.Record));

/**
 * Connection records over the current workspace transaction.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Connections.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  const driver: ConnectionStore.ConnectionStore["Service"] = {
    get: Effect.fn("Connections.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("connections"), id);
      },
      Effect.mapError(storeFailure(ConnectionStore, "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.of("connections"));
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(storeFailure(ConnectionStore, "listActive"))),
    insert: Effect.fn("Connections.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ConnectionStore, "insert")));
      if (space.records.of("connections").has(record.id))
        return yield* new ConnectionStore.Conflict({
          operation: "insert",
          message: "Connection ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ConnectionStore, "insert")));
      space.records.of("connections").set(record.id, row);
    }),
    update: Effect.fn("Connections.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(ConnectionStore, "update")));
      const found = yield* rows
        .get(space.records.of("connections"), record.id)
        .pipe(Effect.mapError(storeFailure(ConnectionStore, "update")));
      if (Option.isNone(found))
        return yield* new ConnectionStore.Conflict({
          operation: "update",
          message: "Expected a stored connection",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ConnectionStore, "update")));
      space.records.of("connections").set(record.id, row);
    }),
  };
  return ConnectionStore.make(workspaceId, driver);
});

/**
 * Provide connection storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ConnectionStore.ConnectionStore, make());
