/**
 * The storage contract for the workspace's own record, which every storage adapter implements and
 * `WorkspaceProjection` writes. The store holds one record, the workspace it is bound to. Reads
 * honor the caller's transaction when there is one; writes require it. The store checks what it
 * is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import type * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as Ownership from "./Ownership.ts"
import * as Workspace from "./Workspace.ts"
import * as WorkspaceId from "./WorkspaceId.ts"
import * as WorkspaceSettings from "./WorkspaceSettings.ts"

/**
 * The workspace store, bound to one workspace by the host: what a storage adapter implements for
 * the workspace's own record. Its writes share the native transaction journal projections run in.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema, and a record against the workspace, before the driver sees it, so a driver keeps only
 * what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceStore extends Context.Service<
  WorkspaceStore,
  {
    /** Change only the name, requiring matching workspace and previous name inside a transaction. */
    readonly rename: (
      change: WorkspaceSettings.NameChange
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /** Read the current transaction, or committed state when called outside one. */
    readonly get: Effect.Effect<Option.Option<Workspace.Workspace>, StoreError.StoreError>
    /** Insert once; duplicate creation is rejected. Never overwrite ownership. */
    readonly insert: (record: Workspace.Workspace) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Change only `ownerMemberId`, when the current owner matches `previousOwnerMemberId`. An
     * absent record or a stale owner is rejected before any change; the operation validates the
     * memberships and roles.
     */
    readonly transferOwnership: (
      change: Ownership.Change
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
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
  workspaceId: WorkspaceId.WorkspaceId,
  driver: WorkspaceStore["Service"]
): WorkspaceStore["Service"] => {
  const write = StoreInput.write("WorkspaceStore", WorkspaceId.rejectForeign(workspaceId))
  return {
    rename: (change) => Effect.flatMap(write("rename", WorkspaceSettings.NameChange, change), driver.rename),
    get: driver.get,
    insert: (record) =>
      write("insert", Workspace.Workspace, record).pipe(
        Effect.filterOrFail(
          (record) => record.id === workspaceId,
          () => StoreError.rejected("WorkspaceStore", "insert", "Record belongs to another workspace")
        ),
        Effect.flatMap(driver.insert)
      ),
    transferOwnership: (change) =>
      Effect.flatMap(write("transferOwnership", Ownership.Change, change), driver.transferOwnership)
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Workspace.Workspace))

/**
 * Workspace metadata, with ownership changes guarded by the previous owner.
 */
const makeMemory = Effect.fn("WorkspaceStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* MemoryBinding.MemoryBinding
  const driver: WorkspaceStore["Service"] = {
    get: Effect.flatMap(read, (space) => rows.get(space.records.of("workspace"), workspaceId)).pipe(
      Effect.mapError(StoreError.failed("WorkspaceStore", "get"))
    ),
    insert: Effect.fn("WorkspaceStore.memory.insert")(
      function* (record) {
        const space = yield* write
        if (space.records.of("workspace").has(workspaceId))
          return yield* StoreError.rejected("WorkspaceStore", "insert", "Workspace already exists")
        const row = yield* rows.encode(record)
        space.records.of("workspace").set(workspaceId, row)
      },
      Effect.mapError(StoreError.failed("WorkspaceStore", "insert"))
    ),
    rename: Effect.fn("WorkspaceStore.memory.rename")(
      function* (change) {
        const space = yield* write
        const current = yield* rows.get(space.records.of("workspace"), workspaceId)
        if (Option.isNone(current) || current.value.name !== change.previousName)
          return yield* StoreError.rejected("WorkspaceStore", "rename", "Workspace is missing or name has changed")
        const row = yield* rows.encode({ ...current.value, name: change.name })
        space.records.of("workspace").set(workspaceId, row)
      },
      Effect.mapError(StoreError.failed("WorkspaceStore", "rename"))
    ),
    transferOwnership: Effect.fn("WorkspaceStore.memory.transferOwnership")(
      function* (change) {
        const space = yield* write
        const current = yield* rows.get(space.records.of("workspace"), workspaceId)
        if (Option.isNone(current) || current.value.ownerMemberId !== change.previousOwnerMemberId)
          return yield* StoreError.rejected(
            "WorkspaceStore",
            "transferOwnership",
            "Workspace is missing or ownership has changed"
          )
        const row = yield* rows.encode({ ...current.value, ownerMemberId: change.ownerMemberId })
        space.records.of("workspace").set(workspaceId, row)
      },
      Effect.mapError(StoreError.failed("WorkspaceStore", "transferOwnership"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `WorkspaceStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`: the bound
 * workspace's one record, keyed by its ID. It keeps what the contract leaves to storage: a second
 * insert is rejected, and a rename or ownership transfer is a conditional write that is rejected
 * unless the stored name or owner is still the one the change replaces. `make` checks every input
 * first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(WorkspaceStore, makeMemory())
