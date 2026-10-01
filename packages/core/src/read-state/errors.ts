import { Schema } from "effect";
import { GroupId } from "../group/id.ts";
import { ThreadId } from "../thread/id.ts";
import { MemberId } from "../workspace/member/id.ts";

/** The outcomes `ReadStateApplication` reports that a caller can act on; schemas only, for contracts. */
/** The requested position is past the thread's latest recorded activity. */
export class BeyondTimeline extends Schema.TaggedError<BeyondTimeline>()(
  "ReadStateApplication.BeyondTimeline",
  { threadId: ThreadId.Id, throughSequence: Schema.Int, latestSequence: Schema.Int },
) {}
/** Missing groups and groups the actor does not belong to share this outcome. */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ReadStateApplication.GroupNotFound",
  { groupId: GroupId.Id },
) {}
/** Only people keep read state; agents' turns track their input progress. */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "ReadStateApplication.HumanRequired",
  { memberId: MemberId.Id },
) {}
/** Missing, foreign, and inaccessible threads share this outcome. */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ReadStateApplication.ThreadNotFound",
  { threadId: ThreadId.Id },
) {}

export * as ReadStateErrors from "./errors.ts";
