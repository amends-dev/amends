import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { Connection } from "./connection.ts";

export class Failure extends Schema.TaggedError<Failure>()("ConnectionStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ConnectionStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  /** The connection, removed or not. */
  readonly get: (id: Connection.Id) => Effect.Effect<Option.Option<Connection.Record>, Failure>;
  /** The workspace's connections that are not removed, in no particular order. */
  readonly listActive: Effect.Effect<ReadonlyArray<Connection.Record>, Failure>;
  /** Reject invalid or foreign records and reused IDs. Never upsert. */
  readonly insert: (
    record: Connection.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored connection; a missing, foreign, or invalid record conflicts. */
  readonly update: (
    record: Connection.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/connection/store/Service",
) {}

export * as ConnectionStore from "./store.ts";
