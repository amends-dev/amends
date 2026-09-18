import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { Workspace } from "./workspace.ts";

export class Failure extends Schema.TaggedError<Failure>()("WorkspaceStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("WorkspaceStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Workspace metadata shares the native transaction used by journal projections. */
export interface Interface {
  readonly workspaceId: Workspace.Id;
  /** Read the current transaction, or committed state when called outside one. */
  readonly get: Effect.Effect<Option.Option<Workspace.Record>, Failure>;
  /** Insert once; invalid records, duplicate creation, and a different workspace conflict. Never overwrite ownership. */
  readonly insert: (
    record: Workspace.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/workspace-store/Service",
) {}

export * as WorkspaceStore from "./store.ts";
