/**
 * One permission an operation needs on one target. Operations build requirements with `make` from
 * a permission's definition and pass them to `Authorization.require`, which checks them all for the
 * acting member; `Grant.anyCovers` decides whether a member's grants satisfy one. `make` holds a
 * target to the permission's declared kind in its types, and the schema checks the pairing again
 * for a requirement built any other way.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Permission from "./Permission.ts"
import * as Target from "./Target.ts"

/**
 * A core-declared permission required on a concrete target. An operation's requirements must all
 * be satisfied; the acting member comes from `Actor.Actor`. Construction validates the pairing, not
 * resource existence or authorization.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Requirement = Schema.Struct({
  permission: Permission.Reference,
  target: Target.Reference
}).check(
  Schema.makeFilter(({ permission, target }) =>
    Target.Reference.isAnyOf([permission.targetKind])(target)
      ? undefined
      : {
          path: ["target"],
          issue: `Permission ${permission.name} requires a ${permission.targetKind} target`
        }
  )
)
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Requirement extends Schema.Schema.Type<typeof Requirement> {}

/**
 * Construct a requirement for a target of the permission's declared kind.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <K extends Target.Kind>(
  permission: Permission.Definition<K>,
  target: Target.Of<NoInfer<K>>
): Requirement =>
  Requirement.make({
    permission: { name: permission.name, targetKind: permission.targetKind },
    target
  })
