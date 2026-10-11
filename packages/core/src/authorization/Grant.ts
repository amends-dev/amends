import * as Target from "./Target.ts";
import { Schema } from "effect";
import * as Permission from "./Permission.ts";
import type * as Requirement from "./Requirement.ts";
import * as Scope from "./Scope.ts";

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
      if (
        Scope.Value.isAnyOf(["Target"])(scope) &&
        !Target.Reference.isAnyOf([definition.targetKind])(scope.target)
      ) {
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

/** Whether any of these grants allows a requirement: its permission, in a scope covering its target. */
export const anyCovers = (grants: ReadonlyArray<Value>, requirement: Requirement.Value) =>
  grants.some(
    (grant) =>
      grant.permission === requirement.permission.name &&
      Scope.covers(grant.scope, requirement.target),
  );
