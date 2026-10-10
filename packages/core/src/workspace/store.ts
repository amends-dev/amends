import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { Workspace } from "./workspace.ts";
import type { Ownership } from "./ownership/ownership.ts";
import type { WorkspaceSettings } from "./settings/settings.ts";

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
  /** Change only the name, requiring matching workspace and previous name inside a transaction. */
  readonly rename: (
    change: WorkspaceSettings.NameChange,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Read the current transaction, or committed state when called outside one. */
  readonly get: Effect.Effect<Option.Option<Workspace.Record>, Failure>;
  /** Insert once; invalid records, duplicate creation, and a different workspace conflict. Never overwrite ownership. */
  readonly insert: (
    record: Workspace.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Change only ownerMemberId when the current owner matches previousOwnerMemberId.
   * Reject invalid changes, foreign workspaces, absent records, and stale owners as
   * conflicts before changing state. The application validates memberships and roles.
   */
  readonly transferOwnership: (
    change: Ownership.Change,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/workspace/workspace-store/Service",
) {}

export * as WorkspaceStore from "./store.ts";
