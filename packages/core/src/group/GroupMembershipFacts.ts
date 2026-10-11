import { Schema } from "effect";
import * as Fact from "../journal/Fact.ts";
import * as Subject from "../journal/Subject.ts";
import * as Member from "../workspace/Member.ts";
import * as Group from "./Group.ts";
import * as GroupMembership from "./GroupMembership.ts";

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
