/**
 * The grants a member currently holds, resolved from their active assignments in
 * `AssignmentStore`: a direct assignment is its grant, and a role assignment is each permission of
 * the role in `RoleStore`, at the assignment's scope. `Authorization` resolves once per check. A
 * recorded permission `PermissionCatalog` does not declare is skipped: no requirement can name
 * it, so a retired one grants nothing and breaks nothing else its holder has.
 *
 * @since 0.1.0
 */

import type * as StoreError from "@amends-dev/log/StoreError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as MemberId from "../workspace/MemberId.ts"
import * as Assignment from "./Assignment.ts"
import * as AssignmentStore from "./AssignmentStore.ts"
import * as Grant from "./Grant.ts"
import type * as Permission from "./Permission.ts"
import * as PermissionCatalog from "./PermissionCatalog.ts"
import * as RoleStore from "./RoleStore.ts"
import type * as Scope from "./Scope.ts"

/**
 * What resolving grants can fail with: the assignment and role stores.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = StoreError.StoreError | Schema.SchemaError

/**
 * The grant resolution, bound to one workspace. `Authorization` is its caller; operations check
 * requirements through that rather than reading grants themselves.
 *
 * @category services
 * @since 0.1.0
 */
export class GrantResolver extends Context.Service<
  GrantResolver,
  {
    /**
     * Resolve active assignments from current state, using an existing transaction
     * when the caller supplies one. This does not open a transaction. Any invalid
     * assignment fails the whole operation. A recorded permission the catalog no longer declares
     * grants nothing, since no requirement can name it. Overlapping grants may repeat.
     * Actor identity, active membership, and action requirements are checked by authorization.
     */
    readonly resolve: (memberId: MemberId.MemberId) => Effect.Effect<ReadonlyArray<Grant.Grant>, Error>
  }
>()("@amends-dev/core/authorization/GrantResolver") {}

/**
 * Construct a resolver from workspace stores and metadata; read assignments and roles per call.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make: Effect.Effect<
  GrantResolver["Service"],
  never,
  AssignmentStore.AssignmentStore | RoleStore.RoleStore | PermissionCatalog.PermissionCatalog
> = Effect.gen(function* () {
  const assignmentStore = yield* AssignmentStore.AssignmentStore
  const roleStore = yield* RoleStore.RoleStore
  const permissionCatalog = yield* PermissionCatalog.PermissionCatalog

  /** A retired permission grants nothing, rather than failing every grant its holder has. */
  const resolveGrant = Effect.fnUntraced(function* (name: Permission.Name, scope: Scope.Scope) {
    const permission = yield* permissionCatalog.get(name).pipe(
      Effect.asSome,
      Effect.catchTag("PermissionCatalog.Unknown", () => Effect.succeedNone)
    )
    if (Option.isNone(permission)) return []
    // A stored grant that no longer fits its permission is state core can't use, not caller input.
    return [yield* Effect.orDie(Schema.decodeEffect(Grant.makeSchema(permission.value))({ permission: name, scope }))]
  })

  const resolve = Effect.fn("GrantResolver.resolve")(function* (memberId: MemberId.MemberId) {
    const grants: Array<Grant.Grant> = []
    for (const assignment of yield* assignmentStore.listActiveByMember(memberId)) {
      const source = assignment.source
      if (Assignment.Source.isAnyOf(["Direct"])(source)) {
        grants.push(...(yield* resolveGrant(source.grant.permission, source.grant.scope)))
      } else {
        const role = yield* roleStore.get(source.roleId)
        if (Option.isNone(role)) return yield* Effect.die("An assignment's role is missing")
        for (const name of role.value.permissions) {
          grants.push(...(yield* resolveGrant(name, source.scope)))
        }
      }
    }
    return grants
  })

  return GrantResolver.of({ resolve })
})

/**
 * Provide grant resolution over the caller's workspace stores and permission catalog.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GrantResolver, make)
