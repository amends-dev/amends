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
export const keyOf = (participant: Participant): string =>
  Participant.match(participant, {
    Member: ({ memberId }) => `Member:${memberId}`,
    Contact: ({ contactId }) => `Contact:${contactId}`,
    Triage: () => "Triage",
  });

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
/** Public participant reference. Routing identities and admission linkage remain internal. */
export const PublicParticipant = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id },
  Contact: { contactId: Identity.ContactId },
  Triage: {},
});
export type PublicParticipant = typeof PublicParticipant.Type;
/** The member behind a participant or its public reference, when it is one. */
export const memberOf = (participant: Participant | PublicParticipant): MemberId.Id | undefined =>
  participant._tag === "Member" ? participant.memberId : undefined;
/** Public current-participant view. */
export const Summary = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  participant: PublicParticipant,
  joinedAt: Record.fields.joinedAt,
  joinedAtSequence: Record.fields.joinedAtSequence,
});
export interface Summary extends Schema.Schema.Type<typeof Summary> {}
export const toSummary = (record: Record): Summary => ({
  id: record.id,
  workspaceId: record.workspaceId,
  threadId: record.threadId,
  participant: Participant.match(record.participant, {
    Member: ({ memberId }): PublicParticipant => ({ _tag: "Member", memberId }),
    Contact: ({ contactId }): PublicParticipant => ({ _tag: "Contact", contactId }),
    Triage: (): PublicParticipant => ({ _tag: "Triage" }),
  }),
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
