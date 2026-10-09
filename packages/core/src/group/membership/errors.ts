import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Group } from "../group.ts";
import { GroupMembership } from "./membership.ts";

/** The outcomes `GroupMembershipService` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "GroupMembershipService.AlreadyMember",
  { groupId: Group.Id, memberId: Member.Id },
) {}

export class AlreadyRemoved extends Schema.TaggedError<AlreadyRemoved>()(
  "GroupMembershipService.AlreadyRemoved",
  GroupMembership.RemoveInput.fields,
) {}

/** A direct group's members never change; including someone else needs another direct group. */
export class FixedMembership extends Schema.TaggedError<FixedMembership>()(
  "GroupMembershipService.FixedMembership",
  { groupId: Group.Id },
) {}

/**
 * Everyone in the workspace belongs to its general group: nobody leaves it or is removed from it.
 * Leaving the workspace ends the admission.
 */
export class GeneralMembership extends Schema.TaggedError<GeneralMembership>()(
  "GroupMembershipService.GeneralMembership",
  { groupId: Group.Id },
) {}

export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupMembershipService.GroupNotFound",
  { groupId: Group.Id },
) {}

export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupMembershipService.InactiveMember",
  { memberId: Member.Id },
) {}

export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupMembershipService.MemberNotFound",
  { memberId: Member.Id },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "GroupMembershipService.NotFound",
  GroupMembership.RemoveInput.fields,
) {}

export * as GroupMembershipErrors from "./errors.ts";
