/**
 * What a grant covers: a whole workspace, or one exact target in it. `Grant.Grant` carries a scope,
 * a role assignment in `Assignment.Source` records one, and `covers` is how `Grant.anyCovers`
 * decides whether a grant reaches a requirement's target. A scope names resources only: the
 * permission, its target kind, and the member's current grants are `Authorization`'s concern.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Target from "./Target.ts"

/**
 * The resources a grant covers: a whole workspace or one exact target.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Scope = Schema.TaggedUnion({
  Workspace: { workspaceId: WorkspaceId.WorkspaceId },
  Target: { target: Target.Reference }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Scope = typeof Scope.Type

const sameTarget = Schema.toEquivalence(Target.Reference)

/**
 * Whether a scope reaches a target: a workspace scope covers every target in that workspace, and
 * an exact scope only the same target. Authorization checks the permission, its target kind, and
 * the acting member's current grants beside it.
 *
 * @category utils
 * @since 0.1.0
 */
export const covers = (scope: Scope, target: Target.Reference): boolean =>
  Scope.match(scope, {
    Workspace: ({ workspaceId }) => workspaceId === target.workspaceId,
    Target: ({ target: exact }) => sameTarget(exact, target)
  })
