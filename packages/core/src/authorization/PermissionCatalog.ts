/**
 * The permissions this host declares, checked and frozen once at start: core's `index.ts`
 * registers every feature's declarations through `layer`. `Authorization` looks a requirement's
 * permission up here, `GrantResolver` drops a stored grant whose permission is no longer declared,
 * `AssignmentService.permissions` lists the workspace-wide ones, and `BuiltinRoles.make` and
 * `BuiltinRoleUpgrade` build the built-in bundles from `definitions`.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Schema } from "effect";
import * as Permission from "./Permission.ts";
import { Unknown } from "./internal/permission-catalog-errors.ts";
export {
  /**
   * The name is not a declared permission: no feature registered it with this host.
   *
   * @category errors
   * @since 0.1.0
   */
  Unknown,
} from "./internal/permission-catalog-errors.ts";

/**
 * Two registered declarations share a name.
 *
 * @category errors
 * @since 0.1.0
 */
export class Duplicate extends Schema.TaggedError<Duplicate>()("PermissionCatalog.Duplicate", {
  name: Permission.Name,
}) {}

/**
 * Immutable code-defined permissions, shared independently of workspace assignments.
 *
 * @category services
 * @since 0.1.0
 */
export class PermissionCatalog extends Context.Service<
  PermissionCatalog,
  {
    /** Validated, immutable declarations in registration order, also used to construct built-in roles. */
    readonly definitions: ReadonlyArray<Permission.Definition>;
    /** Resolve an explicitly registered name to its validated definition. */
    readonly get: (name: Permission.Name) => Effect.Effect<Permission.Definition, Unknown>;
  }
>()("@amends-dev/core/authorization/PermissionCatalog") {}

const decodeDefinition = Schema.decodeEffect(Permission.Definition);

/**
 * Construct an immutable catalog from domain definitions, rejecting every duplicate name.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("PermissionCatalog.make")(function* (
  definitions: ReadonlyArray<Permission.Definition>,
): Effect.fn.Return<PermissionCatalog["Service"], Duplicate | Schema.SchemaError> {
  const byName = new Map<Permission.Name, Permission.Definition>();
  for (const input of definitions) {
    const definition = yield* decodeDefinition(input);
    if (byName.has(definition.name)) return yield* new Duplicate({ name: definition.name });
    byName.set(
      definition.name,
      Object.freeze({
        name: definition.name,
        targetKind: definition.targetKind,
        builtinTier: definition.builtinTier,
      }),
    );
  }

  const get = Effect.fn("PermissionCatalog.get")(function* (name: Permission.Name) {
    const definition = byName.get(name);
    if (definition === undefined) return yield* new Unknown({ name });
    return definition;
  });

  return Object.freeze(
    PermissionCatalog.of({ definitions: Object.freeze([...byName.values()]), get }),
  );
});

/**
 * Provide the permission catalog constructed from domain declarations.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (definitions: ReadonlyArray<Permission.Definition>) =>
  Layer.effect(PermissionCatalog, make(definitions));
