/**
 * How a feature declares an action that needs a grant: a name, the kind of target it is done to,
 * and the lowest built-in role that holds it. Features declare permissions with `make`, or through
 * `makeGroup` for a shared prefix and default target kind, in a `*Permissions` module beside their
 * operations, and register them in core's `index.ts`, where `PermissionCatalog` checks and freezes
 * them and `BuiltinRoles.make` bundles them by tier. A `Requirement` names a permission on a
 * target; a definition grants nothing by itself.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Target from "./Target.ts";

/**
 * Stable identifier referenced by action requirements and permission assignments.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.NonEmptyString.pipe(Schema.brand("PermissionName"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type;

/**
 * The action metadata carried by requirements; it contains no role-construction policy.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.Struct({ name: Name, targetKind: Target.Kind });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Reference extends Schema.Schema.Type<typeof Reference> {}

/**
 * The lowest built-in role that includes a permission. Never an authorization rank.
 *
 * @category schemas
 * @since 0.1.0
 */
export const BuiltinTier = Schema.Literals(["member", "administrator", "owner"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type BuiltinTier = typeof BuiltinTier.Type;

/**
 * A domain-owned action with an explicit placement in the built-in role bundles.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Definition = Schema.Struct({
  ...Reference.fields,
  builtinTier: BuiltinTier,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Definition<K extends Target.Kind = Target.Kind> extends Schema.Schema.Type<
  typeof Definition
> {
  readonly targetKind: K;
}

/**
 * Construct a permission definition in domain code; this does not grant or enforce access.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <const K extends Target.Kind>(
  name: string,
  options: { readonly targetKind: K; readonly builtinTier: BuiltinTier },
): Definition<K> => {
  const definition = { name, targetKind: options.targetKind, builtinTier: options.builtinTier };
  Schema.asserts(Definition, definition);
  return definition;
};

/**
 * A feature's permissions under one prefix: `make` declares each action with its tier, on the
 * group's target kind or one the action names itself.
 *
 * @category models
 * @since 0.1.0
 */
export interface Group<K extends Target.Kind = Target.Kind> {
  readonly make: {
    (action: string, options: { readonly builtinTier: BuiltinTier }): Definition<K>;
    <const Override extends Target.Kind>(
      action: string,
      options: { readonly targetKind: Override; readonly builtinTier: BuiltinTier },
    ): Definition<Override>;
  };
}

/**
 * Construct a group that prefixes action names and supplies a default target kind.
 * Actions such as creation can override the default to target their destination
 * workspace or container.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeGroup = <const K extends Target.Kind>(
  prefix: string,
  options: { readonly targetKind: K },
): Group<K> => {
  const namespace = Schema.NonEmptyString.make(prefix);
  const defaultKind = Target.Kind.make(options.targetKind);

  function makePermission(
    action: string,
    options: { readonly builtinTier: BuiltinTier },
  ): Definition<K>;
  function makePermission<const Override extends Target.Kind>(
    action: string,
    options: { readonly targetKind: Override; readonly builtinTier: BuiltinTier },
  ): Definition<Override>;
  function makePermission(
    action: string,
    options: { readonly targetKind?: Target.Kind; readonly builtinTier: BuiltinTier },
  ): Definition {
    return make(`${namespace}.${Schema.NonEmptyString.make(action)}`, {
      targetKind: options?.targetKind ?? defaultKind,
      builtinTier: options?.builtinTier,
    });
  }

  return { make: makePermission };
};
