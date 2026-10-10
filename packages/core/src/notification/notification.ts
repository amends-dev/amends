import { Schema } from "effect";
import type { DateTime } from "effect";
import { Identity } from "../identity/identity.ts";
import { Entry } from "../journal/entry.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { GroupId } from "../group/id.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ThreadParticipationId } from "../thread/ThreadParticipationId.ts";
import { MemberId } from "../workspace/member/id.ts";
import { TurnId } from "../turn/id.ts";
import { DeliveryId } from "../channel/DeliveryId.ts";

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

/**
 * What accepted a notification and owns the work from then on: an agent's turn, for an agent's,
 * or a delivery, for a contact's.
 */
export const AcceptedBy = Schema.TaggedUnion({
  Turn: { turnId: TurnId.Id },
  Delivery: { deliveryId: DeliveryId.Id },
});
export type AcceptedBy = typeof AcceptedBy.Type;

/**
 * Where a notification stands. Pending waits for its recipient: a person sees it, an agent accepts
 * it into a turn, or a delivery accepts it to carry it to a contact, which owns the work from then
 * on. Seen is private to the person, kept outside the journal; the journal settles everything else.
 */
export const State = Schema.TaggedUnion({
  Pending: {},
  /** Its human recipient saw it. */
  Seen: { seenAt: Schema.DateTimeUtcFromString },
  /** An agent's turn, or a delivery to a contact, accepted it. */
  Accepted: { by: AcceptedBy, acceptedAt: Schema.DateTimeUtcFromString },
  /**
   * Settled without handling: an agent's input when its participation ends, or a person's pending
   * notifications from a group they no longer belong to, whose threads they cannot open.
   */
  Discarded: { reason: Schema.Literals(["participation-ended", "access-lost"]) },
  /**
   * The source told this recipient something without asking anything of it, as another agent's
   * message tells an agent: settled when created, so it never waits for handling.
   */
  Informational: {},
});
export type State = typeof State.Type;

/**
 * Only people see their notifications; only an agent's are accepted by a turn, and only a
 * contact's by a delivery.
 */
export const fitsRecipient = (recipient: Recipient, state: State) =>
  (!State.isAnyOf(["Seen"])(state) || Recipient.isAnyOf(["Human"])(recipient)) &&
  (!State.isAnyOf(["Accepted"])(state) ||
    (AcceptedBy.isAnyOf(["Turn"])(state.by)
      ? Recipient.isAnyOf(["Agent"])(recipient)
      : Recipient.isAnyOf(["Contact"])(recipient)));

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
      fitsRecipient(record.recipient, record.state) || "State does not match the recipient",
  ),
);
export interface Record extends Schema.Schema.Type<typeof Record> {}

/**
 * The notification that recorded thread activity generates for one selected recipient: pending,
 * or informational for an agent the activity asks no work of. Everything comes from the
 * activity's journal entry, so replay and the change feed reproduce the record exactly: its ID is
 * the entry and the recipient's participation.
 */
export const fromActivity = (
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
    Recipient.isAnyOf(["Agent"])(selected.recipient) && !selected.requestsWork
      ? { _tag: "Informational" }
      : { _tag: "Pending" },
});

export * as Notification from "./notification.ts";
