import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Group } from "../group.ts";
import { GroupMembership } from "./membership.ts";

/** The outcomes `GroupMembershipApplication` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "GroupMembershipApplication.AlreadyMember",
  { groupId: Group.Id, memberId: Member.Id },
) {}
export class AlreadyRemoved extends Schema.TaggedError<AlreadyRemoved>()(
  "GroupMembershipApplication.AlreadyRemoved",
  GroupMembership.RemoveInput.fields,
) {}
/** A direct group's members never change; including someone else needs another direct group. */
export class FixedMembership extends Schema.TaggedError<FixedMembership>()(
  "GroupMembershipApplication.FixedMembership",
  { groupId: Group.Id },
) {}
/**
 * Everyone in the workspace belongs to its general group: nobody leaves it or is removed from it.
 * Leaving the workspace ends the admission.
 */
export class GeneralMembership extends Schema.TaggedError<GeneralMembership>()(
  "GroupMembershipApplication.GeneralMembership",
  { groupId: Group.Id },
) {}
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupMembershipApplication.GroupNotFound",
  { groupId: Group.Id },
) {}
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupMembershipApplication.InactiveMember",
  { memberId: Member.Id },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupMembershipApplication.MemberNotFound",
  { memberId: Member.Id },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()(
  "GroupMembershipApplication.NotFound",
  GroupMembership.RemoveInput.fields,
) {}

export * as GroupMembershipErrors from "./errors.ts";
