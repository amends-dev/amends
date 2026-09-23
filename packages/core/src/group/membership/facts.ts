import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { Member } from "../../workspace/member/member.ts";
import { Group } from "../group.ts";
import { GroupMembership } from "./membership.ts";

/** The group's members learn who joined, and so does the joining member. */
export const Added = Fact.make("group.membership.added", {
  audience: (payload) => [Group.audienceOf(payload.groupId), Member.audienceOf(payload.memberId)],
  version: 1,
  subject: (payload) => Subject.make("group-membership", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({ ...GroupMembership.Record.fields, status: Schema.Literal("active") }),
});

/** Ends exactly one admission. Rejoining records Added with a fresh ID. */
export const Removed = Fact.make("group.membership.removed", {
  audience: (payload) => [Group.audienceOf(payload.groupId), Member.audienceOf(payload.memberId)],
  version: 1,
  subject: (payload) => Subject.make("group-membership", payload.membershipId),
  occurrence: (payload) => [payload.membershipId],
  payload: GroupMembership.Removal,
});

export * as GroupMembershipFacts from "./facts.ts";
