import { Schema } from "effect";
import { Target } from "./target.ts";

/** Stable identifier referenced by action requirements and permission assignments. */
export const Name = Schema.NonEmptyString.pipe(Schema.brand("PermissionName"));
export type Name = typeof Name.Type;

/** A domain-owned action permission and the kind of resource it applies to. */
export const Definition = Schema.Struct({ name: Name, targetKind: Target.Kind });
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
  options: { readonly targetKind: K },
): Definition<K> => {
  const definition = { name, targetKind: options.targetKind };
  Schema.asserts(Definition, definition);
  return definition;
};

/** Declares named actions using the group's target kind or an explicit override. */
export interface Group<K extends Target.Kind = Target.Kind> {
  readonly make: {
    (action: string): Definition<K>;
    <const Override extends Target.Kind>(
      action: string,
      options: { readonly targetKind: Override },
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

  function makePermission(action: string): Definition<K>;
  function makePermission<const Override extends Target.Kind>(
    action: string,
    options: { readonly targetKind: Override },
  ): Definition<Override>;
  function makePermission(
    action: string,
    override?: { readonly targetKind: Target.Kind },
  ): Definition {
    return make(`${namespace}.${Schema.NonEmptyString.make(action)}`, {
      targetKind: override === undefined ? defaultKind : override.targetKind,
    });
  }

  return { make: makePermission };
};

export * as Permission from "./permission.ts";
