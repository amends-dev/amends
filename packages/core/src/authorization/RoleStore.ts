/**
 * The storage contract for roles, which every storage adapter implements and `RoleProjection`
 * writes. It also keeps the built-in bundles' revision the workspace holds, which
 * `BuiltinRoleUpgrade` compares with the host's. `GrantResolver` and `Delegation` read roles by
 * ID. Reads honor the caller's transaction when there is one; writes require it. The store checks
 * what it is given and authorizes nobody: operations do that.
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
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as BuiltinRoles from "./BuiltinRoles.ts"
import * as Role from "./Role.ts"

/**
 * The role store, bound to one workspace by the host: what a storage adapter implements for roles.
 * Reads use the current host transaction when present, including its staged writes; otherwise
 * committed state. Isolate stored inputs and returned records from caller mutation.
 *
 * Projection writes enlist in the same native transaction as journal entries and
 * checkpoints. Enforce constraints atomically across concurrent writers. Reject
 * expired or foreign transaction handles and never retry the program internally.
 * Permission definitions, affected assignments, and grant authority are checked
 * by services before publication.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class RoleStore extends Context.Service<
  RoleStore,
  {
    /** Find a role in this workspace; None if absent. */
    readonly get: (roleId: Role.RoleId) => Effect.Effect<Option.Option<Role.Role>, StoreError.StoreError>

    /**
     * Insert a role. Reject a reused role ID. Never upsert.
     */
    readonly insert: (record: Role.Role) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>

    /**
     * Change only the display name. Rejected if the role is absent in this workspace.
     */
    readonly rename: (
      roleId: Role.RoleId,
      name: Role.Role["name"]
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>

    /**
     * Replace the complete permission list, retaining the ID, workspace, and name.
     * An empty list is valid. Rejected if the role is absent in this workspace.
     */
    readonly setPermissions: (
      roleId: Role.RoleId,
      permissions: Role.Role["permissions"]
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>

    /** The built-in bundle revision the workspace's roles hold; None before one is recorded. */
    readonly builtinRevision: Effect.Effect<Option.Option<number>, StoreError.StoreError>

    /**
     * Record a later built-in bundle revision. Reject one not later than the
     * recorded revision.
     */
    readonly recordBuiltinRevision: (revision: number) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/authorization/RoleStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.WorkspaceId, driver: RoleStore["Service"]): RoleStore["Service"] => {
  const read = StoreInput.read("RoleStore")
  const write = StoreInput.write("RoleStore", WorkspaceId.rejectForeign(workspaceId))
  return {
    get: (roleId) => Effect.flatMap(read("get", Role.RoleId, roleId), driver.get),
    insert: (record) => Effect.flatMap(write("insert", Role.Role, record), driver.insert),
    rename: Effect.fn("RoleStore.rename")(function* (roleId, name) {
      return yield* driver.rename(
        yield* write("rename", Role.RoleId, roleId),
        yield* write("rename", Role.Role.fields.name, name)
      )
    }),
    setPermissions: Effect.fn("RoleStore.setPermissions")(function* (roleId, permissions) {
      return yield* driver.setPermissions(
        yield* write("setPermissions", Role.RoleId, roleId),
        yield* write("setPermissions", Role.Role.fields.permissions, permissions)
      )
    }),
    builtinRevision: driver.builtinRevision,
    recordBuiltinRevision: (revision) =>
      Effect.flatMap(write("recordBuiltinRevision", BuiltinRoles.Revision, revision), driver.recordBuiltinRevision)
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Role.Role))
const revisions = MemoryDatabase.makeRows(Schema.fromJsonString(BuiltinRoles.Revision))
/** The workspace's one built-in revision row. */
const revisionKey = "builtin"

/**
 * Named permission bundles; edits keep the role's identity.
 */
const makeMemory = Effect.fn("RoleStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* MemoryBinding.MemoryBinding
  /** Replace one role with an edited record. */
  const edit = Effect.fn("RoleStore.memory.edit")(
    function* (operation: string, id: Role.RoleId, change: (role: Role.Role) => Role.Role) {
      const space = yield* write
      const current = yield* rows.get(space.records.of("roles"), id)
      if (Option.isNone(current)) return yield* StoreError.rejected("RoleStore", operation, "Role does not exist")
      const record = change(current.value)
      const row = yield* rows.encode(record)
      space.records.of("roles").set(id, row)
    },
    (effect, operation) => Effect.mapError(effect, StoreError.failed("RoleStore", operation))
  )
  const driver: RoleStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("roles"), id)).pipe(
        Effect.mapError(StoreError.failed("RoleStore", "get"))
      ),
    insert: Effect.fn("RoleStore.memory.insert")(
      function* (record) {
        const space = yield* write
        if (space.records.of("roles").has(record.id))
          return yield* StoreError.rejected("RoleStore", "insert", "Role ID already exists")
        const row = yield* rows.encode(record)
        space.records.of("roles").set(record.id, row)
      },
      Effect.mapError(StoreError.failed("RoleStore", "insert"))
    ),
    rename: (id, name) => edit("rename", id, (role) => Object.assign({}, role, { name })),
    setPermissions: (id, permissions) => edit("setPermissions", id, (role) => Object.assign({}, role, { permissions })),
    builtinRevision: Effect.flatMap(read, (space) =>
      revisions.get(space.records.of("builtinRoleRevision"), revisionKey)
    ).pipe(Effect.mapError(StoreError.failed("RoleStore", "builtinRevision"))),
    recordBuiltinRevision: Effect.fn("RoleStore.memory.recordBuiltinRevision")(
      function* (revision) {
        const space = yield* write
        const current = yield* revisions.get(space.records.of("builtinRoleRevision"), revisionKey)
        if (Option.isSome(current) && revision <= current.value)
          return yield* StoreError.rejected("RoleStore", "recordBuiltinRevision", "Expected a later built-in revision")
        const row = yield* revisions.encode(revision)
        space.records.of("builtinRoleRevision").set(revisionKey, row)
      },
      Effect.mapError(StoreError.failed("RoleStore", "recordBuiltinRevision"))
    )
  }
  return make(workspaceId, driver)
})

/**
 * Provide `RoleStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`: roles, and the
 * revision of the built-in roles the workspace was last given, as one row. It keeps what the
 * contract leaves to storage: a reused ID is rejected, renaming or setting permissions of a missing
 * role is rejected, and a built-in revision no later than the recorded one is rejected. `make`
 * checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(RoleStore, makeMemory())
