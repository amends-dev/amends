import { Schema } from "effect";
import * as Target from "./Target.ts";

/** Stable identifier referenced by action requirements and permission assignments. */
export const Name = Schema.NonEmptyString.pipe(Schema.brand("PermissionName"));
export type Name = typeof Name.Type;

/** The action metadata carried by requirements; it contains no role-construction policy. */
export const Reference = Schema.Struct({ name: Name, targetKind: Target.Kind });
export interface Reference extends Schema.Schema.Type<typeof Reference> {}

/** The lowest built-in role that includes a permission. Never an authorization rank. */
export const BuiltinTier = Schema.Literals(["member", "administrator", "owner"]);
export type BuiltinTier = typeof BuiltinTier.Type;

/** A domain-owned action with an explicit placement in the built-in role bundles. */
export const Definition = Schema.Struct({
  ...Reference.fields,
  builtinTier: BuiltinTier,
});
export interface Definition<K extends Target.Kind = Target.Kind> extends Schema.Schema.Type<
  typeof Definition
> {
  readonly targetKind: K;
}

/**
 * Construct a permission definition in domain code; this does not grant or enforce access.
 *
 * @category constructors
 */
export const make = <const K extends Target.Kind>(
  name: string,
  options: { readonly targetKind: K; readonly builtinTier: BuiltinTier },
): Definition<K> => {
  const definition = { name, targetKind: options.targetKind, builtinTier: options.builtinTier };
  Schema.asserts(Definition, definition);
  return definition;
};

/** Every action declares its tier, using the group's target kind or an explicit override. */
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
