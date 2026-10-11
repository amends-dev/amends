import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";
import { Workspace } from "./workspace.ts";
import { Ownership } from "./ownership/ownership.ts";
import { WorkspaceSettings } from "./settings/settings.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "./id.ts";

export class Failure extends Schema.TaggedError<Failure>()("WorkspaceStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("WorkspaceStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Workspace metadata shares the native transaction used by journal projections.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
  /** Change only the name, requiring matching workspace and previous name inside a transaction. */
  readonly rename: (
    change: WorkspaceSettings.NameChange,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Read the current transaction, or committed state when called outside one. */
  readonly get: Effect.Effect<Option.Option<Workspace.Record>, Failure>;
  /** Insert once; duplicate creation conflicts. Never overwrite ownership. */
  readonly insert: (
    record: Workspace.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Change only ownerMemberId when the current owner matches previousOwnerMemberId.
   * Reject absent records and stale owners as conflicts before changing state. The application validates memberships and roles.
   */
  readonly transferOwnership: (
    change: Ownership.Change,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/workspace/workspace-store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    rename: (change) =>
      Effect.flatMap(write("rename", WorkspaceSettings.NameChange, change), driver.rename),
    get: driver.get,
    insert: (record) =>
      write("insert", Workspace.Record, record).pipe(
        Effect.filterOrFail(
          (record) => record.id === workspaceId,
          () =>
            new Conflict({ operation: "insert", message: "Record belongs to another workspace" }),
        ),
        Effect.flatMap(driver.insert),
      ),
    transferOwnership: (change) =>
      Effect.flatMap(
        write("transferOwnership", Ownership.Change, change),
        driver.transferOwnership,
      ),
  };
};

export * as WorkspaceStore from "./store.ts";
