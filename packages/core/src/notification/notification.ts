import { Schema } from "effect";
import type { DateTime } from "effect";
import { Identity } from "../identity/identity.ts";
import { Entry } from "../journal/entry.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { GroupId } from "../group/id.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadParticipationId } from "../thread/participation/id.ts";
import { MemberId } from "../workspace/member/id.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("NotificationId"));
export type Id = typeof Id.Type;

/** A committed source entry in this notification's workspace; independent of a thread schema. */
export const Source = Schema.Struct({
  logId: Entry.LogId,
  entryId: Entry.Id,
});
export interface Source extends Schema.Schema.Type<typeof Source> {}

/**
 * The thread and timeline position of a notification's source activity, with the thread's group,
 * by which a reader's pending notifications are counted.
 */
export const ThreadReference = Schema.Struct({
  threadId: ThreadId.Id,
  groupId: GroupId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ThreadReference extends Schema.Schema.Type<typeof ThreadReference> {}

/**
 * Whose inbox a notification belongs to. People and agents are notified as one workspace
 * membership, keeping their identity kind: someone who rejoins under a new member ID starts with an
 * empty inbox, as with their groups, threads, and read positions. Triage is one workspace-local
 * recipient.
 */
export const Recipient = Schema.TaggedUnion({
  Human: { ...Identity.Reference.cases.Human.fields, memberId: MemberId.Id },
  Agent: { ...Identity.Reference.cases.Agent.fields, memberId: MemberId.Id },
  Contact: Identity.Reference.cases.Contact.fields,
  Triage: {},
});
export type Recipient = typeof Recipient.Type;

/** The recipient a member is notified as: their identity, within this membership. */
export const ofMember = <const I extends Identity.MemberReference>(
  memberId: MemberId.Id,
  identity: I,
) => Object.assign({}, identity, { memberId });

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
  /**
   * The source told this recipient something without asking anything of it, as another agent's
   * message tells an agent: settled when created, so it never waits for handling.
   */
  Informational: {},
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

/**
 * The notification that recorded thread activity generates for one selected recipient: pending,
 * or informational for an agent the activity asks no work of. Everything comes from the
 * activity's journal entry, so replay and the change feed reproduce the record exactly: its ID is
 * the entry and the recipient's participation.
 */
export const generated = (
  entry: { readonly logId: Entry.LogId; readonly id: Entry.Id; readonly recordedAt: DateTime.Utc },
  activity: {
    readonly workspaceId: WorkspaceId.Id;
    readonly groupId: GroupId.Id;
    readonly threadId: ThreadId.Id;
    readonly sequence: number;
  },
  selected: {
    readonly participationId: ThreadParticipationId.Id;
    readonly recipient: Recipient;
    readonly requestsWork: boolean;
  },
): Record => ({
  id: Id.make(JSON.stringify([entry.logId, entry.id, selected.participationId])),
  workspaceId: activity.workspaceId,
  source: { logId: entry.logId, entryId: entry.id },
  participationId: selected.participationId,
  thread: { threadId: activity.threadId, groupId: activity.groupId, sequence: activity.sequence },
  recipient: selected.recipient,
  recordedAt: entry.recordedAt,
  state:
    selected.recipient._tag === "Agent" && !selected.requestsWork
      ? { _tag: "Informational" }
      : { _tag: "Pending" },
});

export * as Notification from "./notification.ts";
