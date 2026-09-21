import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadParticipationId } from "./id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { GroupMembership } from "../../group/membership/membership.ts";
import { Identity } from "../../identity/identity.ts";
export const Id = ThreadParticipationId.Id;
export type Id = ThreadParticipationId.Id;
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  memberId: MemberId.Id,
  groupMembershipId: GroupMembership.Id,
  identity: Identity.MemberReference,
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
/** Public current-participant view. Routing identities and admission linkage remain internal. */
export const Summary = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  memberId: MemberId.Id,
  joinedAt: Record.fields.joinedAt,
  joinedAtSequence: Record.fields.joinedAtSequence,
});
export interface Summary extends Schema.Schema.Type<typeof Summary> {}
export const toSummary = (record: Record): Summary => ({
  id: record.id,
  workspaceId: record.workspaceId,
  threadId: record.threadId,
  memberId: record.memberId,
  joinedAt: record.joinedAt,
  joinedAtSequence: record.joinedAtSequence,
});
export const UnfollowInput = Schema.Struct({ threadId: ThreadId.Id, participationId: Id });
export interface UnfollowInput extends Schema.Schema.Type<typeof UnfollowInput> {}
/** Ends one specific admission, retaining its original joining boundary. */
export const Departure = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  ...UnfollowInput.fields,
  memberId: MemberId.Id,
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
