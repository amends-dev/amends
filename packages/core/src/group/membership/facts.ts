import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { GroupMembership } from "./membership.ts";

export const Added = Fact.make("group.membership.added", {
  version: 1,
  subject: (payload) => Subject.make("group-membership", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({ ...GroupMembership.Record.fields, status: Schema.Literal("active") }),
});

/** Ends exactly one admission. Rejoining records Added with a fresh ID. */
export const Removed = Fact.make("group.membership.removed", {
  version: 1,
  subject: (payload) => Subject.make("group-membership", payload.membershipId),
  occurrence: (payload) => [payload.membershipId],
  payload: GroupMembership.Removal,
});

export * as GroupMembershipFacts from "./facts.ts";
