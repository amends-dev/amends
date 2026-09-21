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
export * as ThreadParticipation from "./participation.ts";
