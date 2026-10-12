/**
 * The storage contract for connections, which every storage adapter implements and
 * `ConnectionProjection` writes. `ConnectionService`, and the agent and channel operations and
 * their queries, read connections through it. Keys are not here: `ConnectionCredentialStore` keeps
 * them.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as Connection from "./Connection.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";
import * as StoreError from "../journal/StoreError.ts";

/**
 * The connection store, bound to one workspace by the host. Reads honor the caller's transaction
 * when there is one; writes require it. The store checks what it is given and authorizes nobody:
 * operations do that.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class ConnectionStore extends Context.Service<
  ConnectionStore,
  {
    /** The connection, removed or not. */
    readonly get: (
      id: Connection.Id,
    ) => Effect.Effect<Option.Option<Connection.Connection>, StoreError.StoreError>;
    /** The workspace's connections that are not removed, in no particular order. */
    readonly listActive: Effect.Effect<ReadonlyArray<Connection.Connection>, StoreError.StoreError>;
    /** Reject a reused ID. Never upsert. */
    readonly insert: (
      record: Connection.Connection,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
    /** Replace a stored connection; a missing record is rejected. */
    readonly update: (
      record: Connection.Connection,
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>;
  }
>()("@amends-dev/core/connection/ConnectionStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: ConnectionStore["Service"],
): ConnectionStore["Service"] => {
  const read = StoreInput.read("ConnectionStore");
  const write = StoreInput.write("ConnectionStore", workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Connection.Id, id), driver.get),
    listActive: driver.listActive,
    insert: (record) =>
      Effect.flatMap(write("insert", Connection.Connection, record), driver.insert),
    update: (record) =>
      Effect.flatMap(write("update", Connection.Connection, record), driver.update),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Connection.Connection));

/**
 * Connection records over the current workspace transaction.
 */
const makeMemory = Effect.fn("ConnectionStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  const driver: ConnectionStore["Service"] = {
    get: Effect.fn("ConnectionStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("connections"), id);
      },
      Effect.mapError(StoreError.failed("ConnectionStore", "get")),
    ),
    listActive: Effect.gen(function* () {
      const records = yield* rows.all((yield* read).records.of("connections"));
      return records.filter((record) => record.status === "active");
    }).pipe(Effect.mapError(StoreError.failed("ConnectionStore", "listActive"))),
    insert: Effect.fn("ConnectionStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(
        Effect.mapError(StoreError.failed("ConnectionStore", "insert")),
      );
      if (space.records.of("connections").has(record.id))
        return yield* StoreError.rejected(
          "ConnectionStore",
          "insert",
          "Connection ID already exists",
        );
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(StoreError.failed("ConnectionStore", "insert")));
      space.records.of("connections").set(record.id, row);
    }),
    update: Effect.fn("ConnectionStore.memory.update")(function* (record) {
      const space = yield* write.pipe(
        Effect.mapError(StoreError.failed("ConnectionStore", "update")),
      );
      const found = yield* rows
        .get(space.records.of("connections"), record.id)
        .pipe(Effect.mapError(StoreError.failed("ConnectionStore", "update")));
      if (Option.isNone(found))
        return yield* StoreError.rejected(
          "ConnectionStore",
          "update",
          "Expected a stored connection",
        );
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(StoreError.failed("ConnectionStore", "update")));
      space.records.of("connections").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `ConnectionStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps
 * what the contract leaves to storage: a reused ID is rejected, and so is an update of a missing
 * connection. The connection's credential is kept apart, by `ConnectionCredentialStore`. `make`
 * checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(ConnectionStore, makeMemory());
