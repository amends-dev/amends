/**
 * One item of a thread's timeline, in the shape every kind shares: its position, a dotted kind
 * name, what it is about, and the kind's details as JSON. Storage, facts, and the change feed carry
 * this shape and nothing more, so adding a kind changes none of them; `ThreadActivityKind` defines
 * a kind and reads its details.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Subject from "../journal/Subject.ts"
import * as Notification from "../notification/Notification.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ThreadId from "./ThreadId.ts"
import * as ThreadParticipationId from "./ThreadParticipationId.ts"

/**
 * Names an activity.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ThreadActivityId = Schema.NonEmptyString.pipe(Schema.brand("ThreadActivityId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type ThreadActivityId = typeof ThreadActivityId.Type

/**
 * An activity kind's name: dotted, chosen by the domain that owns the kind, such as
 * `message.published` or `turn.started`. The kind's definition gives the activity's details their
 * meaning.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Kind = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)).pipe(
  Schema.brand("ThreadActivityKind")
)

/**
 * @category schemas
 * @since 0.1.0
 */
export type Kind = typeof Kind.Type

/**
 * What every activity has whatever its kind: its identity, its thread, its position there, and
 * when it occurred. A kind's decoded activity, `ThreadActivityKind.Activity`, builds on this.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Common = Schema.Struct({
  id: ThreadActivityId,
  workspaceId: WorkspaceId.WorkspaceId,
  threadId: ThreadId.ThreadId,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.DateTimeUtcFromString
})

/**
 * An activity as recorded and stored, with its details in their kind's encoded form.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ThreadActivity = Schema.Struct({
  ...Common.fields,
  kind: Kind,
  /** The version of its kind's details it was recorded with; a kind whose details change takes the next. */
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  /** What the activity is about, such as a message, participation, turn, or task. */
  subject: Subject.Subject,
  /** A workspace holds at most one activity with a key; null leaves the activity repeatable. */
  occurrence: Schema.NullOr(Schema.NonEmptyString),
  /** Whether it counts as the thread's and its group's latest activity for readers. */
  newActivity: Schema.Boolean,
  /** The change the activity reports, in its kind's encoded form. */
  details: Schema.Json
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ThreadActivity extends Schema.Schema.Type<typeof ThreadActivity> {}

/**
 * One participant an activity selected to be told of it, as selected when the activity was
 * recorded: notifications come from this record, never from recomputing who took part.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Recipient = Schema.Struct({
  participationId: ThreadParticipationId.ThreadParticipationId,
  recipient: Notification.Recipient,
  /**
   * Whether the activity asks this recipient for work: an agent to take it into a turn. People
   * are told, never asked, and an agent's own messages ask no work of other agents.
   */
  requestsWork: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Recipient extends Schema.Schema.Type<typeof Recipient> {}
