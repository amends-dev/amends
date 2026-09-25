import { Schema } from "effect";
import { Subject } from "../../journal/subject.ts";
import { ThreadId } from "../id.ts";
import { ThreadParticipationId } from "../participation/id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { Notification } from "../../notification/notification.ts";
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadActivityId"));
export type Id = typeof Id.Type;
/**
 * An activity kind: a dotted name its owning domain chooses, such as `message.published` or
 * `turn.started`. The kind's definition gives the activity's details their meaning.
 */
export const Kind = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/),
).pipe(Schema.brand("ThreadActivityKind"));
export type Kind = typeof Kind.Type;
export const Common = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.DateTimeUtcFromString,
});
/**
 * One item of a thread's timeline, in the shape every kind shares. Storage, facts, and the change
 * feed carry it as it is, so adding a kind changes none of them; its definition reads its details.
 */
export const Record = Schema.Struct({
  ...Common.fields,
  kind: Kind,
  /** What the activity is about, such as a message, participation, turn, or task. */
  subject: Subject.Value,
  /** A workspace holds at most one activity with a key; null leaves the activity repeatable. */
  occurrence: Schema.NullOr(Schema.NonEmptyString),
  /** Whether it counts as the thread's and its group's latest activity for readers. */
  newActivity: Schema.Boolean,
  /** The change the activity reports, in its kind's encoded form. */
  details: Schema.Json,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}
/** Historical recipient selection, recorded with the activity rather than recomputed on replay. */
export const Recipient = Schema.Struct({
  participationId: ThreadParticipationId.Id,
  recipient: Notification.Recipient,
  /**
   * Whether the activity asks this recipient for work: an agent to take it into a turn. People
   * are told, never asked, and an agent's own messages ask no work of other agents.
   */
  requestsWork: Schema.Boolean,
});
export interface Recipient extends Schema.Schema.Type<typeof Recipient> {}
export * as ThreadActivity from "./activity.ts";
