/**
 * A grant: one permission in one scope, which an assignment gives a member directly or through a
 * role. `GrantResolver` resolves a member's assignments into grants, and `Authorization` checks a
 * requirement against them with `anyCovers`. `makeSchema` ties the stored shape to a permission's
 * definition, so a grant's exact scope targets the kind the permission declares.
 *
 * @since 0.1.0
 */
import * as Target from "./Target.ts";
import * as Schema from "effect/Schema";
import * as Permission from "./Permission.ts";
import type * as Requirement from "./Requirement.ts";
import * as Scope from "./Scope.ts";

/**
 * A scoped allowance, with its recipient assigned separately. This schema checks the stored shape;
 * `makeSchema` validates it against a domain definition.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Grant = Schema.Struct({
  permission: Permission.Name,
  scope: Scope.Scope,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Grant extends Schema.Schema.Type<typeof Grant> {}

/**
 * Construct a schema that validates permission names and scopes against a trusted domain
 * definition.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeSchema = (permission: Permission.Definition) => {
  const definition = Permission.Definition.make(permission);
  return Grant.check(
    Schema.makeFilter(({ permission: name, scope }) => {
      if (name !== definition.name) {
        return { path: ["permission"], issue: `Expected permission ${definition.name}` };
      }
      if (
        Scope.Scope.isAnyOf(["Target"])(scope) &&
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
 * @since 0.1.0
 */
export const make = (permission: Permission.Definition, scope: Scope.Scope): Grant =>
  makeSchema(permission).make({ permission: permission.name, scope });

/**
 * Whether any of these grants allows a requirement: its permission, in a scope covering its
 * target.
 *
 * @category utils
 * @since 0.1.0
 */
export const anyCovers = (grants: ReadonlyArray<Grant>, requirement: Requirement.Requirement) =>
  grants.some(
    (grant) =>
      grant.permission === requirement.permission.name &&
      Scope.covers(grant.scope, requirement.target),
  );
