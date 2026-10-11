import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";

import { Connection } from "./connection.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "../workspace/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("ConnectionStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ConnectionStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Internal projection storage. Reads honor an existing transaction; writes require one.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
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

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/connection/store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Connection.Id, id), driver.get),
    listActive: driver.listActive,
    insert: (record) => Effect.flatMap(write("insert", Connection.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Connection.Record, record), driver.update),
  };
};

export * as ConnectionStore from "./store.ts";
