/**
 * The storage contract for connections, which every storage adapter implements and
 * `ConnectionProjection` writes. `ConnectionService`, and the agent and channel operations and
 * their queries, read connections through it. Keys are not here: `ConnectionCredentialStore` keeps
 * them.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";

import * as Connection from "./Connection.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * Storage failed while reading or writing connections.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ConnectionStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, or a missing
 * connection.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("ConnectionStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

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
    readonly get: (id: Connection.Id) => Effect.Effect<Option.Option<Connection.Record>, Failure>;
    /** The workspace's connections that are not removed, in no particular order. */
    readonly listActive: Effect.Effect<ReadonlyArray<Connection.Record>, Failure>;
    /** Reject a reused ID. Never upsert. */
    readonly insert: (
      record: Connection.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored connection; a missing record conflicts. */
    readonly update: (
      record: Connection.Record,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/connection/store/Service") {}

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
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Connection.Id, id), driver.get),
    listActive: driver.listActive,
    insert: (record) => Effect.flatMap(write("insert", Connection.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Connection.Record, record), driver.update),
  };
};
