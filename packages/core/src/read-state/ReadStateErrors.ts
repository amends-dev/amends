import { Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as MemberId from "../workspace/MemberId.ts";

/** The outcomes `ReadStateService` reports that a caller can act on; schemas only, for contracts. */
/** The requested position is past the thread's latest recorded activity. */
export class BeyondTimeline extends Schema.TaggedError<BeyondTimeline>()(
  "ReadStateService.BeyondTimeline",
  { threadId: ThreadId.Id, throughSequence: Schema.Int, latestSequence: Schema.Int },
) {}
/** Missing groups and groups the actor does not belong to share this outcome. */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ReadStateService.GroupNotFound",
  { groupId: GroupId.Id },
) {}
/** Only people keep read state; agents' turns track their input progress. */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "ReadStateService.HumanRequired",
  { memberId: MemberId.Id },
) {}
/** Missing, foreign, and inaccessible threads share this outcome. */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ReadStateService.ThreadNotFound",
  { threadId: ThreadId.Id },
) {}
