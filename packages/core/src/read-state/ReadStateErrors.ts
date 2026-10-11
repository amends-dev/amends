/**
 * The outcomes `ReadStateService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as MemberId from "../workspace/MemberId.ts";

/**
 * The requested position is past the thread's latest recorded activity.
 *
 * @category errors
 * @since 0.1.0
 */
export class BeyondTimeline extends Schema.TaggedError<BeyondTimeline>()(
  "ReadStateService.BeyondTimeline",
  { threadId: ThreadId.Id, throughSequence: Schema.Int, latestSequence: Schema.Int },
) {}

/**
 * The group is missing, or the actor is not a member of it; the two are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ReadStateService.GroupNotFound",
  { groupId: GroupId.Id },
) {}

/**
 * The acting member is an agent: only people keep read state, and agents' turns track their input
 * progress.
 *
 * @category errors
 * @since 0.1.0
 */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "ReadStateService.HumanRequired",
  { memberId: MemberId.Id },
) {}

/**
 * The thread is missing, in another workspace, or outside the actor's groups; the three are not
 * told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ReadStateService.ThreadNotFound",
  { threadId: ThreadId.Id },
) {}
