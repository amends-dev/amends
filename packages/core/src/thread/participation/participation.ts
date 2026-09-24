import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadParticipationId } from "./id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { GroupMembership } from "../../group/membership/membership.ts";
import { Identity } from "../../identity/identity.ts";
import { Notification } from "../../notification/notification.ts";
export const Id = ThreadParticipationId.Id;
export type Id = ThreadParticipationId.Id;
/**
 * Who takes part. Members participate through their current group admission; contacts and
 * triage take part without group access.
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
export type Participant = typeof Participant.Type;
/** The notification recipient that a participant routes to. */
export const recipientOf = (participant: Participant): Notification.Recipient =>
  Participant.match(participant, {
    Member: ({ identity }): Notification.Recipient => identity,
    Contact: ({ contactId }): Notification.Recipient => ({ _tag: "Contact", id: contactId }),
    Triage: (): Notification.Recipient => ({ _tag: "Triage" }),
  });
/** Active participation is unique per member, contact, or the thread's triage participant. */
export const keyOf = (participant: Participant | Reference): string =>
  participant._tag === "Member"
    ? `Member:${participant.memberId}`
    : participant._tag === "Contact"
      ? `Contact:${participant.contactId}`
      : "Triage";

export const Record = Schema.Struct({
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
export interface Record extends Schema.Schema.Type<typeof Record> {}
export const Admission = Schema.Struct({
  ...Record.fields,
  status: Schema.Literal("active"),
  endedAt: Schema.Null,
});
/**
 * A participant without routing identities or admission linkage: the public view of who takes
 * part, and how a workflow names the participants to admit.
 */
export const Reference = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id },
  Contact: { contactId: Identity.ContactId },
  Triage: {},
});
export type Reference = typeof Reference.Type;
/** The member behind a participant or its reference, when it is one. */
export const memberOf = (participant: Participant | Reference): MemberId.Id | undefined =>
  participant._tag === "Member" ? participant.memberId : undefined;
export const referenceOf = (participant: Participant): Reference =>
  Participant.match(participant, {
    Member: ({ memberId }): Reference => ({ _tag: "Member", memberId }),
    Contact: ({ contactId }): Reference => ({ _tag: "Contact", contactId }),
    Triage: (): Reference => ({ _tag: "Triage" }),
  });
/** A page of current participants in binary participation-ID order, after the exclusive cursor. */
export const ListOptions = Schema.Struct({
  after: Schema.optionalKey(Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}
/** Public current-participant view. */
export const Summary = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  participant: Reference,
  joinedAt: Record.fields.joinedAt,
  joinedAtSequence: Record.fields.joinedAtSequence,
});
export interface Summary extends Schema.Schema.Type<typeof Summary> {}
export const toSummary = (record: Record): Summary => ({
  id: record.id,
  workspaceId: record.workspaceId,
  threadId: record.threadId,
  participant: referenceOf(record.participant),
  joinedAt: record.joinedAt,
  joinedAtSequence: record.joinedAtSequence,
});
export const UnfollowInput = Schema.Struct({ threadId: ThreadId.Id, participationId: Id });
export interface UnfollowInput extends Schema.Schema.Type<typeof UnfollowInput> {}
/** Ends one specific participation, retaining its original joining boundary. */
export const Departure = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  ...UnfollowInput.fields,
});
export interface Departure extends Schema.Schema.Type<typeof Departure> {}
export const EndReason = Schema.Literals([
  "unfollowed",
  "group-left",
  "group-removed",
  "workspace-removed",
]);
export type EndReason = typeof EndReason.Type;
export * as ThreadParticipation from "./participation.ts";
