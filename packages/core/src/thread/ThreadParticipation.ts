/**
 * Who takes part in a thread, and from where in it. A participation begins when a member replies,
 * is mentioned, follows, or starts the thread, or when a workflow admits a contact or triage, and
 * it ends when they unfollow or leave the group. Participants are whom activity can notify;
 * reading a thread needs no participation. `ThreadParticipationService` is the operations.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as ThreadId from "./ThreadId.ts";
import * as ThreadParticipationId from "./ThreadParticipationId.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as GroupMembership from "../group/GroupMembership.ts";
import * as Identity from "../identity/Identity.ts";
import * as Notification from "../notification/Notification.ts";

/**
 * Names a participation; `ThreadParticipationId.Id`, where models that only refer to
 * participations import it from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = ThreadParticipationId.Id;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = ThreadParticipationId.Id;

/**
 * Who takes part. Members participate through their current group admission, and carry the
 * identity they are notified as; contacts and triage take part without group access.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Participant = Schema.TaggedUnion({
  Member: {
    memberId: MemberId.Id,
    groupMembershipId: GroupMembership.Id,
    identity: Identity.MemberReference,
  },
  Contact: { contactId: Identity.ContactId },
  Triage: {},
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Participant = typeof Participant.Type;

/**
 * The notification recipient that a participant routes to.
 *
 * @category utils
 * @since 0.1.0
 */
export const recipientOf = (participant: Participant): Notification.Recipient =>
  Participant.match(participant, {
    Member: ({ memberId, identity }): Notification.Recipient =>
      Notification.ofMember(memberId, identity),
    Contact: ({ contactId }): Notification.Recipient => ({ _tag: "Contact", id: contactId }),
    Triage: (): Notification.Recipient => ({ _tag: "Triage" }),
  });

/**
 * The key under which a participant is unique in a thread: a member, a contact, or the thread's
 * one triage participant. A participant and its reference share a key.
 *
 * @category utils
 * @since 0.1.0
 */
export const keyOf = (participant: Participant | Reference): string =>
  Reference.isAnyOf(["Member"])(participant)
    ? `Member:${participant.memberId}`
    : Reference.isAnyOf(["Contact"])(participant)
      ? `Contact:${participant.contactId}`
      : "Triage";

/**
 * One participant's spell of taking part in a thread: from the position they joined at, which
 * bounds the history that was before them, until it ended, if it has.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ThreadParticipation = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  participant: Participant,
  joinedAt: Schema.DateTimeUtcFromString,
  joinedAtSequence: Schema.Int.check(Schema.isGreaterThan(0)),
  status: Schema.Literals(["active", "ended"]),
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}).check(
  Schema.makeFilter(
    (record) =>
      (record.status === "active" ? record.endedAt === null : record.endedAt !== null) ||
      "Participation status and departure time must agree",
  ),
);

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ThreadParticipation extends Schema.Schema.Type<typeof ThreadParticipation> {}

/**
 * A participation as it begins: active and not ended. What `ThreadParticipationFacts.Added`
 * records.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Admission = Schema.Struct({
  ...ThreadParticipation.fields,
  status: Schema.Literal("active"),
  endedAt: Schema.Null,
});

/**
 * A participant without routing identities or admission linkage: the public view of who takes
 * part, and how a workflow names the participants to admit.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id },
  Contact: { contactId: Identity.ContactId },
  Triage: {},
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Reference = typeof Reference.Type;

/**
 * The member behind a participant or its reference, when it is one.
 *
 * @category utils
 * @since 0.1.0
 */
export const memberOf = (participant: Participant | Reference): MemberId.Id | undefined =>
  Reference.isAnyOf(["Member"])(participant) ? participant.memberId : undefined;

/**
 * A participant's public reference.
 *
 * @category utils
 * @since 0.1.0
 */
export const referenceOf = (participant: Participant): Reference =>
  Participant.match(participant, {
    Member: ({ memberId }): Reference => ({ _tag: "Member", memberId }),
    Contact: ({ contactId }): Reference => ({ _tag: "Contact", contactId }),
    Triage: (): Reference => ({ _tag: "Triage" }),
  });

/**
 * One page of current participants in binary participation-ID order: at most `limit`, after the
 * exclusive `after` cursor, or the first without one.
 *
 * @category options
 * @since 0.1.0
 */
export const ListOptions = Schema.Struct({
  after: Schema.optionalKey(Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/**
 * A current participant as readers see them: their public reference and where they joined,
 * without routing identities or admission linkage.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Summary = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  participant: Reference,
  joinedAt: ThreadParticipation.fields.joinedAt,
  joinedAtSequence: ThreadParticipation.fields.joinedAtSequence,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Summary extends Schema.Schema.Type<typeof Summary> {}

/**
 * A participation as readers see it.
 *
 * @category utils
 * @since 0.1.0
 */
export const toSummary = (record: ThreadParticipation): Summary => ({
  id: record.id,
  workspaceId: record.workspaceId,
  threadId: record.threadId,
  participant: referenceOf(record.participant),
  joinedAt: record.joinedAt,
  joinedAtSequence: record.joinedAtSequence,
});

/**
 * The participation to end: the actor's own, in the thread named.
 *
 * @category options
 * @since 0.1.0
 */
export const UnfollowInput = Schema.Struct({ threadId: ThreadId.Id, participationId: Id });

/**
 * @category options
 * @since 0.1.0
 */
export interface UnfollowInput extends Schema.Schema.Type<typeof UnfollowInput> {}

/**
 * The ending of one participation, which keeps its joining position. What
 * `ThreadParticipationFacts.Ended` records, with the reason.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Departure = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  ...UnfollowInput.fields,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Departure extends Schema.Schema.Type<typeof Departure> {}

/**
 * Why a participation ended. Only unfollowing records an ending now; the departure reasons name
 * endings recorded before a group departure ended participations itself, and stay readable.
 *
 * @category schemas
 * @since 0.1.0
 */
export const EndReason = Schema.Literals([
  "unfollowed",
  "group-left",
  "group-removed",
  "workspace-removed",
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type EndReason = typeof EndReason.Type;
