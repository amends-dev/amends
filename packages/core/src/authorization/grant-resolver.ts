import { Assignment } from "./assignment/assignment.ts";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type { Member } from "../workspace/member/member.ts";

import { AssignmentStore } from "./assignment/store.ts";

import { Grant } from "./grant.ts";
import { PermissionCatalog } from "./permission-catalog.ts";
import type { Permission } from "./permission.ts";
import { RoleStore } from "./role/store.ts";

import type { Scope } from "./scope.ts";

export type Error = AssignmentStore.Failure | RoleStore.Failure | Schema.SchemaError;

export interface Interface {
  /**
   * Resolve active assignments from current state, using an existing transaction
   * when the caller supplies one. This does not open a transaction. Any invalid
   * assignment fails the whole operation. A recorded permission the catalog no longer declares
   * grants nothing, since no requirement can name it. Overlapping grants may repeat.
   * Actor identity, active membership, and action requirements are checked by authorization.
   */
  readonly resolve: (memberId: Member.Id) => Effect.Effect<ReadonlyArray<Grant.Value>, Error>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/authorization/grant-resolver/Service",
) {}

/**
 * Construct a resolver from workspace stores and metadata; read assignments and roles per call.
 *
 * @category constructors
 */
export const make = Effect.fn("GrantResolver.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  AssignmentStore.Service | RoleStore.Service | PermissionCatalog.Service
> {
  const assignmentStore = yield* AssignmentStore.Service;
  const roleStore = yield* RoleStore.Service;
  const permissionCatalog = yield* PermissionCatalog.Service;

  /** A retired permission grants nothing, rather than failing every grant its holder has. */
  const resolveGrant = Effect.fnUntraced(function* (name: Permission.Name, scope: Scope.Value) {
    const permission = yield* permissionCatalog.get(name).pipe(
      Effect.asSome,
      Effect.catchTag("PermissionCatalog.Unknown", () => Effect.succeedNone),
    );
    if (Option.isNone(permission)) return [];
    // A stored grant that no longer fits its permission is state core can't use, not caller input.
    return [
      yield* Effect.orDie(
        Schema.decodeEffect(Grant.makeSchema(permission.value))({ permission: name, scope }),
      ),
    ];
  });

  const resolve = Effect.fn("GrantResolver.resolve")(function* (memberId: Member.Id) {
    const grants: Array<Grant.Value> = [];
    for (const assignment of yield* assignmentStore.listActiveByMember(memberId)) {
      const source = assignment.source;
      if (Assignment.Source.isAnyOf(["Direct"])(source)) {
        grants.push(...(yield* resolveGrant(source.grant.permission, source.grant.scope)));
      } else {
        const role = yield* roleStore.get(source.roleId);
        if (Option.isNone(role)) return yield* Effect.die("An assignment's role is missing");
        for (const name of role.value.permissions) {
          grants.push(...(yield* resolveGrant(name, source.scope)));
        }
      }
    }
    return grants;
  });

  return Service.of({ resolve });
});

/**
 * Provide grant resolution over the caller's workspace stores and permission catalog.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as GrantResolver from "./grant-resolver.ts";
