/**
 * The subject of a fact: the entity it changes, as a `kind:id` key within the workspace, such as
 * `thread:<id>`. Every fact declares a pure `subject` rule, and the journal stores the subject on
 * the event's header, so `journal.read` can select one entity's facts across names and versions;
 * `Event.decode` checks it again against the rule. Subjects are independent of authorization
 * targets.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";

const Kind = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/));

/**
 * A namespaced entity key within a workspace: a lowercase kind, a colon, and a nonempty ID, which
 * may itself contain colons.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Subject = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*:.+$/s)).pipe(
  Schema.brand("FactSubject"),
);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Subject = typeof Subject.Type;

/**
 * The subject of the entity `id` of `kind`, such as `Subject.make("thread", threadId)`. The kind
 * keeps keys of different entities apart even when their IDs match. Throws on an invalid kind or
 * an empty ID.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (kind: string, id: string): Subject =>
  Subject.make(`${Kind.make(kind)}:${Schema.NonEmptyString.make(id)}`);
