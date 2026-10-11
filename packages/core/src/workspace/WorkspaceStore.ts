/**
 * The storage contract for the workspace's own record, which every storage adapter implements and
 * `WorkspaceProjection` writes. The store holds one record, the workspace it is bound to. Reads
 * honor the caller's transaction when there is one; writes require it. The store checks what it
 * is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";
import * as Workspace from "./Workspace.ts";
import * as Ownership from "./Ownership.ts";
import * as WorkspaceSettings from "./WorkspaceSettings.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "./WorkspaceId.ts";

/**
 * Storage failed while reading or writing the workspace record.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("WorkspaceStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a second initialization, a
 * previous name that is not the current one, or a previous owner who is not the current one.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("WorkspaceStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The workspace store, bound to one workspace by the host.
 *
 * What a storage adapter implements for the workspace's own record. Its writes share the native
 * transaction journal projections run in.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceStore extends Context.Service<
  WorkspaceStore,
  {
    /** Change only the name, requiring matching workspace and previous name inside a transaction. */
    readonly rename: (
      change: WorkspaceSettings.NameChange,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Read the current transaction, or committed state when called outside one. */
    readonly get: Effect.Effect<Option.Option<Workspace.Workspace>, Failure>;
    /** Insert once; duplicate creation conflicts. Never overwrite ownership. */
    readonly insert: (
      record: Workspace.Workspace,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /**
     * Change only `ownerMemberId`, when the current owner matches `previousOwnerMemberId`. An
     * absent record or a stale owner conflicts before any change; the operation validates the
     * memberships and roles.
     */
    readonly transferOwnership: (
      change: Ownership.Change,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/workspace/WorkspaceStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: WorkspaceStore["Service"],
): WorkspaceStore["Service"] => {
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    rename: (change) =>
      Effect.flatMap(write("rename", WorkspaceSettings.NameChange, change), driver.rename),
    get: driver.get,
    insert: (record) =>
      write("insert", Workspace.Workspace, record).pipe(
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
