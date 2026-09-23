import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Entry } from "../journal/entry.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadParticipationId } from "../thread/participation/id.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("NotificationId"));
export type Id = typeof Id.Type;

/** A committed source entry in this notification's workspace; independent of a thread schema. */
export const Source = Schema.Struct({
  logId: Entry.LogId,
  entryId: Entry.Id,
});
export interface Source extends Schema.Schema.Type<typeof Source> {}

/** The thread and timeline position of a notification's source activity. */
export const ThreadReference = Schema.Struct({
  threadId: ThreadId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ThreadReference extends Schema.Schema.Type<typeof ThreadReference> {}

/** Triage is one workspace-local recipient; people and agents retain their identity kind. */
export const Recipient = Schema.TaggedUnion({
  Human: Identity.Reference.cases.Human.fields,
  Agent: Identity.Reference.cases.Agent.fields,
  Contact: Identity.Reference.cases.Contact.fields,
  Triage: {},
});
export type Recipient = typeof Recipient.Type;

/** Extend with durable handoff outcomes when the owning turn/delivery workflows exist. */
export const AcknowledgmentOutcome = Schema.TaggedUnion({ Seen: {} });
export type AcknowledgmentOutcome = typeof AcknowledgmentOutcome.Type;

export const Acknowledgment = Schema.Struct({
  outcome: AcknowledgmentOutcome,
  acknowledgedAt: Schema.DateTimeUtcFromString,
});
export interface Acknowledgment extends Schema.Schema.Type<typeof Acknowledgment> {}

/** The outcome determines which recipient contract can record an acknowledgment. */
export const acceptsAcknowledgment = (recipient: Recipient, outcome: AcknowledgmentOutcome) =>
  AcknowledgmentOutcome.match(outcome, { Seen: () => recipient._tag === "Human" });

export const State = Schema.TaggedUnion({
  Pending: {},
  Discarded: { reason: Schema.Literal("participation-ended") },
  Acknowledged: Acknowledgment.fields,
});
export type State = typeof State.Type;

/**
 * One recipient's notification of a recorded source. Generation chooses
 * a stable ID and recorded time from historical input, including on replay.
 * Source existence and recipient selection are responsibilities of that workflow.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  source: Source,
  /** Present for thread-generated member notifications; ties pending work to one participation. */
  participationId: Schema.optionalKey(ThreadParticipationId.Id),
  /** Present for thread-activity notifications; lets reading a thread settle its notifications. */
  thread: Schema.optionalKey(ThreadReference),
  recipient: Recipient,
  recordedAt: Schema.DateTimeUtcFromString,
  state: State,
}).check(
  Schema.makeFilter(
    (record) =>
      record.state._tag !== "Acknowledged" ||
      acceptsAcknowledgment(record.recipient, record.state.outcome) ||
      "Acknowledgment outcome does not match the recipient",
  ),
);
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Notification from "./notification.ts";
