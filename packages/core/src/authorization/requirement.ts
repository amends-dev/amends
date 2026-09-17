import { Schema } from "effect";
import { Permission } from "./permission.ts";
import { Target } from "./target.ts";

/**
 * A core-declared permission required on a concrete target. An operation's
 * requirements must all be satisfied; the acting member comes from Actor.Service.
 * Construction validates the pairing, not resource existence or authorization.
 */
export const Value = Schema.Struct({
  permission: Permission.Definition,
  target: Target.Reference,
}).check(
  Schema.makeFilter(({ permission, target }) =>
    permission.targetKind === target._tag
      ? undefined
      : {
          path: ["target"],
          issue: `Permission ${permission.name} requires a ${permission.targetKind} target`,
        },
  ),
);
export interface Value extends Schema.Schema.Type<typeof Value> {}

/** Construct a requirement for a target of the permission's declared kind. */
export const make = <K extends Target.Kind>(
  permission: Permission.Definition<K>,
  target: Target.Of<NoInfer<K>>,
): Value => Value.make({ permission, target });

export * as Requirement from "./requirement.ts";
