import { Context, Effect, Layer, Schema } from "effect";
import * as Permission from "./Permission.ts";
import { Unknown } from "./PermissionCatalogErrors.ts";
export { Unknown } from "./PermissionCatalogErrors.ts";

export class Duplicate extends Schema.TaggedError<Duplicate>()("PermissionCatalog.Duplicate", {
  name: Permission.Name,
}) {}

/**
 * Immutable code-defined permissions, shared independently of workspace assignments.
 */
export class PermissionCatalog extends Context.Service<
  PermissionCatalog,
  {
    /** Validated, immutable declarations in registration order, also used to construct built-in roles. */
    readonly definitions: ReadonlyArray<Permission.Definition>;
    /** Resolve an explicitly registered name to its validated definition. */
    readonly get: (name: Permission.Name) => Effect.Effect<Permission.Definition, Unknown>;
  }
>()("@amends-dev/core/authorization/permission-catalog/Service") {}

const decodeDefinition = Schema.decodeEffect(Permission.Definition);

/**
 * Construct an immutable catalog from domain definitions, rejecting every duplicate name.
 *
 * @category constructors
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
 */
export const layer = (definitions: ReadonlyArray<Permission.Definition>) =>
  Layer.effect(PermissionCatalog, make(definitions));
