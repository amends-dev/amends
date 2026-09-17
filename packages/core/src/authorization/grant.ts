import { Schema } from "effect";
import { Permission } from "./permission.ts";
import { Scope } from "./scope.ts";

/**
 * A scoped allowance, with its recipient assigned separately. This schema checks
 * the stored shape; use schema(permission) to validate it against a domain definition.
 */
export const Value = Schema.Struct({
  permission: Permission.Name,
  scope: Scope.Value,
});
export interface Value extends Schema.Schema.Type<typeof Value> {}

/** Validate the permission name and scope using its trusted domain definition. */
export const schema = (permission: Permission.Definition) => {
  const definition = Permission.Definition.make(permission);
  return Value.check(
    Schema.makeFilter(({ permission: name, scope }) => {
      if (name !== definition.name) {
        return { path: ["permission"], issue: `Expected permission ${definition.name}` };
      }
      if (scope._tag === "Target" && scope.target._tag !== definition.targetKind) {
        return {
          path: ["scope", "target"],
          issue: `Permission ${definition.name} requires a ${definition.targetKind} target`,
        };
      }
      return undefined;
    }),
  );
};

/** Construct a scoped allowance; assigning it and authorizing the grantor are separate operations. */
export const make = (permission: Permission.Definition, scope: Scope.Value): Value =>
  schema(permission).make({ permission: permission.name, scope });

export * as Grant from "./grant.ts";
