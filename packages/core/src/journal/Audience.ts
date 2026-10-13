/**
 * Who may learn of a fact beyond the projections that apply it. A fact declares its audience as
 * scopes, `workspace` or `kind:id`, and a consumer such as the change feed derives them with
 * `Fact.makeAudience` when it decodes an event: they are not stored with the entry, so correcting
 * a rule also corrects delivery of earlier history. Owning domains name their kinds once, such as
 * `Group.audienceOf`, and the consumer decides which scopes each reader holds.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"

const Kind = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/))

/**
 * One delivery scope: every member of the workspace, or the readers of one kind and ID, such as
 * a group or a member. A fact declares its scopes; a consumer decides which scopes each reader
 * holds.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Scope = Schema.String.check(Schema.isPattern(/^(?:workspace|[a-z][a-z0-9-]*:.+)$/s)).pipe(
  Schema.brand("AudienceScope")
)

/**
 * @category schemas
 * @since 0.1.0
 */
export type Scope = typeof Scope.Type

/**
 * The scope every member of the workspace holds, for facts about the workspace itself, such as
 * its members and roles.
 *
 * @category constructors
 * @since 0.1.0
 */
export const workspace: Scope = Scope.make("workspace")

/**
 * The scope of the readers of one kind and ID, such as `group:<id>`. The kind is lowercase letters,
 * digits, and hyphens, starting with a letter; the ID is nonempty and may contain colons. Throws
 * on an invalid kind or an empty ID.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (kind: string, id: string): Scope =>
  Scope.make(`${Kind.make(kind)}:${Schema.NonEmptyString.make(id)}`)

/**
 * Who may learn of a fact beyond the projections that apply it: a reader holding any one of
 * these distinct scopes. An empty audience keeps the fact internal.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Audience = Schema.UniqueArray(Scope)

/**
 * @category schemas
 * @since 0.1.0
 */
export type Audience = typeof Audience.Type

/**
 * The empty audience: nothing outside the fact's projections learns of it. `Fact.makeAudience`
 * returns it for a fact that declares no audience.
 *
 * @category constructors
 * @since 0.1.0
 */
export const internal: Audience = []
