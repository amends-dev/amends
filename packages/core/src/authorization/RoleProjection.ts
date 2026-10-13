/**
 * Keeps the role read model, `RoleStore`: each role as created, renamed, and given new
 * permissions, and the built-in bundles' revision the workspace holds.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Projection from "../journal/Projection.ts"
import * as RoleFacts from "./RoleFacts.ts"
import * as RoleStore from "./RoleStore.ts"

/**
 * Inserts each created role, renames it and replaces its permissions as recorded, and records
 * each built-in revision, into the host's transactional read model.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("workspace.roles", { version: 1 })
  .on(
    RoleFacts.Created,
    Effect.fn("RoleProjection.created")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore
      yield* roleStore.insert({
        id: payload.roleId,
        workspaceId: payload.workspaceId,
        name: payload.name,
        permissions: payload.permissions
      })
    })
  )
  .on(
    RoleFacts.Renamed,
    Effect.fn("RoleProjection.renamed")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore
      yield* roleStore.rename(payload.roleId, payload.name)
    })
  )
  .on(
    RoleFacts.PermissionsChanged,
    Effect.fn("RoleProjection.permissionsChanged")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore
      yield* roleStore.setPermissions(payload.roleId, payload.permissions)
    })
  )
  .on(
    RoleFacts.BuiltinsRevised,
    Effect.fn("RoleProjection.builtinsRevised")(function* ({ payload }) {
      const roleStore = yield* RoleStore.RoleStore
      yield* roleStore.recordBuiltinRevision(payload.revision)
    })
  )
