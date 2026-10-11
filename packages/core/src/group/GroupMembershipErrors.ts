/**
 * The outcomes `GroupMembershipService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's error types add the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Group from "./Group.ts";
import * as GroupMembership from "./GroupMembership.ts";

/**
 * The member to add already holds an active admission to the group; nothing is recorded.
 *
 * @category errors
 * @since 0.1.0
 */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "GroupMembershipService.AlreadyMember",
  { groupId: Group.Id, memberId: Member.Id },
) {}

/**
 * The admission has already ended; repeating a departure records nothing.
 *
 * @category errors
 * @since 0.1.0
 */
export class AlreadyRemoved extends Schema.TaggedError<AlreadyRemoved>()(
  "GroupMembershipService.AlreadyRemoved",
  GroupMembership.RemoveInput.fields,
) {}

/**
 * A direct group's members never change; including someone else needs another direct group.
 *
 * @category errors
 * @since 0.1.0
 */
export class FixedMembership extends Schema.TaggedError<FixedMembership>()(
  "GroupMembershipService.FixedMembership",
  { groupId: Group.Id },
) {}

/**
 * Everyone in the workspace belongs to its general group: nobody leaves it or is removed from it.
 * Leaving the workspace ends the admission.
 *
 * @category errors
 * @since 0.1.0
 */
export class GeneralMembership extends Schema.TaggedError<GeneralMembership>()(
  "GroupMembershipService.GeneralMembership",
  { groupId: Group.Id },
) {}

/**
 * The group is missing, or the actor is not in it; for joining, also one that cannot be joined, a
 * private or direct group. None are told apart, so nothing discloses a group to someone outside
 * it.
 *
 * @category errors
 * @since 0.1.0
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "GroupMembershipService.GroupNotFound",
  { groupId: Group.Id },
) {}

/**
 * The member to add is no longer active in the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupMembershipService.InactiveMember",
  { memberId: Member.Id },
) {}

/**
 * The member to add is not in the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupMembershipService.MemberNotFound",
  { memberId: Member.Id },
) {}

/**
 * The admission is missing, is in another group than the one named, or, when leaving, is another
 * member's; none are told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "GroupMembershipService.NotFound",
  GroupMembership.RemoveInput.fields,
) {}
