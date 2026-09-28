import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import type { Environment } from "./environment.ts";

export class Failure extends Schema.TaggedError<Failure>()("EnvironmentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("EnvironmentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly get: (id: Environment.Id) => Effect.Effect<Option.Option<Environment.Record>, Failure>;
  /** Every environment in the workspace, removed ones included, in no particular order. */
  readonly list: Effect.Effect<ReadonlyArray<Environment.Record>, Failure>;
  /** Reject invalid or foreign records and reused IDs. Never upsert. */
  readonly insert: (
    record: Environment.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored environment; a missing, foreign, or invalid record conflicts. */
  readonly update: (
    record: Environment.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/environment/store/Service",
) {}

export * as EnvironmentStore from "./store.ts";
