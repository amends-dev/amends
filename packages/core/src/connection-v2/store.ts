import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { ConnectionV2 } from "./connection.ts";

export class Failure extends Schema.TaggedError<Failure>()("ConnectionV2Store.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("ConnectionV2Store.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  /** The connection, removed or not. */
  readonly get: (id: ConnectionV2.Id) => Effect.Effect<Option.Option<ConnectionV2.Record>, Failure>;
  /** The workspace's connections that are not removed, in no particular order. */
  readonly listActive: Effect.Effect<ReadonlyArray<ConnectionV2.Record>, Failure>;
  /** Reject invalid or foreign records and reused IDs. Never upsert. */
  readonly insert: (
    record: ConnectionV2.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored connection; a missing, foreign, or invalid record conflicts. */
  readonly update: (
    record: ConnectionV2.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection-v2/store/Service",
) {}

export * as ConnectionV2Store from "./store.ts";
