/**
 * The outcomes `ThreadService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { Group } from "../group/group.ts";
import { Member } from "../workspace/member/member.ts";
import { Thread } from "./Thread.ts";

/**
 * The thread's title is no longer the one the renamer expected: someone renamed it meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("ThreadService.Changed", {
  threadId: Thread.Id,
}) {}

/**
 * A direct group needs the author and at least one other member.
 *
 * @category errors
 * @since 0.1.0
 */
export class DirectMembersRequired extends Schema.TaggedError<DirectMembersRequired>()(
  "ThreadService.DirectMembersRequired",
  {},
) {}

/**
 * The group is missing, or the actor is not a member of it; the two are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ThreadService.GroupNotFound",
  { groupId: Group.Id },
) {}

/**
 * An agent asked to start a thread; only people start them, and agents' messages come from
 * their turns.
 *
 * @category errors
 * @since 0.1.0
 */
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadService.HumanAuthorRequired",
  { memberId: Member.Id },
) {}

/**
 * The thread is missing, in another workspace, or outside the actor's groups; the three are not
 * told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadService.NotFound", {
  threadId: Thread.Id,
}) {}

/**
 * A member who was to take part cannot: they are missing, inactive, or not in the group.
 *
 * @category errors
 * @since 0.1.0
 */
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadService.ParticipantUnavailable",
  { memberId: Member.Id },
) {}

export * as ThreadErrors from "./ThreadErrors.ts";
