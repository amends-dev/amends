import { Schema } from "effect";
import { Permission } from "./permission.ts";
import { Scope } from "./scope.ts";

/**
 * A scoped allowance, with its recipient assigned separately. This schema checks
 * the stored shape; use makeSchema(permission) to validate it against a domain definition.
 */
export const Value = Schema.Struct({
  permission: Permission.Name,
  scope: Scope.Value,
});
export interface Value extends Schema.Schema.Type<typeof Value> {}

/**
 * Construct a schema that validates permission names and scopes against a trusted domain definition.
 *
 * @category constructors
 */
export const makeSchema = (permission: Permission.Definition) => {
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

/**
 * Construct a scoped allowance; assigning it and authorizing the grantor are separate operations.
 *
 * @category constructors
 */
export const make = (permission: Permission.Definition, scope: Scope.Value): Value =>
  makeSchema(permission).make({ permission: permission.name, scope });

export * as Grant from "./grant.ts";
