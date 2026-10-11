import { Schema } from "effect";
import * as Permission from "./Permission.ts";
import * as Target from "./Target.ts";

/**
 * A core-declared permission required on a concrete target. An operation's
 * requirements must all be satisfied; the acting member comes from Actor.Actor.
 * Construction validates the pairing, not resource existence or authorization.
 */
export const Value = Schema.Struct({
  permission: Permission.Reference,
  target: Target.Reference,
}).check(
  Schema.makeFilter(({ permission, target }) =>
    Target.Reference.isAnyOf([permission.targetKind])(target)
      ? undefined
      : {
          path: ["target"],
          issue: `Permission ${permission.name} requires a ${permission.targetKind} target`,
        },
  ),
);
export interface Value extends Schema.Schema.Type<typeof Value> {}

/**
 * Construct a requirement for a target of the permission's declared kind.
 *
 * @category constructors
 */
export const make = <K extends Target.Kind>(
  permission: Permission.Definition<K>,
  target: Target.Of<NoInfer<K>>,
): Value =>
  Value.make({
    permission: { name: permission.name, targetKind: permission.targetKind },
    target,
  });
