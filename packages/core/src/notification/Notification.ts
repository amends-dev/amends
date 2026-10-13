/**
 * A notification is one recipient's reference to a committed thread activity, and where its
 * handling stands. Recorded activity is its only source: `NotificationProjection` generates one,
 * with `fromActivity`, for each recipient the activity selected, and `NotificationStore` keeps
 * them. A person sees theirs, a turn accepts an agent's, and a delivery a contact's. A person's
 * `Seen` is private state outside the journal; the journal settles everything else.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import type * as DateTime from "effect/DateTime";
import * as Identity from "../identity/Identity.ts";
import * as Entry from "../journal/Entry.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as GroupId from "../group/GroupId.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as TurnId from "../turn/TurnId.ts";
import * as DeliveryId from "../channel/DeliveryId.ts";

/**
 * Names a notification. One generated from thread activity is named by its source entry and the
 * recipient's participation, so replay names it the same.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("NotificationId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;

/**
 * The committed journal entry a notification tells of, by log and entry, in the notification's
 * workspace. It names an entry rather than a thread, so it depends on no thread schema.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Source = Schema.Struct({
  logId: Entry.LogId,
  entryId: Entry.Id,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Source extends Schema.Schema.Type<typeof Source> {}

/**
 * The thread and timeline position of a notification's source activity, with the thread's group,
 * by which a reader's pending notifications are counted.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ThreadReference = Schema.Struct({
  threadId: ThreadId.Id,
  groupId: GroupId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ThreadReference extends Schema.Schema.Type<typeof ThreadReference> {}

/**
 * Whose inbox a notification belongs to. People and agents are notified as one workspace
 * membership, keeping their identity kind: someone who rejoins under a new member ID starts with an
 * empty inbox, as with their groups, threads, and read positions. Triage is one workspace-local
 * recipient.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Recipient = Schema.TaggedUnion({
  Human: { ...Identity.Reference.cases.Human.fields, memberId: MemberId.Id },
  Agent: { ...Identity.Reference.cases.Agent.fields, memberId: MemberId.Id },
  Contact: Identity.Reference.cases.Contact.fields,
  Triage: {},
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Recipient = typeof Recipient.Type;

/**
 * The recipient a member is notified as: their identity, within this membership.
 *
 * @category constructors
 * @since 0.1.0
 */
export const ofMember = <const I extends Identity.MemberReference>(
  memberId: MemberId.Id,
  identity: I,
) => Object.assign({}, identity, { memberId });

/**
 * What accepted a notification and owns the work from then on: an agent's turn, for an agent's,
 * or a delivery, for a contact's.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AcceptedBy = Schema.TaggedUnion({
  Turn: { turnId: TurnId.Id },
  Delivery: { deliveryId: DeliveryId.Id },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type AcceptedBy = typeof AcceptedBy.Type;

/**
 * Where a notification stands. Pending waits for its recipient: a person sees it, an agent accepts
 * it into a turn, or a delivery accepts it to carry it to a contact, which owns the work from then
 * on. Seen is private to the person, kept outside the journal; the journal settles everything else.
 *
 * @category schemas
 * @since 0.1.0
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

/**
 * @category schemas
 * @since 0.1.0
 */
export type State = typeof State.Type;

/**
 * Only people see their notifications; only an agent's are accepted by a turn, and only a
 * contact's by a delivery. `Notification` holds every notification to this.
 *
 * @category utils
 * @since 0.1.0
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
 *
 * @category schemas
 * @since 0.1.0
 */
export const Notification = Schema.Struct({
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

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Notification extends Schema.Schema.Type<typeof Notification> {}

/**
 * The notification that recorded thread activity generates for one selected recipient: pending,
 * or informational for an agent the activity asks no work of. Everything comes from the
 * activity's journal entry, so replay and the change feed reproduce the record exactly: its ID is
 * the entry and the recipient's participation.
 *
 * @category constructors
 * @since 0.1.0
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
): Notification => ({
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
